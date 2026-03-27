const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

const db = require('./dashboard-server/db');
const { syncState, startSync } = require('./dashboard-server/sync');
const { inferBrandCategory, CATEGORIES } = require('./dashboard-server/categorize');

// ── Known item name misspellings → canonical names ────────────────────────────
const NAME_CORRECTIONS = {
  'Mashmallow OG':  'Marshmallow OG',
  'Orangle Slushie': 'Orange Slushie',
};

// ── Exact name fixes (strain type missing) → merge into strain-typed version ──
const LBHH = 'LUNCHBOXX - THCA Hash Hole Preroll Box 20 ct';
const EXACT_NAME_CORRECTIONS = {
  [`${LBHH} - Berry Pie`]:       [`${LBHH} - Berry Pie - Sativa`],
  [`${LBHH} - Candy Fumez`]:     [`${LBHH} - Candy Fumez - Indica`],
  [`${LBHH} - Ice Cream Cake`]:  [`${LBHH} - Ice Cream Cake - Hybrid`],
  [`${LBHH} - Jelly Donuts`]:    [`${LBHH} - Jelly Donuts - Indica`],
  [`${LBHH} - Sour Strawberry`]: [`${LBHH} - Sour Strawberry - Sativa`],
  [`${LBHH} - Sticky Buns`]:     [`${LBHH} - Sticky Buns - Hybrid`],
};


// ── One-time migration: re-derive brand/category from item names ───────────────
// Runs on every startup — idempotent and fast (pure SQLite, no API calls).
function migrateLineItemBrandCategory() {
  // Fix known misspellings — use REPLACE() so partial matches in longer names work
  for (const [wrong, right] of Object.entries(NAME_CORRECTIONS)) {
    db.prepare(`UPDATE line_items         SET name = REPLACE(name, ?, ?) WHERE name LIKE ?`).run(wrong, right, `%${wrong}%`);
    db.prepare(`UPDATE credit_note_items  SET name = REPLACE(name, ?, ?) WHERE name LIKE ?`).run(wrong, right, `%${wrong}%`);
    db.prepare(`UPDATE sales_return_items SET name = REPLACE(name, ?, ?) WHERE name LIKE ?`).run(wrong, right, `%${wrong}%`);
  }

  // Exact name fixes — merge strain-less duplicates into strain-typed canonical names
  for (const [wrong, [right]] of Object.entries(EXACT_NAME_CORRECTIONS)) {
    db.prepare(`UPDATE line_items         SET name = ? WHERE name = ?`).run(right, wrong);
    db.prepare(`UPDATE credit_note_items  SET name = ? WHERE name = ?`).run(right, wrong);
    db.prepare(`UPDATE sales_return_items SET name = ? WHERE name = ?`).run(right, wrong);
  }

  const updateLI  = db.prepare(`UPDATE line_items          SET brand = ?, category = ? WHERE id = ?`);
  const updateCNI = db.prepare(`UPDATE credit_note_items   SET brand = ?, category = ? WHERE id = ?`);
  const updateSRI = db.prepare(`UPDATE sales_return_items  SET brand = ?, category = ? WHERE id = ?`);
  const liRows    = db.prepare(`SELECT id, name FROM line_items`).all();
  const cniRows   = db.prepare(`SELECT id, name FROM credit_note_items`).all();
  const sriRows   = db.prepare(`SELECT id, name FROM sales_return_items`).all();
  const run = db.transaction(() => {
    for (const row of liRows)  { const { brand, category } = inferBrandCategory(row.name || ''); updateLI.run(brand, category, row.id); }
    for (const row of cniRows) { const { brand, category } = inferBrandCategory(row.name || ''); updateCNI.run(brand, category, row.id); }
    for (const row of sriRows) { const { brand, category } = inferBrandCategory(row.name || ''); updateSRI.run(brand, category, row.id); }
  });
  run();
  console.log(`✅ Brand/category migrated: ${liRows.length} line items, ${cniRows.length} credit note items, ${sriRows.length} sales return items`);
}

