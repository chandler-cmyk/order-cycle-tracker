const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const fs        = require('fs');
const crypto    = require('crypto');
const rateLimit = require('express-rate-limit');
const fetch     = (...args) => import('node-fetch').then(({default: f}) => f(...args));
require('dotenv').config();

// Keep in sync with SUB_CUSTOMERS in src/utils.js
const SUB_CUSTOMERS = [
  'J&A Greensboro',
  'S&A Wholesale',
  'M&A Distro',
  'Eagle Wholesale',
  'Quality Distribution',
  'Magical Vapors',
  'High Altitude Wholesale',
  'Sunrise Wholesale',
  'Eagle Highborn',
  'Kali King',
  'Novelty King',
  'Malani Enterprise',
  'TN Smoke',
  'Cryptic Trading',
  'Big Z Distribution',
  'Music City Imports',
  'ARC Wholesale',
  'Down South Distro',
  'Aimrock Distributors',
  'Zee Hot Spot',
  'MDK Family Inc',
  'Wholesale Outlet',
  'MAG Industries',
  'Tri State Distro',
  'BNC Distribution Inc',
  'Skokie Wholesale',
  'Good Price Wholesale',
  'Global Cash & Carry Inc',
  'Loop Distribution',
  'Wiseman Wholesale',
  'Kriaa Wholesale',
  'A2Z Charlotte',
  'AAA Houston',
  'AAA Wholesale Supply',
  'Labib Wilmington',
  'RAM Wholesale',
  'Center Point Distribution',
];

const app = express();
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
app.use(cors(ALLOWED_ORIGIN ? { origin: ALLOWED_ORIGIN } : {}));
app.use(express.json());

const PORT = process.env.PORT || 3001;
const {
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REFRESH_TOKEN,
  ZOHO_ORG_ID,
  SITE_PASSWORD,
} = process.env;

const validTokens = new Set();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, error: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/login', loginLimiter, (req, res) => {
  if (!SITE_PASSWORD) return res.json({ ok: true, token: 'open' });
  const { password } = req.body;
  if (password === SITE_PASSWORD) {
    const token = crypto.randomBytes(32).toString('hex');
    validTokens.add(token);
    res.json({ ok: true, token });
  } else {
    res.status(401).json({ ok: false, error: 'Incorrect password' });
  }
});

app.use('/api', (req, res, next) => {
  if (!SITE_PASSWORD) return next();
  const auth = req.headers.authorization;
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (bearer && validTokens.has(bearer)) return next();
  res.status(401).json({ error: 'Unauthorized' });
});

let cachedToken = null;
let tokenExpiry = null;
let cachedOrders = null;
let ordersCachedAt = null;
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiry && now < tokenExpiry) {
    return cachedToken;
  }

  console.log('🔄 Refreshing Zoho access token...');
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    refresh_token: ZOHO_REFRESH_TOKEN,
  });

  const res = await fetch(`https://accounts.zoho.com/oauth/v2/token`, {
    method: 'POST',
    body: params,
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  }

  cachedToken = data.access_token;
  tokenExpiry = now + (data.expires_in - 60) * 1000; // refresh 60s early
  console.log('✅ Token refreshed successfully');
  return cachedToken;
}

async function fetchAllOrders(token) {
  let allOrders = [];
  let page = 1;
  let hasMore = true;

  // Only fetch last 18 months — enough for cycle tracking and churn scoring,
  // while dramatically reducing page count and enrichment scope.
  const fromDate = new Date();
  fromDate.setMonth(fromDate.getMonth() - 18);
  const fromDateStr = fromDate.toISOString().slice(0, 10); // YYYY-MM-DD

  while (hasMore && page <= 15) {
    const url = new URL('https://www.zohoapis.com/inventory/v1/salesorders');
    url.searchParams.set('organization_id', ZOHO_ORG_ID);
    url.searchParams.set('per_page', '200');
    url.searchParams.set('page', page);
    url.searchParams.set('sort_column', 'date');
    url.searchParams.set('sort_order', 'D');
    url.searchParams.set('date_after', fromDateStr);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    if (!res.ok) throw new Error(`Zoho API error: ${res.status}`);
    const data = await res.json();
    const orders = data.salesorders || [];
    allOrders = [...allOrders, ...orders];
    hasMore = data.page_context?.has_more_page || false;
    page++;
    console.log(`📦 Loaded page ${page - 1}: ${orders.length} orders (total: ${allOrders.length})`);
  }

  return allOrders;
}

