const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const {
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REFRESH_TOKEN,
  ZOHO_ORG_ID,
} = process.env;

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

const INACTIVE_DAYS = 180;
const CACHE_DURATION_MS = 30 * 60 * 1000;

let cachedToken = null;
let tokenExpiry = null;
let cachedCycles = null;
let cyclesCachedAt = null;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiry && now < tokenExpiry) return cachedToken;

  console.log('🔄 [order-cycles] Refreshing Zoho access token...');
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    refresh_token: ZOHO_REFRESH_TOKEN,
  });
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', { method: 'POST', body: params });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  cachedToken = data.access_token;
  tokenExpiry = now + (data.expires_in - 60) * 1000;
  console.log('✅ [order-cycles] Token refreshed');
  return cachedToken;
}

async function fetchAllOrders(token) {
  const fromDate = new Date();
  fromDate.setMonth(fromDate.getMonth() - 18);
  const fromDateStr = fromDate.toISOString().slice(0, 10);

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
    url.searchParams.set('date_after', fromDateStr);

    const res = await fetch(url.toString(), { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    if (!res.ok) throw new Error(`Zoho API error: ${res.status}`);
    const data = await res.json();
    const orders = data.salesorders || [];
    allOrders = [...allOrders, ...orders];
    hasMore = data.page_context?.has_more_page || false;
    console.log(`📦 [order-cycles] Page ${page}: ${orders.length} orders (total: ${allOrders.length})`);
    page++;
  }
  return allOrders;
}

async function fetchOrderDetail(salesorderId, token, retries = 4) {
  const url = `https://www.zohoapis.com/inventory/v1/salesorders/${salesorderId}?organization_id=${ZOHO_ORG_ID}`;
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status !== 429) return res;
    const wait = 1000 * Math.pow(2, attempt);
    console.warn(`  ⏳ [order-cycles] 429 on ${salesorderId}, waiting ${wait}ms...`);
    await new Promise(r => setTimeout(r, wait));
  }
  return null;
}

async function enrichOrdersWithLineItems(orders, token) {
  const BATCH_SIZE = 20;
  const subLower = SUB_CUSTOMERS.map(s => s.toLowerCase());

  const byCustomer = {};
  orders.forEach((o, idx) => {
    if (!byCustomer[o.customer_id]) byCustomer[o.customer_id] = [];
    byCustomer[o.customer_id].push({ date: o.date, idx });
  });

  const toEnrichSet = new Set();
  Object.values(byCustomer).forEach(entries => {
    entries.sort((a, b) => (a.date < b.date ? 1 : -1));
    entries.slice(0, 5).forEach(({ idx }) => toEnrichSet.add(idx));
  });

  const bySubCustomer = {};
  orders.forEach((o, idx) => {
    const ref = (o.reference_number || '').toLowerCase();
    if (!ref) return;
    const match = subLower.find(s => ref.includes(s));
    if (match) {
      if (!bySubCustomer[match]) bySubCustomer[match] = [];
      bySubCustomer[match].push({ date: o.date, idx });
    }
  });
  Object.values(bySubCustomer).forEach(entries => {
    entries.sort((a, b) => (a.date < b.date ? 1 : -1));
    entries.slice(0, 3).forEach(({ idx }) => toEnrichSet.add(idx));
  });

  const toEnrich = Array.from(toEnrichSet);
  const enriched = [...orders];
  let successCount = 0;
  let failCount = 0;
  console.log(`🔍 [order-cycles] Enriching ${toEnrich.length} orders with line items...`);

  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    const batch = toEnrich.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async orderIdx => {
      const order = enriched[orderIdx];
      try {
        const res = await fetchOrderDetail(order.salesorder_id, token);
        if (!res) { failCount++; return; }
        if (!res.ok) { failCount++; return; }
        const data = await res.json();
        if (data.salesorder && Array.isArray(data.salesorder.line_items)) {
          enriched[orderIdx].line_items = data.salesorder.line_items;
          successCount++;
        } else {
          failCount++;
        }
      } catch (e) {
        console.error(`  ❌ [order-cycles] Order ${order.salesorder_id}: ${e.message}`);
        failCount++;
      }
    }));
    if (i + BATCH_SIZE < toEnrich.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  console.log(`✅ [order-cycles] Enrichment done: ${successCount} ok, ${failCount} failed`);
  return enriched;
}

