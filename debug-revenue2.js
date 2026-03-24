const db = require('./dashboard-server/db');
const YTD_START = '2026-01-01';
const YTD_END   = '2026-12-31';

// Check credit notes
const cnCount = db.prepare('SELECT COUNT(*) as cnt FROM credit_notes').get();
const cnItemCount = db.prepare('SELECT COUNT(*) as cnt FROM credit_note_items').get();
console.log('Credit notes in DB:', cnCount.cnt, '| items:', cnItemCount.cnt);

// Credit note YTD total
const cnYTD = db.prepare(`
  SELECT ROUND(SUM(ci.item_total),2) as total, COUNT(DISTINCT cn.creditnote_id) as cnt
  FROM credit_notes cn JOIN credit_note_items ci ON cn.creditnote_id = ci.creditnote_id
  WHERE cn.date BETWEEN ? AND ? AND cn.status != 'void'
`).get([YTD_START, YTD_END]);
console.log('Credit note YTD total:', cnYTD);

// Status breakdown YTD
const statuses = db.prepare(`
  SELECT i.status, ROUND(SUM(li.item_total),2) as rev, COUNT(DISTINCT i.invoice_id) as inv
  FROM invoices i JOIN line_items li ON i.invoice_id = li.invoice_id
  WHERE i.date BETWEEN ? AND ?
  GROUP BY i.status ORDER BY rev DESC
`).all([YTD_START, YTD_END]);
console.log('\nStatus breakdown:');
console.table(statuses);

// Non-void/draft minus credit notes
const baseRev = 3598207.55;
const cnTotal = cnYTD.total || 0;
console.log('\nHypothesis: all non-void/draft minus credit notes =', (baseRev - cnTotal).toFixed(2));
console.log('Zoho target: 3350458.14');
console.log('Difference:', (baseRev - cnTotal - 3350458.14).toFixed(2));