const BRANDS = ['LunchBoxx', "Not Ya Son's Weed"];

const app  = express();
const PORT = process.env.PORT || process.env.DASHBOARD_PORT || 3002;
const SITE_PASSWORD = process.env.SITE_PASSWORD;

app.use(cors());
app.use(express.json());

app.post('/api/login', (req, res) => {
  if (!SITE_PASSWORD) return res.json({ ok: true, token: 'open' });
  const { password } = req.body;
  if (password === SITE_PASSWORD) {
    res.json({ ok: true, token: SITE_PASSWORD });
  } else {
    res.status(401).json({ ok: false, error: 'Incorrect password' });
  }
});

app.use('/api', (req, res, next) => {
  if (!SITE_PASSWORD) return next();
  const auth = req.headers.authorization;
  if (auth === `Bearer ${SITE_PASSWORD}`) return next();
  res.status(401).json({ error: 'Unauthorized' });
});

// Serve React build in production
const CLIENT_BUILD = path.join(__dirname, 'dashboard-client', 'build');
if (require('fs').existsSync(CLIENT_BUILD)) {
  app.use(express.static(CLIENT_BUILD));
}

// ── Query filter builder ───────────────────────────────────────────────────────
function buildWhereClause(query) {
  const { start, end, brands, categories, sku } = query;
  const s = start || '2000-01-01';
  const e = end   || '2099-12-31';

  // Invoice side — all non-void/draft
  const invCond   = [`i.date BETWEEN ? AND ?`, `i.status NOT IN ('void','draft')`];
  const invParams = [s, e];

  // Credit note side — filter by the CN's own date (matching Zoho's methodology).
  // Draft CNs are excluded as they are not finalized/applied in Zoho reports.
  const cnCond   = [`cn.date BETWEEN ? AND ?`, `cn.status NOT IN ('void','draft')`];
  const cnParams = [s, e];

  if (brands) {
    const list = brands.split(',').filter(Boolean);
    if (list.length) {
      const ph = list.map(() => '?').join(',');
      invCond.push(`li.brand IN (${ph})`);    invParams.push(...list);
      cnCond.push(`cni.brand IN (${ph})`);    cnParams.push(...list);
    }
  }
  if (categories) {
    const list = categories.split(',').filter(Boolean);
    if (list.length) {
      const ph = list.map(() => '?').join(',');
      invCond.push(`li.category IN (${ph})`);    invParams.push(...list);
      cnCond.push(`cni.category IN (${ph})`);    cnParams.push(...list);
    }
  }
  if (sku) {
    invCond.push(`(li.sku LIKE ? OR li.name LIKE ?)`);    invParams.push(`%${sku}%`, `%${sku}%`);
    cnCond.push(`(cni.sku LIKE ? OR cni.name LIKE ?)`);   cnParams.push(`%${sku}%`, `%${sku}%`);
  }

  return {
    where:   invCond.join(' AND '),
    params:  invParams,
    cnWhere: cnCond.join(' AND '),
    cnParams,
  };
}

// Convenience: params for a 2-leg revenue UNION (invoices + CNs)
function unionParams(w) { return [...w.params, ...w.cnParams]; }

// 2-leg revenue UNION — invoices positive, credit notes negative.
function revenueUnion(w, invFields, cnFields) {
  return `(
    SELECT ${invFields} FROM invoices i JOIN line_items li ON i.invoice_id = li.invoice_id WHERE ${w.where}
    UNION ALL
    SELECT ${cnFields}
    FROM credit_notes cn
    JOIN credit_note_items cni ON cn.creditnote_id = cni.creditnote_id
    WHERE ${w.cnWhere}
  )`;
}


// ── Sync endpoints ─────────────────────────────────────────────────────────────

// GET /api/sync/status
app.get('/api/sync/status', (_req, res) => {
  res.json({
    syncing:       syncState.syncing,
    progress:      syncState.progress,
    lastSync:      syncState.lastSync,
    invoiceCount:  syncState.invoiceCount,
    lineItemCount: syncState.lineItemCount,
    error:         syncState.error,
  });
});