// Fetch a single order detail, retrying on 429 with exponential backoff.
async function fetchOrderDetail(salesorderId, token, retries = 4) {
  const url = `https://www.zohoapis.com/inventory/v1/salesorders/${salesorderId}?organization_id=${ZOHO_ORG_ID}`;
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status !== 429) return res;
    const wait = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, 8s
    console.warn(`  ⏳ 429 on ${salesorderId}, waiting ${wait}ms (attempt ${attempt + 1}/${retries})...`);
    await new Promise((r) => setTimeout(r, wait));
  }
  return null; // exhausted retries
}

// Fetch line_items only for the most recent orders per customer —
// that's all we need for per-SKU tracking and churn signals.
async function enrichOrdersWithLineItems(orders, token) {
  const BATCH_SIZE = 20;

  // Group order indices by customer, sorted newest-first
  const byCustomer = {};
  orders.forEach((o, idx) => {
    if (!byCustomer[o.customer_id]) byCustomer[o.customer_id] = [];
    byCustomer[o.customer_id].push({ date: o.date, idx });
  });

  const toEnrichSet = new Set();

  // Top 5 most recent orders per customer (for parent customer SKU data)
  Object.values(byCustomer).forEach((entries) => {
    entries.sort((a, b) => (a.date < b.date ? 1 : -1));
    entries.slice(0, 5).forEach(({ idx }) => toEnrichSet.add(idx));
  });

  // Top 3 most recent orders per sub-customer reference match
  // (these may fall outside the parent's top 5)
  const subLower = SUB_CUSTOMERS.map((s) => s.toLowerCase());
  const bySubCustomer = {};
  orders.forEach((o, idx) => {
    const ref = (o.reference_number || '').toLowerCase();
    if (!ref) return;
    const match = subLower.find((s) => ref.includes(s));
    if (match) {
      if (!bySubCustomer[match]) bySubCustomer[match] = [];
      bySubCustomer[match].push({ date: o.date, idx });
    }
  });
  Object.values(bySubCustomer).forEach((entries) => {
    entries.sort((a, b) => (a.date < b.date ? 1 : -1));
    entries.slice(0, 3).forEach(({ idx }) => toEnrichSet.add(idx));
  });

  const toEnrich = Array.from(toEnrichSet);

  const enriched = [...orders];
  let successCount = 0;
  let failCount = 0;
  console.log(`🔍 Fetching line items for ${toEnrich.length} orders (batch ${BATCH_SIZE}, 200ms delay, 429-retry enabled)...`);

  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    const batch = toEnrich.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (orderIdx) => {
      const order = enriched[orderIdx];
      try {
        const res = await fetchOrderDetail(order.salesorder_id, token);
        if (!res) {
          console.warn(`  ❌ Order ${order.salesorder_id} exhausted retries (429)`);
          failCount++;
          return;
        }
        if (!res.ok) {
          console.warn(`  ⚠️ Order ${order.salesorder_id} returned ${res.status}`);
          failCount++;
          return;
        }
        const data = await res.json();
        if (data.salesorder && Array.isArray(data.salesorder.line_items)) {
          enriched[orderIdx].line_items = data.salesorder.line_items;
          if (data.salesorder.line_items.length === 0) {
            console.warn(`  ⚠️ Order ${order.salesorder_id} has 0 line items`);
          }
          successCount++;
        } else {
          console.warn(`  ⚠️ Order ${order.salesorder_id} missing line_items in response`);
          failCount++;
        }
      } catch (e) {
        console.error(`  ❌ Order ${order.salesorder_id} fetch error: ${e.message}`);
        failCount++;
      }
    }));
    // Delay between batches to stay within Zoho rate limits
    if (i + BATCH_SIZE < toEnrich.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log(`✅ Enrichment done: ${successCount} succeeded, ${failCount} failed`);
  return enriched;
}

