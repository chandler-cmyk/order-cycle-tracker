const express = require('express');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = 3030;
const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID } = process.env;

// ── Token cache ──────────────────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiry && now < tokenExpiry) return cachedToken;

  console.log('🔄 Refreshing Zoho access token...');
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    refresh_token: ZOHO_REFRESH_TOKEN,
  });

  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    body: params,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);

  cachedToken = data.access_token;
  tokenExpiry = now + (data.expires_in - 60) * 1000;
  console.log('✅ Token refreshed');
  return cachedToken;
}

// ── Inventory cache ──────────────────────────────────────────────────────────
let cachedInventory = null;
let inventoryCachedAt = null;
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// ── Category definitions ─────────────────────────────────────────────────────
const CATEGORIES = [
  'THCA Prerolls',
  'THCA Blunts',
  'THCA Mini Prerolls',
  'LUNCHBOXX Prerolls',
  'LUNCHBOXX Hash Hole Prerolls',
];

/**
 * Determine which of the five categories an item belongs to.
 * Checks category_name field first, then falls back to item name parsing.
 * Returns null for items that don't belong to any tracked category.
 */
function detectCategory(item) {
  const catField = (item.category_name || '').trim();
  const name = (item.item_name || item.name || '').toLowerCase();

  // Exact match on Zoho category field
  for (const cat of CATEGORIES) {
    if (catField.toLowerCase() === cat.toLowerCase()) return cat;
  }

  // Name-based fallback (order matters — more specific checks first)
  if (name.includes('hash hole')) return 'LUNCHBOXX Hash Hole Prerolls';
  if (name.includes('lunchboxx') || name.includes('lunch boxx')) return 'LUNCHBOXX Prerolls';
  if ((name.includes('mini')) && (name.includes('preroll') || name.includes('pre-roll'))) return 'THCA Mini Prerolls';
  if (name.includes('blunt')) return 'THCA Blunts';
  if (name.includes('preroll') || name.includes('pre-roll') || name.includes('pre roll')) return 'THCA Prerolls';

  return null;
}

/**
 * Parse a Zoho item name into flavor (with brand prefix) and strain.
 *
 * Name format: "Brand - Product Descriptor - Flavor - Strain"
 * Examples:
 *   "Lazy Jane - THCA Preroll Box 10 ct - Afternoon Delight - Hybrid"
 *     → flavor: "Lazy Jane - Afternoon Delight", strain: "Hybrid"
 *   "LUNCHBOXX - THCA Hash Hole Preroll Box 20 ct - Berry Pie"
 *     → flavor: "Berry Pie", strain: null   (LUNCHBOXX is the category, not a sub-brand)
 *
 * Rules:
 *   - Split on " - "
 *   - If last segment is a strain word, pop it off
 *   - The segment before the strain (or the last segment) is the flavor
 *   - If there is a segment before the product descriptor that is NOT a known
 *     category keyword, treat it as a brand and prepend it to the flavor
 */
function parseItemName(itemName) {
  const STRAINS = new Set(['sativa', 'indica', 'hybrid']);
  // Keywords that identify a segment as a product descriptor, not a brand
  const DESCRIPTOR_KEYWORDS = ['thca', 'preroll', 'pre-roll', 'blunt', 'hash hole', 'lunchboxx', 'box', 'pack', 'mini'];

  const parts = itemName.split(' - ').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return { flavor: itemName, strain: null };

  let strain = null;
  if (STRAINS.has(parts[parts.length - 1].toLowerCase())) {
    const raw = parts.pop();
    strain = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }

  // Last remaining part is the flavor
  const flavorPart = parts[parts.length - 1] || itemName;

  // Check if parts[0] looks like a brand (not a product descriptor, not the flavor itself)
  let brand = null;
  if (parts.length >= 3) {
    const firstLower = parts[0].toLowerCase();
    const isDescriptor = DESCRIPTOR_KEYWORDS.some(k => firstLower.includes(k));
    if (!isDescriptor) brand = parts[0];
  }

  const flavor = brand ? `${brand} - ${flavorPart}` : flavorPart;
  return { flavor, strain };
}

// ── Zoho API helpers ─────────────────────────────────────────────────────────

/** Fetch the category_id for "Finished Products" so we can filter items server-side. */
async function fetchFinishedProductsCategoryId(token) {
  const url = new URL('https://www.zohoapis.com/inventory/v1/categories');
  url.searchParams.set('organization_id', ZOHO_ORG_ID);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!res.ok) {
    console.warn(`⚠️  Could not fetch categories (${res.status}), will fetch all items instead`);
    return null;
  }
  const data = await res.json();
  const categories = data.categories || [];
  const match = categories.find(c => c.name?.toLowerCase() === 'finished products');
  if (match) {
    console.log(`✅ Found "Finished Products" category — id: ${match.category_id}`);
    return match.category_id;
  }
  console.warn('⚠️  "Finished Products" category not found — will fetch all items');
  return null;
}