// POST /api/sync — trigger manual sync
app.post('/api/sync', (_req, res) => {
  if (syncState.syncing) {
    return res.json({ status: 'already_running', message: 'Sync already in progress' });
  }
  // Fire and forget — client polls /api/sync/status
  startSync().catch(e => console.error('Manual sync error:', e.message));
  res.json({ status: 'started', message: 'Sync started' });
});

// ── Dashboard: filter options ─────────────────────────────────────────────────

// GET /api/dashboard/filters
app.get('/api/dashboard/filters', (_req, res) => {
  res.json({ brands: BRANDS, categories: CATEGORIES });
});

// ── Dashboard: metric cards ────────────────────────────────────────────────────

// GET /api/dashboard/metrics?start=&end=&brands=&categories=&sku=
function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getMetrics(w) {
  const revRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS totalRevenue, COALESCE(SUM(qty), 0) AS unitsSold
    FROM ${revenueUnion(w,
      'li.item_total AS amount, li.quantity AS qty',
      '-cni.item_total AS amount, -cni.quantity AS qty'
    )} rev
  `).get(unionParams(w));
  const ordRow = db.prepare(`
    SELECT COUNT(DISTINCT i.invoice_id) AS orderCount
    FROM invoices i JOIN line_items li ON i.invoice_id = li.invoice_id
    WHERE ${w.where}
  `).get(w.params);
  const orderCount = ordRow.orderCount;
  return {
    totalRevenue:  revRow.totalRevenue,
    orderCount,
    avgOrderValue: orderCount > 0 ? revRow.totalRevenue / orderCount : 0,
    unitsSold:     revRow.unitsSold,
  };
}

app.get('/api/dashboard/metrics', (req, res) => {
  try {
    const w    = buildWhereClause(req.query);
    const curr = getMetrics(w);

    // Prior-year: shift start and end back 365 days
    const prevQuery = {
      ...req.query,
      start: req.query.start ? shiftDate(req.query.start, -365) : req.query.start,
      end:   req.query.end   ? shiftDate(req.query.end,   -365) : req.query.end,
    };
    const prev = getMetrics(buildWhereClause(prevQuery));

    res.json({ ...curr, prev });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dashboard/outstanding — always current state, no date filter
app.get('/api/dashboard/outstanding', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        i.status,
        COUNT(DISTINCT i.invoice_id)     AS count,
        COALESCE(SUM(li.item_total), 0)  AS value
      FROM invoices i
      JOIN line_items li ON i.invoice_id = li.invoice_id
      WHERE i.status IN ('sent', 'overdue', 'partially_paid')
      GROUP BY i.status
      ORDER BY value DESC
    `).all();
    const totalCount = rows.reduce((s, r) => s + r.count, 0);
    const totalValue = rows.reduce((s, r) => s + r.value, 0);
    res.json({ rows, totalCount, totalValue });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dashboard: revenue trend ───────────────────────────────────────────────────

