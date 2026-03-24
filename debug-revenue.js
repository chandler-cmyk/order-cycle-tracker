const db = require('./dashboard-server/db');

const YTD_START = '2026-01-01';
const YTD_END   = '2026-12-31';

// Check for duplicate line items (same invoice_id + sku + item_total appearing more than once)
const dupes = db.prepare(`
  SELECT invoice_id, sku, name, item_total, COUNT(*) as cnt
  FROM line_items
  GROUP BY invoice_id, sku, item_total
  HAVING cnt > 1
  LIMIT 10
`).all();
console.log('Duplicate line item rows:', dupes.length);
if (dupes.length) console.table(dupes);

// Revenue with DISTINCT check — if dupes exist this will differ
const withDist = db.prepare(`
  SELECT ROUND(SUM(li.item_total),2) AS rev
  FROM invoices i
  JOIN (SELECT DISTINCT invoice_id, sku, name, item_total FROM line_items) li
    ON i.invoice_id = li.invoice_id
  WHERE i.date BETWEEN ? AND ? AND i.status NOT IN ('void','draft')
`).get([YTD_START, YTD_END]);
console.log('\nRevenue (deduped line items, non-void/draft):', withDist.rev);

// Also check: revenue including ALL non-void non-draft
const broad = db.prepare(`
  SELECT ROUND(SUM(li.item_total),2) AS rev, COUNT(DISTINCT i.invoice_id) AS inv
  FROM invoices i JOIN line_items li ON i.invoice_id = li.invoice_id
  WHERE i.date BETWEEN ? AND ? AND i.status NOT IN ('void','draft')
`).get([YTD_START, YTD_END]);
console.log('Revenue (all non-void/non-draft):', broad);

// Revenue excluding also 'sent' (only paid + overdue + partially_paid)
const paidOverdue = db.prepare(`
  SELECT ROUND(SUM(li.item_total),2) AS rev, COUNT(DISTINCT i.invoice_id) AS inv
  FROM invoices i JOIN line_items li ON i.invoice_id = li.invoice_id
  WHERE i.date BETWEEN ? AND ? AND i.status IN ('paid','overdue','partially_paid')
`).get([YTD_START, YTD_END]);
console.log('Revenue (paid + overdue + partially_paid):', paidOverdue);

console.log('\nZoho target: $3,350,458.14');
