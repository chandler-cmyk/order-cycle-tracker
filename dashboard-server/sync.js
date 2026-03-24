const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('./db');
const { inferBrandCategory } = require('./categorize');

const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID } = process.env;
const BASE = 'https://www.zohoapis.com/inventory/v1';
const REQUEST_DELAY_MS = 700; // 700ms between each sequential detail fetch → ~85 req/min

// ── State ──────────────────────────────────────────────────────────────────────
const syncState = {
  syncing: false,
  progress: '',
  lastSync: null,
  invoiceCount: 0,
  lineItemCount: 0,
  error: null,
};

// Load last sync time from DB on startup
try {
  const row = db.prepare(`SELECT value FROM sync_meta WHERE key = 'last_sync_time'`).get();
  if (row) syncState.lastSync = row.value;
  const ic = db.prepare(`SELECT COUNT(*) as c FROM invoices`).get();
  const lc = db.prepare(`SELECT COUNT(*) as c FROM line_items`).get();
  syncState.invoiceCount = ic?.c || 0;
  syncState.lineItemCount = lc?.c || 0;
} catch (_) {}

// ── Zoho auth ──────────────────────────────────────────────────────────────────
let _cachedToken = null;
let _tokenExpiry = null;

async function getAccessToken() {
  const now = Date.now();
  if (_cachedToken && _tokenExpiry && now < _tokenExpiry) return _cachedToken;
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    refresh_token: ZOHO_REFRESH_TOKEN,
  });
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', { method: 'POST', body: params });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  _cachedToken = data.access_token;
  _tokenExpiry = now + (data.expires_in - 60) * 1000;
  return _cachedToken;
}

// ── State name normalization ───────────────────────────────────────────────────
const STATE_ABBR = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};
const VALID_ABBRS = new Set(Object.values(STATE_ABBR));

function normalizeState(raw) {
  if (!raw) return '';
  const s = raw.trim();
  if (VALID_ABBRS.has(s.toUpperCase())) return s.toUpperCase();
  return STATE_ABBR[s] || STATE_ABBR[s.replace(/\b\w/g, c => c.toUpperCase())] || s;
}

// Known item name misspellings → canonical names (keep in sync with dashboard-server.js)
const NAME_CORRECTIONS = {
  'Mashmallow OG':   'Marshmallow OG',
  'Orangle Slushie': 'Orange Slushie',
};
function correctItemName(name) {
  if (!name) return name;
  let result = name;
  for (const [wrong, right] of Object.entries(NAME_CORRECTIONS)) {
    result = result.replace(wrong, right);
  }
  return result;
}

// Brand/category derived from item name via shared categorize.js

// ── Fetch helpers ──────────────────────────────────────────────────────────────
async function fetchWithRetry(url, headers, retries = 6) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status !== 429) return res;
    // Always wait at least 60s on a 429 — the API bucket needs time to refill
    const wait = 60000;
    console.warn(`  ⏳ 429 — waiting 60s before retry ${attempt + 1}/${retries}...`);
    await new Promise(r => setTimeout(r, wait));
  }
  return null;
}

// Zoho requires last_modified_time in "YYYY-MM-DDTHH:mm:ss+0000" format
function toZohoTimestamp(isoString) {
  const d = new Date(isoString);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
         `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+0000`;
}

