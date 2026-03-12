const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const {
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REFRESH_TOKEN,
  ZOHO_ORG_ID,
} = process.env;

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

  while (hasMore && page <= 15) {
    const url = new URL('https://www.zohoapis.com/inventory/v1/salesorders');
    url.searchParams.set('organization_id', ZOHO_ORG_ID);
    url.searchParams.set('per_page', '200');
    url.searchParams.set('page', page);
    url.searchParams.set('sort_column', 'date');
    url.searchParams.set('sort_order', 'D');

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
    console.log('🌐 Fetching fresh orders from Zoho...');
    const orders = await fetchAllOrders(token);
    cachedOrders = orders;
    ordersCachedAt = now;
    res.json({ orders, cached: false, cachedAt: ordersCachedAt });
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