async function fetchAllItems(token, categoryId = null) {
  let allItems = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = new URL('https://www.zohoapis.com/inventory/v1/items');
    url.searchParams.set('organization_id', ZOHO_ORG_ID);
    url.searchParams.set('per_page', '200');
    url.searchParams.set('page', String(page));
    if (categoryId) url.searchParams.set('category_id', categoryId);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    if (!res.ok) throw new Error(`Zoho items API error: ${res.status}`);

    const data = await res.json();
    const items = data.items || [];
    allItems = [...allItems, ...items];
    hasMore = data.page_context?.has_more_page || false;
    console.log(`📦 Items page ${page}: ${items.length} items (total: ${allItems.length})`);
    page++;

    if (hasMore) await new Promise(r => setTimeout(r, 250));
  }

  return allItems;
}

async function fetchItemDetail(itemId, token, retries = 3) {
  const url = `https://www.zohoapis.com/inventory/v1/items/${itemId}?organization_id=${ZOHO_ORG_ID}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    if (res.status === 429) {
      const wait = 1000 * Math.pow(2, attempt);
      console.warn(`  ⏳ 429 on item ${itemId}, waiting ${wait}ms...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) return null;
    const data = await res.json();
    return data.item || null;
  }
  return null;
}

// ── Core inventory builder ───────────────────────────────────────────────────
async function buildInventory() {
  const token = await getAccessToken();
  const categoryId = await fetchFinishedProductsCategoryId(token);
  const allItems = await fetchAllItems(token, categoryId);

  // Filter to our five display categories first so we only detail-fetch matched items
  const filtered = allItems
    .map(item => ({ item, category: detectCategory(item) }))
    .filter(({ category }) => category !== null);

  console.log(`✅ ${filtered.length} matched items — fetching warehouse detail for stock on hand...`);

  // Fetch detail in batches of 5 with 250ms delay to get accurate warehouse stock
  const BATCH_SIZE = 5;
  const results = [];

  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    const batch = filtered.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(batch.map(async ({ item, category }) => {
      const rawName = item.item_name || item.name || '';
      const { flavor } = parseItemName(rawName);

      // Prefer the structured "Strain Type" tag; fall back to name parsing
      const strainTag = (item.tags || []).find(t => t.tag_name === 'Strain Type');
      const strain = strainTag?.tag_option_name || parseItemName(rawName).strain || null;

      // Sum warehouse_stock_on_hand across all warehouses — best available
      // approximation from the Zoho API (batch detail endpoint not accessible)
      const detail = await fetchItemDetail(item.item_id, token);
      let quantity = 0;

      if (detail && (detail.warehouses || []).length > 0) {
        quantity = detail.warehouses.reduce((sum, w) => sum + (parseFloat(w.warehouse_stock_on_hand) || 0), 0);
      } else {
        quantity = parseFloat(item.actual_available_stock ?? item.available_stock ?? 0);
      }

      return {
        item_id: item.item_id,
        sku: item.sku || '',
        name: rawName,
        category,
        flavor,
        strain,
        quantity: Math.max(0, Math.round(quantity)),
      };
    }));

    results.push(...batchResults);
    if (i + BATCH_SIZE < filtered.length) {
      await new Promise(r => setTimeout(r, 250));
    }
  }

  console.log(`✅ ${results.length} items processed`);

  // Group by category, sorted alphabetically by flavor within each
  const byCategory = {};
  for (const cat of CATEGORIES) {
    byCategory[cat] = results
      .filter(r => r.category === cat)
      .sort((a, b) => a.flavor.localeCompare(b.flavor));
  }

  return byCategory;
}

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'inventory.html'));
});

app.get('/api/inventory', async (req, res) => {
  const missing = ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ORG_ID']
    .filter(k => !process.env[k]);
  if (missing.length) {
    return res.status(500).json({ error: `Missing env vars: ${missing.join(', ')}` });
  }

  try {
    const now = Date.now();
    const forceRefresh = req.query.refresh === 'true';

    if (!forceRefresh && cachedInventory && inventoryCachedAt && (now - inventoryCachedAt) < CACHE_DURATION_MS) {
      console.log('📋 Serving cached inventory');
      return res.json({ data: cachedInventory, cached: true, cachedAt: inventoryCachedAt });
    }

    console.log('🌐 Fetching fresh inventory from Zoho...');
    const data = await buildInventory();
    cachedInventory = data;
    inventoryCachedAt = Date.now();

    res.json({ data, cached: false, cachedAt: inventoryCachedAt });
  } catch (e) {
    console.error('❌ Inventory error:', e.message);
    res.status(500).json({ error: e.message });
  }
});


// Serve on all interfaces so other machines on the LAN can reach it
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Finished Goods Inventory server`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://<your-local-IP>:${PORT}`);
  console.log(`   Cache:   10 minutes\n`);
});