async function fetchInvoicePage(token, page, lastModifiedTime) {
  const url = new URL(`${BASE}/invoices`);
  url.searchParams.set('organization_id', ZOHO_ORG_ID);
  url.searchParams.set('per_page', '200');
  url.searchParams.set('page', String(page));
  if (lastModifiedTime) url.searchParams.set('last_modified_time', toZohoTimestamp(lastModifiedTime));
  console.log(`  🌐 Invoice list URL: ${url.toString()}`);
  const res = await fetchWithRetry(url.toString(), { Authorization: `Zoho-oauthtoken ${token}` });
  if (!res || !res.ok) {
    let body = '';
    try { body = await res.text(); } catch (_) {}
    throw new Error(`Invoice list fetch failed (page ${page}): ${res?.status} — ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchInvoiceDetail(token, invoiceId) {
  const url = `${BASE}/invoices/${invoiceId}?organization_id=${ZOHO_ORG_ID}`;
  const res = await fetchWithRetry(url, { Authorization: `Zoho-oauthtoken ${token}` });
  if (!res || !res.ok) {
    console.warn(`  ⚠️  Invoice ${invoiceId} detail fetch failed: ${res?.status}`);
    return null;
  }
  return res.json();
}

// ── DB upsert (within a transaction) ──────────────────────────────────────────
const _upsertInvoice = db.prepare(`
  INSERT OR REPLACE INTO invoices
    (invoice_id, invoice_number, customer_id, customer_name, date, status, shipping_state, last_modified_time)
  VALUES (?,?,?,?,?,?,?,?)
`);
const _deleteLineItems = db.prepare(`DELETE FROM line_items WHERE invoice_id = ?`);
const _insertLineItem  = db.prepare(`
  INSERT INTO line_items (invoice_id, item_id, sku, name, brand, category, quantity, item_total)
  VALUES (?,?,?,?,?,?,?,?)
`);
const _upsertCustomer = db.prepare(`
  INSERT OR REPLACE INTO customers (customer_id, customer_name)
  VALUES (?,?)
`);

const _saveInvoiceTx = db.transaction((inv, lineItems) => {
  _upsertInvoice.run(
    inv.invoice_id, inv.invoice_number, inv.customer_id, inv.customer_name,
    inv.date, inv.status, inv.shipping_state, inv.last_modified_time
  );
  if (inv.customer_id) _upsertCustomer.run(inv.customer_id, inv.customer_name || '');
  _deleteLineItems.run(inv.invoice_id);
  for (const li of lineItems) {
    _insertLineItem.run(
      inv.invoice_id, li.item_id || '', li.sku || '', li.name || '',
      li.brand || '', li.category || '',
      parseFloat(li.quantity) || 0,
      parseFloat(li.item_total) || 0
    );
  }
});

// ── Credit note DB helpers ─────────────────────────────────────────────────────
const _upsertCreditNote = db.prepare(`
  INSERT OR REPLACE INTO credit_notes
    (creditnote_id, creditnote_number, customer_id, customer_name, date, status, invoice_id, last_modified_time)
  VALUES (?,?,?,?,?,?,?,?)
`);
const _deleteCNItems = db.prepare(`DELETE FROM credit_note_items WHERE creditnote_id = ?`);
const _insertCNItem  = db.prepare(`
  INSERT INTO credit_note_items (creditnote_id, item_id, sku, name, brand, category, quantity, item_total)
  VALUES (?,?,?,?,?,?,?,?)
`);

const _saveCreditNoteTx = db.transaction((cn, lineItems) => {
  _upsertCreditNote.run(
    cn.creditnote_id, cn.creditnote_number, cn.customer_id, cn.customer_name,
    cn.date, cn.status, cn.invoice_id, cn.last_modified_time
  );
  _deleteCNItems.run(cn.creditnote_id);
  for (const li of lineItems) {
    _insertCNItem.run(
      cn.creditnote_id, li.item_id || '', li.sku || '', li.name || '',
      li.brand || '', li.category || '',
      parseFloat(li.quantity) || 0,
      parseFloat(li.item_total) || 0
    );
  }
});

// ── Credit note sync ───────────────────────────────────────────────────────────
async function syncCreditNotes(token, deltaFilter) {
  const _checkExistingCN = db.prepare(
    `SELECT last_modified_time FROM credit_notes WHERE creditnote_id = ?`
  );

  // Collect all credit note headers
  let allCNs = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const url = new URL(`${BASE}/creditnotes`);
    url.searchParams.set('organization_id', ZOHO_ORG_ID);
    url.searchParams.set('per_page', '200');
    url.searchParams.set('page', String(page));
    if (deltaFilter) url.searchParams.set('last_modified_time', toZohoTimestamp(deltaFilter));
    const res = await fetchWithRetry(url.toString(), { Authorization: `Zoho-oauthtoken ${token}` });
    if (!res || !res.ok) {
      console.warn(`  ⚠️  Credit notes page ${page} failed: ${res?.status}`);
      break;
    }
    const data = await res.json();
    const cns = data.creditnotes || [];
    allCNs = allCNs.concat(cns);
    hasMore = data.page_context?.has_more_page || false;
    console.log(`  📄 CN page ${page}: ${cns.length} credit notes (total: ${allCNs.length})`);
    page++;
    await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
  }

  if (allCNs.length === 0) {
    console.log(`  ✅ No credit notes to process`);
    return;
  }

  let processed = 0, skipped = 0, failed = 0;

  for (const cnSummary of allCNs) {
    const existing = _checkExistingCN.get(cnSummary.creditnote_id);
    if (existing && existing.last_modified_time === cnSummary.last_modified_time) {
      skipped++;
      continue;
    }

    try {
      const url = `${BASE}/creditnotes/${cnSummary.creditnote_id}?organization_id=${ZOHO_ORG_ID}`;
      const res = await fetchWithRetry(url, { Authorization: `Zoho-oauthtoken ${token}` });
      if (!res || !res.ok) { failed++; continue; }
      const data = await res.json();
      const cn = data.creditnote || cnSummary;

      const lineItems = Array.isArray(cn.line_items) ? cn.line_items : [];
      const enrichedItems = lineItems.map(li => {
        const correctedName = correctItemName(li.name || '');
        const { brand, category } = inferBrandCategory(correctedName);
        return { ...li, name: correctedName, brand, category };
      });

      _saveCreditNoteTx(
        {
          creditnote_id:      cn.creditnote_id,
          creditnote_number:  cn.creditnote_number || '',
          customer_id:        cn.customer_id || '',
          customer_name:      cn.customer_name || '',
          date:               cn.date || '',
          status:             (cn.status || '').toLowerCase(),
          invoice_id:         cn.invoice_id || '',
          last_modified_time: cn.last_modified_time || '',
        },
        enrichedItems
      );
      processed++;
    } catch (e) {
      console.error(`  ❌ Credit note ${cnSummary.creditnote_id}: ${e.message}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
  }

  console.log(`  ✅ Credit notes: ${processed} saved, ${skipped} skipped, ${failed} failed`);
}

// ── Sales return DB helpers ────────────────────────────────────────────────────
const _upsertSalesReturn = db.prepare(`
  INSERT OR REPLACE INTO sales_returns
    (salesreturn_id, salesreturn_number, customer_id, customer_name, date, status, shipping_state, invoice_id, last_modified_time)
  VALUES (?,?,?,?,?,?,?,?,?)
`);
const _deleteSRItems = db.prepare(`DELETE FROM sales_return_items WHERE salesreturn_id = ?`);
const _insertSRItem  = db.prepare(`
  INSERT INTO sales_return_items (salesreturn_id, item_id, sku, name, brand, category, quantity, item_total)
  VALUES (?,?,?,?,?,?,?,?)
`);

const _saveSalesReturnTx = db.transaction((sr, lineItems) => {
  _upsertSalesReturn.run(
    sr.salesreturn_id, sr.salesreturn_number, sr.customer_id, sr.customer_name,
    sr.date, sr.status, sr.shipping_state, sr.invoice_id, sr.last_modified_time
  );
  _deleteSRItems.run(sr.salesreturn_id);
  for (const li of lineItems) {
    _insertSRItem.run(
      sr.salesreturn_id, li.item_id || '', li.sku || '', li.name || '',
      li.brand || '', li.category || '',
      parseFloat(li.quantity) || 0,
      parseFloat(li.item_total) || 0
    );
  }
});

// ── Sales return sync ─────────────────────────────────────────────────────────
async function syncSalesReturns(token) {
  const _checkExistingSR = db.prepare(
    `SELECT last_modified_time FROM sales_returns WHERE salesreturn_id = ?`
  );

  let allSRs = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const url = new URL(`${BASE}/salesreturns`);
    url.searchParams.set('organization_id', ZOHO_ORG_ID);
    url.searchParams.set('per_page', '200');
    url.searchParams.set('page', String(page));
    const res = await fetchWithRetry(url.toString(), { Authorization: `Zoho-oauthtoken ${token}` });
    if (!res || !res.ok) {
      console.warn(`  ⚠️  Sales returns page ${page} failed: ${res?.status}`);
      break;
    }
    const data = await res.json();
    const srs = data.salesreturns || [];
    allSRs = allSRs.concat(srs);
    hasMore = data.page_context?.has_more_page || false;
    console.log(`  📄 SR page ${page}: ${srs.length} sales returns (total: ${allSRs.length})`);
    page++;
    await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
  }

  if (allSRs.length === 0) {
    console.log(`  ✅ No sales returns to process`);
    return;
  }

  let processed = 0, skipped = 0, failed = 0;

  for (const srSummary of allSRs) {
    const existing = _checkExistingSR.get(srSummary.salesreturn_id);
    if (existing && existing.last_modified_time === srSummary.last_modified_time) {
      skipped++;
      continue;
    }

    try {
      const url = `${BASE}/salesreturns/${srSummary.salesreturn_id}?organization_id=${ZOHO_ORG_ID}`;
      const res = await fetchWithRetry(url, { Authorization: `Zoho-oauthtoken ${token}` });
      if (!res || !res.ok) { failed++; continue; }
      const data = await res.json();
      const sr = data.salesreturn || srSummary;

      const shippingState = normalizeState(sr.shipping_address?.state || '');
      const lineItems = Array.isArray(sr.line_items) ? sr.line_items : [];
      const enrichedItems = lineItems.map(li => {
        const correctedName = correctItemName(li.name || '');
        const { brand, category } = inferBrandCategory(correctedName);
        return { ...li, name: correctedName, brand, category };
      });

      _saveSalesReturnTx(
        {
          salesreturn_id:     sr.salesreturn_id,
          salesreturn_number: sr.salesreturn_number || '',
          customer_id:        sr.customer_id || '',
          customer_name:      sr.customer_name || '',
          date:               sr.date || '',
          status:             (sr.salesreturn_status || '').toLowerCase(),
          shipping_state:     shippingState,
          invoice_id:         sr.invoice_id || '',
          last_modified_time: sr.last_modified_time || '',
        },
        enrichedItems
      );
      processed++;
    } catch (e) {
      console.error(`  ❌ Sales return ${srSummary.salesreturn_id}: ${e.message}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
  }

  console.log(`  ✅ Sales returns: ${processed} saved, ${skipped} skipped, ${failed} failed`);
}

// ── Core sync logic ────────────────────────────────────────────────────────────
async function startSync() {
  if (syncState.syncing) {
    console.log('⏩ Sync already in progress, skipping.');
    return;
  }
  syncState.syncing = true;
  syncState.error = null;

  const syncStart = new Date();
  const isFullSync = !syncState.lastSync;
  const deltaFilter = isFullSync ? null : syncState.lastSync;

  console.log(`\n🔄 Starting ${isFullSync ? 'FULL' : 'DELTA'} sync...`);
  if (!isFullSync) console.log(`   Last sync: ${syncState.lastSync}`);

  try {
    const token = await getAccessToken();

    // ── Phase 1: collect all invoice headers ──────────────────────────────────
    // If delta filter causes a 400, fall back to full sync automatically
    let effectiveDeltaFilter = deltaFilter;
    let allInvoices = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      syncState.progress = `Fetching invoice list — page ${page}...`;
      let data;
      try {
        data = await fetchInvoicePage(token, page, effectiveDeltaFilter);
      } catch (e) {
        if (effectiveDeltaFilter && e.message.includes('400')) {
          console.warn(`  ⚠️  Delta sync 400 — falling back to full sync`);
          effectiveDeltaFilter = null;
          data = await fetchInvoicePage(token, page, null);
        } else {
          throw e;
        }
      }
      const invoices = data.invoices || [];
      allInvoices = allInvoices.concat(invoices);
      hasMore = data.page_context?.has_more_page || false;
      console.log(`  📄 Page ${page}: ${invoices.length} invoices (total: ${allInvoices.length})`);
      page++;
    }

    console.log(`  ✅ Found ${allInvoices.length} invoices to process`);

    // ── Phase 2: fetch detail + line items — sequential to stay under rate limit ─
    // Skip invoices already in DB with the same last_modified_time so interrupted
    // syncs can be safely restarted without re-fetching everything.
    const _checkExisting = db.prepare(
      `SELECT last_modified_time FROM invoices WHERE invoice_id = ?`
    );

    let processed = 0;
    let skipped   = 0;
    let failed    = 0;
    const total   = allInvoices.length;

    for (let i = 0; i < total; i++) {
      const invSummary = allInvoices[i];

      // Skip if already stored with the same modification timestamp
      const existing = _checkExisting.get(invSummary.invoice_id);
      if (existing && existing.last_modified_time === invSummary.last_modified_time) {
        skipped++;
        if (skipped % 50 === 0) console.log(`  ⏭  Skipped ${skipped} already-current invoices...`);
        continue;
      }

      syncState.progress = `Fetching invoice ${i + 1} of ${total} (${skipped} skipped, ${processed} saved)...`;

      try {
        const detail = await fetchInvoiceDetail(token, invSummary.invoice_id);
        const inv    = detail?.invoice || invSummary;

        const shippingState = normalizeState(
          inv.shipping_address?.state || invSummary.shipping_address?.state || ''
        );

        const lineItems = Array.isArray(inv.line_items) ? inv.line_items : [];
        const enrichedItems = lineItems.map(li => {
          const { brand, category } = inferBrandCategory(li.name || '');
          return { ...li, brand, category };
        });

        _saveInvoiceTx(
          {
            invoice_id:         inv.invoice_id,
            invoice_number:     inv.invoice_number || '',
            customer_id:        inv.customer_id || '',
            customer_name:      inv.customer_name || '',
            date:               inv.date || '',
            status:             (inv.status || '').toLowerCase(),
            shipping_state:     shippingState,
            last_modified_time: inv.last_modified_time || '',
          },
          enrichedItems
        );
        processed++;

        if (processed % 25 === 0) {
          const eta = Math.round(((total - i - 1) * REQUEST_DELAY_MS) / 60000);
          console.log(`  ✅ ${processed} saved, ${skipped} skipped, ~${eta}m remaining`);
        }
      } catch (e) {
        console.error(`  ❌ Invoice ${invSummary.invoice_id}: ${e.message}`);
        failed++;
      }

      // Steady 700ms gap between every request — no bursting
      await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
    }

    console.log(`  ✅ Invoice sync complete: ${processed} saved, ${skipped} skipped, ${failed} failed`);

    // ── Phase 3: sync credit notes (always full scan; skip-if-current handles dedup) ─
    // Re-fetch token in case invoice sync took long enough to expire it (Zoho tokens last ~1hr)
    console.log(`\n🔄 Syncing credit notes...`);
    const cnToken = await getAccessToken();
    await syncCreditNotes(cnToken, null);

    // ── Phase 4: sync sales returns (always full scan) ────────────────────────
    console.log(`\n🔄 Syncing sales returns...`);
    const srToken = await getAccessToken();
    await syncSalesReturns(srToken);

    // ── Phase 5: update meta ───────────────────────────────────────────────────
    db.prepare(`INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_sync_time', ?)`).run(syncStart.toISOString());
    syncState.lastSync = syncStart.toISOString();

    const ic  = db.prepare(`SELECT COUNT(*) as c FROM invoices`).get();
    const lc  = db.prepare(`SELECT COUNT(*) as c FROM line_items`).get();
    const cnc = db.prepare(`SELECT COUNT(*) as c FROM credit_notes`).get();
    const src = db.prepare(`SELECT COUNT(*) as c FROM sales_returns`).get();
    syncState.invoiceCount = ic?.c || 0;
    syncState.lineItemCount = lc?.c || 0;
    syncState.progress = `Done — ${syncState.invoiceCount} invoices, ${cnc?.c || 0} credit notes, ${src?.c || 0} sales returns`;

  } catch (e) {
    console.error('❌ Sync error:', e.message);
    syncState.error = e.message;
    syncState.progress = `Error: ${e.message}`;
  } finally {
    syncState.syncing = false;
  }
}

module.exports = { syncState, startSync };