// GET /api/token — returns a fresh access token to the frontend
app.get('/api/token', async (req, res) => {
  try {
    const token = await getAccessToken();
    res.json({ access_token: token });
  } catch (e) {
    console.error('Token error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/orders — returns all orders, cached for 30 minutes
app.get('/api/orders', async (req, res) => {
  const missing = ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ORG_ID']
    .filter((k) => !process.env[k]);
  if (missing.length) {
    return res.status(500).json({ error: `Missing environment variables: ${missing.join(', ')}` });
  }
  try {
    const now = Date.now();
    const forceRefresh = req.query.refresh === 'true';

    if (!forceRefresh && cachedOrders && ordersCachedAt && (now - ordersCachedAt) < CACHE_DURATION_MS) {
      console.log('📋 Serving cached orders');
      return res.json({ orders: cachedOrders, cached: true, cachedAt: ordersCachedAt });
    }

    const token = await getAccessToken();
    console.log('🌐 Fetching fresh orders from Zoho (last 18 months)...');
    const orders = await fetchAllOrders(token);
    const enriched = await enrichOrdersWithLineItems(orders, token);
    cachedOrders = enriched;
    ordersCachedAt = now;
    res.json({ orders: enriched, cached: false, cachedAt: ordersCachedAt });
  } catch (e) {
    console.error('Orders error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/debug — returns first cached order to inspect field names
app.get('/api/debug', (req, res) => {
  if (!cachedOrders || cachedOrders.length === 0) {
    return res.json({ error: 'No cached orders yet. Hit /api/orders first.' });
  }
  const sample = cachedOrders[0];
  res.json({
    fields: Object.keys(sample),
    total: sample.total,
    total_amount: sample.total_amount,
    bcy_total: sample.bcy_total,
    sub_total: sample.sub_total,
    line_items_count: (sample.line_items || []).length,
    line_items_sample: (sample.line_items || []).slice(0, 1),
  });
});

// GET /api/debug/sample-order — fetches one order's full line item for field inspection
app.get('/api/debug/sample-order', async (req, res) => {
  try {
    const token = await getAccessToken();
    const url = new URL('https://www.zohoapis.com/inventory/v1/salesorders');
    url.searchParams.set('organization_id', ZOHO_ORG_ID);
    url.searchParams.set('per_page', '1');
    url.searchParams.set('page', '1');
    const result = await fetch(url.toString(), {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    const data = await result.json();
    const order = data.salesorders?.[0];
    if (!order) return res.json({ error: 'No orders found' });
    const detailUrl = `https://www.zohoapis.com/inventory/v1/salesorders/${order.salesorder_id}?organization_id=${ZOHO_ORG_ID}`;
    const detailRes = await fetch(detailUrl, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    const detailData = await detailRes.json();
    res.json(detailData.salesorder?.line_items?.[0] || { error: 'No line items found' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/status — health check
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    tokenCached: !!cachedToken,
    ordersCached: !!cachedOrders,
    orderCount: cachedOrders?.length || 0,
    cacheAge: ordersCachedAt ? Math.round((Date.now() - ordersCachedAt) / 60000) + ' min' : 'none',
  });
});

const buildPath = path.join(__dirname, 'build');

console.log(`📁 Build folder exists: ${fs.existsSync(buildPath)}`);
console.log(`📁 Build path: ${buildPath}`);

if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  app.get('/{*path}', (req, res) => {
    res.status(200).send(`
      <h2>Server is running but React build is missing.</h2>
      <p>Build path checked: ${buildPath}</p>
      <p>Run npm run build to generate the build folder.</p>
      <p><a href="/api/status">Check API status</a></p>
    `);
  });
}

app.listen(PORT, () => {
  console.log(`\n🚀 Order Cycle Tracker server running on http://localhost:${PORT}`);
  console.log(`   Token auto-refresh: ✅ enabled`);
  console.log(`   Order cache: 30 minutes\n`);
});