function buildSkuStats(sku) {
  const sorted = sku.orders.slice().sort((a, b) => a.date - b.date);
  const lastOrderDate = sorted[sorted.length - 1]?.date || null;

  let avgCadenceDays = null;
  if (sorted.length >= 2) {
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i].date - sorted[i - 1].date) / 86400000);
    }
    avgCadenceDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }

  const nextExpected = lastOrderDate && avgCadenceDays
    ? new Date(lastOrderDate.getTime() + avgCadenceDays * 86400000) : null;

  const today = new Date();
  const daysOverdue = nextExpected && nextExpected < today
    ? Math.round((today - nextExpected) / 86400000) : null;
  const daysUntilNext = nextExpected && nextExpected >= today
    ? Math.round((nextExpected - today) / 86400000) : null;
  const daysSinceLastOrder = lastOrderDate
    ? Math.round((today - lastOrderDate) / 86400000) : null;

  let cycleStatus = 'new_customer';
  if (daysSinceLastOrder != null && daysSinceLastOrder >= INACTIVE_DAYS) {
    cycleStatus = 'inactive';
  } else if (lastOrderDate && avgCadenceDays) {
    if (daysOverdue != null) cycleStatus = 'overdue';
    else if (daysUntilNext != null && daysUntilNext <= 7) cycleStatus = 'due_soon';
    else cycleStatus = 'on_track';
  }

  const last3 = sorted.slice(-3);
  const avgQty = last3.length > 0
    ? Math.round(last3.reduce((s, o) => s + o.qty, 0) / last3.length) : null;

  return {
    name: sku.name, orderCount: sorted.length, lastOrderDate, avgCadenceDays,
    nextExpected, daysOverdue, daysUntilNext, daysSinceLastOrder, cycleStatus, avgQty,
  };
}

function buildCustomerStats(c) {
  const sorted = c.orders.sort((a, b) => a.date - b.date);
  const lastOrder = sorted[sorted.length - 1];
  const lastOrderDate = lastOrder?.date || null;

  let avgCadenceDays = null;
  if (sorted.length >= 2) {
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i].date - sorted[i - 1].date) / 86400000);
    }
    avgCadenceDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }

  const nextExpected = lastOrderDate && avgCadenceDays
    ? new Date(lastOrderDate.getTime() + avgCadenceDays * 86400000) : null;

  const today = new Date();
  const daysOverdue = nextExpected && nextExpected < today
    ? Math.round((today - nextExpected) / 86400000) : null;
  const daysUntilNext = nextExpected && nextExpected >= today
    ? Math.round((nextExpected - today) / 86400000) : null;
  const daysSinceLastOrder = lastOrderDate
    ? Math.round((today - lastOrderDate) / 86400000) : null;

  let cycleStatus = 'new_customer';
  if (daysSinceLastOrder != null && daysSinceLastOrder >= INACTIVE_DAYS) {
    cycleStatus = 'inactive';
  } else if (lastOrderDate && avgCadenceDays) {
    if (daysOverdue != null) cycleStatus = 'overdue';
    else if (daysUntilNext != null && daysUntilNext <= 7) cycleStatus = 'due_soon';
    else cycleStatus = 'on_track';
  }

  const last3 = sorted.slice(-3);
  const estOrderValue = last3.length > 0
    ? Math.round(last3.reduce((s, o) => s + o.value, 0) / last3.length * 100) / 100 : null;
  const estOrderQty = last3.length > 0
    ? Math.round(last3.reduce((s, o) => s + o.qty, 0) / last3.length) : null;

  let churnScore = 0;
  let churnRisk = 'Low';

  if (cycleStatus === 'inactive') {
    churnScore = 100;
    churnRisk = 'High';
  } else {
    let overdueScore = 0;
    if (daysOverdue != null && avgCadenceDays) {
      overdueScore = Math.min(daysOverdue / avgCadenceDays, 1);
    }

    let freqTrendScore = 0;
    if (sorted.length >= 4) {
      const allGaps = [];
      for (let i = 1; i < sorted.length; i++) {
        allGaps.push((sorted[i].date - sorted[i - 1].date) / 86400000);
      }
      const avgAllGap = allGaps.reduce((a, b) => a + b, 0) / allGaps.length;
      const recentGaps = allGaps.slice(-2);
      const avgRecentGap = recentGaps.reduce((a, b) => a + b, 0) / recentGaps.length;
      if (avgAllGap > 0) {
        const pctIncrease = (avgRecentGap - avgAllGap) / avgAllGap;
        if (pctIncrease > 0.20) {
          freqTrendScore = Math.min((pctIncrease - 0.20) / 0.30, 1);
        }
      }
    } else if (sorted.length < 3) {
      freqTrendScore = 0.5;
    }

    let sizeTrendScore = 0;
    if (sorted.length >= 2) {
      const allAvgValue = sorted.reduce((s, o) => s + o.value, 0) / sorted.length;
      const recentAvgValue = last3.reduce((s, o) => s + o.value, 0) / last3.length;
      if (allAvgValue > 0) {
        const pctDrop = (allAvgValue - recentAvgValue) / allAvgValue;
        if (pctDrop > 0.15) {
          sizeTrendScore = Math.min((pctDrop - 0.15) / 0.25, 1);
        }
      }
    }

    const orderCountScore = sorted.length === 0 ? 1
      : sorted.length <= 2 ? 0.8
      : sorted.length <= 4 ? 0.4
      : 0;

    let recencyScore = 0;
    if (daysSinceLastOrder != null && avgCadenceDays) {
      recencyScore = Math.min(daysSinceLastOrder / (avgCadenceDays * 1.5), 1);
    }

    const rawScore =
      overdueScore    * 30 +
      freqTrendScore  * 25 +
      sizeTrendScore  * 25 +
      orderCountScore * 10 +
      recencyScore    * 10;

    const loyaltyBonus = sorted.length >= 20 ? 18
      : sorted.length >= 15 ? 12
      : sorted.length >= 10 ? 8
      : 0;

    churnScore = Math.max(Math.round(rawScore - loyaltyBonus), 0);
    churnRisk = churnScore >= 67 ? 'High' : churnScore >= 34 ? 'Medium' : 'Low';
  }

  const skus = Object.values(c.skuMap || {}).map(buildSkuStats);

  return {
    id: c.id, name: c.name, orderCount: sorted.length, lastOrderDate,
    avgCadenceDays, nextExpected, daysOverdue, daysUntilNext,
    daysSinceLastOrder, totalValue: c.totalValue,
    lastOrderStatus: lastOrder?.status || '', cycleStatus,
    estOrderValue, estOrderQty,
    isSubCustomer: c.isSubCustomer || false,
    viaCustomer: c.viaCustomer || null,
    churnScore, churnRisk,
    skus,
  };
}