// GET /api/dashboard/trend?start=&end=&group=daily|weekly&brands=&categories=&sku=
app.get('/api/dashboard/trend', (req, res) => {
  try {
    const group = req.query.group === 'weekly' ? 'weekly' : 'daily';
    const w = buildWhereClause(req.query);
    const dateFmt = group === 'weekly' ? `strftime('%Y-%W', raw_date)` : `raw_date`;

    const rows = db.prepare(`
      SELECT
        ${dateFmt}         AS period,
        SUM(amount)        AS revenue,
        COUNT(DISTINCT inv_id) AS orderCount
      FROM ${revenueUnion(w,
        'i.date AS raw_date, li.item_total AS amount, i.invoice_id AS inv_id',
        'cn.date AS raw_date, -cni.item_total AS amount, NULL AS inv_id'
      )} trend
      GROUP BY period
      ORDER BY period ASC
    `).all(unionParams(w));

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dashboard: geography ───────────────────────────────────────────────────────

// GET /api/dashboard/states?start=&end=&brands=&categories=&sku=
// Geography is invoice-only — credit notes don't have a shipping state
app.get('/api/dashboard/states', (req, res) => {
  try {
    const w = buildWhereClause(req.query);
    const rows = db.prepare(`
      SELECT
        i.shipping_state             AS state,
        COALESCE(SUM(li.item_total), 0) AS revenue,
        COUNT(DISTINCT i.invoice_id) AS orderCount
      FROM invoices i
      JOIN line_items li ON i.invoice_id = li.invoice_id
      WHERE ${w.where}
        AND i.shipping_state != ''
      GROUP BY i.shipping_state
      ORDER BY revenue DESC
    `).all(w.params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dashboard: product table ───────────────────────────────────────────────────

// GET /api/dashboard/products?start=&end=&brands=&categories=&sku=&sort=revenue|units&order=desc|asc&page=1&pageSize=25
app.get('/api/dashboard/products', (req, res) => {
  try {
    const w        = buildWhereClause(req.query);
    const sortCol  = req.query.sort  === 'units' ? 'units' : 'revenue';
    const sortDir  = req.query.order === 'asc'   ? 'ASC'   : 'DESC';
    const page     = Math.max(1, parseInt(req.query.page    || '1', 10));
    const pageSize = Math.min(100, parseInt(req.query.pageSize || '25', 10));
    const offset   = (page - 1) * pageSize;

    // Net revenue and units per product — invoices minus credit notes
    const netUnion = revenueUnion(w,
      'li.sku AS sku, li.name AS name, li.brand AS brand, li.category AS cat, li.item_total AS amount, li.quantity AS qty',
      'cni.sku AS sku, cni.name AS name, cni.brand AS brand, cni.category AS cat, -cni.item_total AS amount, -cni.quantity AS qty'
    );

    const totalRow = db.prepare(`
      SELECT COUNT(*) AS total FROM (
        SELECT sku FROM ${netUnion} p GROUP BY sku, name, brand, cat
      )
    `).get(unionParams(w));

    const totRevRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS tot FROM ${netUnion} p
    `).get(unionParams(w));

    const rows = db.prepare(`
      SELECT sku, name, brand, cat AS category,
        COALESCE(SUM(qty), 0)    AS units,
        COALESCE(SUM(amount), 0) AS revenue
      FROM ${netUnion} p
      GROUP BY sku, name, brand, cat
      ORDER BY ${sortCol} ${sortDir}
      LIMIT ? OFFSET ?
    `).all([...unionParams(w), pageSize, offset]);

    const totalRevenue = totRevRow?.tot || 0;
    const items = rows.map(r => ({
      ...r,
      pctOfTotal: totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0,
    }));

    res.json({ items, total: totalRow?.total || 0, page, pageSize, totalRevenue });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dashboard: categories ─────────────────────────────────────────────────────

// GET /api/dashboard/categories?start=&end=&brands=&categories=&sku=
app.get('/api/dashboard/categories', (req, res) => {
  try {
    const w = buildWhereClause(req.query);
    const netUnion = revenueUnion(w,
      'li.category AS cat, li.item_total AS amount, li.quantity AS qty',
      'cni.category AS cat, -cni.item_total AS amount, -cni.quantity AS qty'
    );
    const rows = db.prepare(`
      SELECT COALESCE(NULLIF(cat,''), 'Uncategorized') AS category,
        COALESCE(SUM(qty), 0)    AS units,
        COALESCE(SUM(amount), 0) AS revenue
      FROM ${netUnion} p
      GROUP BY cat
      ORDER BY revenue DESC
    `).all(unionParams(w));
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const items = rows.map(r => ({
      ...r,
      pct: totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0,
    }));
    res.json({ items, totalRevenue });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dashboard: brand comparison ────────────────────────────────────────────────

// GET /api/dashboard/brand-comparison?start=&end=&group=daily|weekly
app.get('/api/dashboard/brand-comparison', (req, res) => {
  try {
    const group   = req.query.group === 'weekly' ? 'weekly' : 'daily';
    const dateFmt = group === 'weekly' ? `strftime('%Y-%W', raw_date)` : `raw_date`;
    const BRANDS  = ['LunchBoxx', "Not Ya Son's Weed"];

    const result = BRANDS.map(brand => {
      const w = buildWhereClause({ ...req.query, brands: brand });
      const summary = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) AS revenue, COALESCE(SUM(qty), 0) AS units
        FROM ${revenueUnion(w,
          'li.item_total AS amount, li.quantity AS qty',
          '-cni.item_total AS amount, -cni.quantity AS qty'
        )} s
      `).get(unionParams(w));
      const ordRow = db.prepare(`
        SELECT COUNT(DISTINCT i.invoice_id) AS orderCount
        FROM invoices i JOIN line_items li ON i.invoice_id = li.invoice_id
        WHERE ${w.where}
      `).get(w.params);
      const trend = db.prepare(`
        SELECT ${dateFmt} AS period, SUM(amount) AS revenue
        FROM ${revenueUnion(w,
          'i.date AS raw_date, li.item_total AS amount',
          'cn.date AS raw_date, -cni.item_total AS amount'
        )} t
        GROUP BY period ORDER BY period ASC
      `).all(unionParams(w));
      return { name: brand, revenue: summary.revenue, units: summary.units, orderCount: ordRow.orderCount, trend };
    });

    // Merge trends into a single array keyed by period for charting
    const allPeriods = [...new Set(result.flatMap(b => b.trend.map(t => t.period)))].sort();
    const byBrand    = Object.fromEntries(result.map(b => [b.name, Object.fromEntries(b.trend.map(t => [t.period, t.revenue]))]));
    const merged     = allPeriods.map(period => ({
      period,
      lunchboxx: byBrand['LunchBoxx']?.[period] || 0,
      nysw:      byBrand["Not Ya Son's Weed"]?.[period] || 0,
    }));

    res.json({ brands: result, merged, group });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dashboard: customers ───────────────────────────────────────────────────────

// GET /api/dashboard/customers?start=&end=&brands=&categories=&sku=
app.get('/api/dashboard/customers', (req, res) => {
  try {
    const w = buildWhereClause(req.query);
    const custUnion = revenueUnion(w,
      'i.customer_id AS cid, i.customer_name AS cname, li.item_total AS amount, i.invoice_id AS inv_id',
      'cn.customer_id AS cid, cn.customer_name AS cname, -cni.item_total AS amount, NULL AS inv_id'
    );
    const rows = db.prepare(`
      SELECT
        cid AS customer_id, cname AS customer_name,
        COALESCE(SUM(amount), 0) AS revenue,
        COUNT(DISTINCT inv_id)   AS orderCount
      FROM ${custUnion} cu
      GROUP BY cid, cname
      ORDER BY revenue DESC
    `).all(unionParams(w));

    // Segmentation: pull each customer's all-time first/last invoice date
    const histRows = db.prepare(`
      SELECT customer_id, MIN(date) AS first_ever, MAX(date) AS last_ever
      FROM invoices WHERE status NOT IN ('void','draft')
      GROUP BY customer_id
    `).all();
    const hist          = Object.fromEntries(histRows.map(r => [r.customer_id, r]));
    const periodStart   = req.query.start || '2000-01-01';
    const atRiskCutoff  = shiftDate(new Date().toISOString().slice(0, 10), -60);

    const segmented = rows.map(r => {
      const h = hist[r.customer_id] || {};
      let segment = 'returning';
      if (h.first_ever && h.first_ever >= periodStart) segment = 'new';
      if (h.last_ever  && h.last_ever  <= atRiskCutoff) segment = 'at_risk';
      return { ...r, segment, firstOrderDate: h.first_ever, lastOrderDate: h.last_ever };
    });

    res.json(segmented);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dashboard/customers/:id?start=&end=
app.get('/api/dashboard/customers/:id', (req, res) => {
  try {
    const customerId = req.params.id;
    const s = req.query.start || '2000-01-01';
    const e = req.query.end   || '2099-12-31';

    // Net revenue over time (invoices minus credit notes and sales returns by date)
    const trend = db.prepare(`
      SELECT raw_date AS date, COALESCE(SUM(amount), 0) AS revenue
      FROM (
        SELECT i.date AS raw_date, li.item_total AS amount
        FROM invoices i JOIN line_items li ON i.invoice_id = li.invoice_id
        WHERE i.customer_id = ? AND i.date BETWEEN ? AND ? AND i.status NOT IN ('void','draft')
        UNION ALL
        SELECT COALESCE(ref_inv.date, cn.date) AS raw_date, -cni.item_total AS amount
        FROM credit_notes cn
        JOIN credit_note_items cni ON cn.creditnote_id = cni.creditnote_id
        LEFT JOIN invoices ref_inv ON ref_inv.invoice_id = cn.invoice_id
        WHERE cn.customer_id = ? AND COALESCE(ref_inv.date, cn.date) BETWEEN ? AND ? AND cn.status != 'void'
      )
      GROUP BY raw_date ORDER BY raw_date ASC
    `).all([customerId, s, e, customerId, s, e]);

    // Top SKUs net of returns
    const topSkus = db.prepare(`
      SELECT sku, name, brand, category,
        COALESCE(SUM(qty), 0)    AS units,
        COALESCE(SUM(amount), 0) AS revenue
      FROM (
        SELECT li.sku, li.name, li.brand, li.category, li.quantity AS qty, li.item_total AS amount
        FROM invoices i JOIN line_items li ON i.invoice_id = li.invoice_id
        WHERE i.customer_id = ? AND i.date BETWEEN ? AND ? AND i.status NOT IN ('void','draft')
        UNION ALL
        SELECT cni.sku, cni.name, cni.brand, cni.category, -cni.quantity AS qty, -cni.item_total AS amount
        FROM credit_notes cn
        JOIN credit_note_items cni ON cn.creditnote_id = cni.creditnote_id
        LEFT JOIN invoices ref_inv ON ref_inv.invoice_id = cn.invoice_id
        WHERE cn.customer_id = ? AND COALESCE(ref_inv.date, cn.date) BETWEEN ? AND ? AND cn.status != 'void'
      )
      GROUP BY sku, name, brand, category
      ORDER BY revenue DESC LIMIT 10
    `).all([customerId, s, e, customerId, s, e]);

    // Invoice history
    const invoices = db.prepare(`
      SELECT i.invoice_id, i.invoice_number, i.date, i.status,
        COALESCE(SUM(li.item_total), 0) AS total
      FROM invoices i
      LEFT JOIN line_items li ON i.invoice_id = li.invoice_id
      WHERE i.customer_id = ? AND i.date BETWEEN ? AND ?
      GROUP BY i.invoice_id, i.invoice_number, i.date, i.status
      ORDER BY i.date DESC
    `).all([customerId, s, e]);

    // Credit notes for this customer
    const creditNotes = db.prepare(`
      SELECT cn.creditnote_id, cn.creditnote_number, cn.date, cn.status,
        COALESCE(SUM(cni.item_total), 0) AS total
      FROM credit_notes cn
      LEFT JOIN credit_note_items cni ON cn.creditnote_id = cni.creditnote_id
      WHERE cn.customer_id = ? AND cn.date BETWEEN ? AND ?
      GROUP BY cn.creditnote_id, cn.creditnote_number, cn.date, cn.status
      ORDER BY cn.date DESC
    `).all([customerId, s, e]);

    // Sales returns for this customer
    const salesReturns = db.prepare(`
      SELECT sr.salesreturn_id, sr.salesreturn_number, sr.date, sr.status,
        COALESCE(SUM(sri.item_total), 0) AS total
      FROM sales_returns sr
      LEFT JOIN sales_return_items sri ON sr.salesreturn_id = sri.salesreturn_id
      WHERE sr.customer_id = ? AND sr.date BETWEEN ? AND ?
      GROUP BY sr.salesreturn_id, sr.salesreturn_number, sr.date, sr.status
      ORDER BY sr.date DESC
    `).all([customerId, s, e]);

    const totalRevenue = trend.reduce((acc, r) => acc + r.revenue, 0);

    res.json({ trend, topSkus, invoices, creditNotes, salesReturns, totalRevenue });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dashboard: customers by state ─────────────────────────────────────────────

// GET /api/dashboard/state-customers?state=TX&start=&end=&brands=&categories=&sku=
app.get('/api/dashboard/state-customers', (req, res) => {
  try {
    const { state } = req.query;
    if (!state) return res.status(400).json({ error: 'state param required' });
    const w = buildWhereClause(req.query);
    // Add state filter — only invoices have a shipping state
    const rows = db.prepare(`
      SELECT
        i.customer_id,
        i.customer_name,
        COUNT(DISTINCT i.invoice_id) AS orderCount,
        COALESCE(SUM(li.item_total), 0) AS revenue
      FROM invoices i
      JOIN line_items li ON i.invoice_id = li.invoice_id
      WHERE ${w.where} AND i.shipping_state = ?
      GROUP BY i.customer_id, i.customer_name
      ORDER BY revenue DESC
    `).all([...w.params, state]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dashboard/state-products?state=TX&start=&end=&brands=&categories=&sku=
app.get('/api/dashboard/state-products', (req, res) => {
  try {
    const { state } = req.query;
    if (!state) return res.status(400).json({ error: 'state param required' });
    const w = buildWhereClause(req.query);
    // Invoice leg — filter by shipping_state
    const invWhere = `${w.where} AND i.shipping_state = ?`;
    // CN leg — join back to invoice to get shipping_state
    const cnWhere  = `${w.cnWhere} AND ref_inv2.shipping_state = ?`;
    const rows = db.prepare(`
      SELECT name, sku,
        COALESCE(SUM(qty), 0)    AS units,
        COALESCE(SUM(amount), 0) AS revenue
      FROM (
        SELECT li.name, li.sku, li.quantity AS qty, li.item_total AS amount
        FROM invoices i
        JOIN line_items li ON i.invoice_id = li.invoice_id
        WHERE ${invWhere}
        UNION ALL
        SELECT cni.name, cni.sku, -cni.quantity AS qty, -cni.item_total AS amount
        FROM credit_notes cn
        JOIN credit_note_items cni ON cn.creditnote_id = cni.creditnote_id
        LEFT JOIN invoices ref_inv ON ref_inv.invoice_id = cn.invoice_id
        JOIN invoices ref_inv2 ON ref_inv2.invoice_id = cn.invoice_id
        WHERE ${cnWhere}
      )
      GROUP BY name, sku
      HAVING units > 0
      ORDER BY revenue DESC
      LIMIT 25
    `).all([...w.params, state, ...w.cnParams, state]);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    res.json(rows.map(r => ({ ...r, pct: totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0 })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  res.json({ status: 'ok', port: PORT, syncState });
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Sales Dashboard API on http://localhost:${PORT}`);
  console.log(`   SQLite DB:  data/invoices.db`);
  console.log(`   Frontend:   http://localhost:3003 (run: cd dashboard-client && npm start)\n`);

  // Re-derive brand/category from item names on every startup (fast, local only)
  const invCount = db.prepare(`SELECT COUNT(*) as c FROM invoices`).get()?.c || 0;
  if (invCount > 0) migrateLineItemBrandCategory();

  // Auto-sync
  if (invCount === 0) {
    console.log('📂 No data found — starting full sync from Zoho...');
  } else {
    console.log(`📂 ${invCount} invoices in DB. Running delta sync for updates...`);
  }
  startSync().catch(e => console.error('Auto-sync failed:', e.message));
});

// SPA fallback — serve index.html for any non-API route
if (require('fs').existsSync(CLIENT_BUILD)) {
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(CLIENT_BUILD, 'index.html')));
}