function processOrders(salesOrders) {
  const customerMap = {};
  const subCustomerMap = {};
  const subLower = SUB_CUSTOMERS.map(s => ({ canonical: s, lower: s.toLowerCase() }));

  salesOrders.forEach(order => {
    const id = order.customer_id;
    const name = order.customer_name;
    const date = new Date(order.date + 'T00:00:00');
    const value = parseFloat(order.total) || 0;
    const qty = parseFloat(order.quantity) || 0;
    const ref = (order.reference_number || '').toLowerCase();

    const lineItems = (order.line_items || []).map(li => ({
      name: li.name || li.item_name || 'Unknown',
      qty: parseFloat(li.quantity) || 0,
      value: parseFloat(li.item_total) || (parseFloat(li.quantity || 0) * parseFloat(li.rate || 0)) || 0,
    }));
    const skuNames = lineItems.map(li => li.name);

    if (!customerMap[id]) {
      customerMap[id] = { id, name, orders: [], totalValue: 0, skuMap: {} };
    }
    customerMap[id].orders.push({ date, value, qty, items: skuNames, status: order.order_status });
    customerMap[id].totalValue += value;

    lineItems.forEach(li => {
      if (!customerMap[id].skuMap[li.name]) {
        customerMap[id].skuMap[li.name] = { name: li.name, orders: [] };
      }
      customerMap[id].skuMap[li.name].orders.push({ date, qty: li.qty, value: li.value });
    });

    if (ref) {
      const match = subLower.find(s => ref.includes(s.lower));
      if (match) {
        const subId = `sub_${match.lower}`;
        if (!subCustomerMap[subId]) {
          subCustomerMap[subId] = {
            id: subId, name: match.canonical, orders: [], totalValue: 0,
            skuMap: {}, isSubCustomer: true, viaCustomer: name,
          };
        }
        subCustomerMap[subId].orders.push({ date, value, qty, items: skuNames, status: order.order_status });
        subCustomerMap[subId].totalValue += value;

        lineItems.forEach(li => {
          if (!subCustomerMap[subId].skuMap[li.name]) {
            subCustomerMap[subId].skuMap[li.name] = { name: li.name, orders: [] };
          }
          subCustomerMap[subId].skuMap[li.name].orders.push({ date, qty: li.qty, value: li.value });
        });
      }
    }
  });

  const regularCustomers = Object.values(customerMap).map(buildCustomerStats);
  const subCustomers = Object.values(subCustomerMap).map(buildCustomerStats);
  return [...regularCustomers, ...subCustomers];
}

async function getOrderCycles({ bypassCache = false } = {}) {
  const missing = ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ORG_ID']
    .filter(k => !process.env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);

  const now = Date.now();
  if (!bypassCache && cachedCycles && cyclesCachedAt && (now - cyclesCachedAt) < CACHE_DURATION_MS) {
    return { customers: cachedCycles, cachedAt: cyclesCachedAt, cached: true };
  }

  const token = await getAccessToken();
  console.log('🌐 [order-cycles] Fetching fresh orders from Zoho (last 18 months)...');
  const orders = await fetchAllOrders(token);
  const enriched = await enrichOrdersWithLineItems(orders, token);
  cachedCycles = processOrders(enriched);
  cyclesCachedAt = now;
  return { customers: cachedCycles, cachedAt: cyclesCachedAt, cached: false };
}

module.exports = { getOrderCycles };
