require('dotenv').config();
const db = require('better-sqlite3')('./data/invoices.db', { readonly: true });

// Invoice statuses
console.log('=== INVOICE STATUSES (all time) ===');
db.prepare('SELECT status, COUNT(*) as cnt FROM invoices GROUP BY status ORDER BY cnt DESC').all()
  .forEach(r => console.log('  ' + r.status.padEnd(20) + r.cnt));

// Invoices with no line items
const noLI = db.prepare('SELECT COUNT(*) as c FROM invoices WHERE invoice_id NOT IN (SELECT DISTINCT invoice_id FROM line_items)').get();
console.log('\nInvoices with NO line items: ' + noLI.c);

// Multi-period breakdown
const today = '2026-03-20';
const ranges = [
  { label: '7D',  start: '2026-03-14', end: today },
  { label: '30D', start: '2026-02-19', end: today },
  { label: 'MTD', start: '2026-03-01', end: today },
  { label: 'QTD', start: '2026-01-01', end: today },
  { label: 'YTD', start: '2026-01-01', end: today },
  { label: '90D', start: '2025-12-21', end: today },
];

const invQ = db.prepare(`
  SELECT COALESCE(SUM(li.item_total),0) AS rev,
         COALESCE(SUM(li.quantity),0)   AS units,
         COUNT(DISTINCT i.invoice_id)   AS cnt
  FROM invoices i JOIN line_items li ON i.invoice_id = li.invoice_id
  WHERE i.date BETWEEN ? AND ? AND i.status NOT IN ('void','draft')
`);

const cnQ = db.prepare(`
  SELECT COALESCE(SUM(cni.item_total),0)    AS rev,
         COALESCE(SUM(cni.quantity),0)      AS units,
         COUNT(DISTINCT cn.creditnote_id)   AS cnt
  FROM credit_notes cn JOIN credit_note_items cni ON cn.creditnote_id = cni.creditnote_id
  WHERE cn.date BETWEEN ? AND ? AND cn.status != 'void'
`);

console.log('\n=== REVENUE BREAKDOWN BY PERIOD ===');
console.log('Period | Gross Invoice Rev  | CN Deduction       | Net Revenue        | Gross Units | Net Units | Invoices | CNs');
console.log('-------|--------------------|--------------------|--------------------|-----------  |-----------|----------|----');

for (const r of ranges) {
  const inv = invQ.get(r.start, r.end);
  const cn  = cnQ.get(r.start, r.end);
  const net = inv.rev - cn.rev;
  const netU = inv.units - cn.units;
  console.log(
    r.label.padEnd(7) + '| ' +
    ('$' + inv.rev.toFixed(2)).padEnd(19) + '| ' +
    ('-$' + cn.rev.toFixed(2)).padEnd(19) + '| ' +
    ('$' + net.toFixed(2)).padEnd(19) + '| ' +
    Math.round(inv.units).toString().padEnd(12) + '| ' +
    Math.round(netU).toString().padEnd(10) + '| ' +
    inv.cnt.toString().padEnd(9) + '| ' +
    cn.cnt
  );
}

// Check: CNs that fall OUTSIDE the invoice date range they reference
// (CNs whose reference invoice is outside the CN's own date range)
console.log('\n=== CROSS-PERIOD CREDIT NOTES (CN date vs invoice date mismatch) ===');
console.log('(These CNs are applied to invoices from different periods)');
const crossPeriod = db.prepare(`
  SELECT cn.creditnote_id, cn.creditnote_number, cn.date AS cn_date,
         cn.customer_name, SUM(cni.item_total) AS amount
  FROM credit_notes cn
  JOIN credit_note_items cni ON cn.creditnote_id = cni.creditnote_id
  WHERE cn.status != 'void'
    AND strftime('%Y-%m', cn.date) != (
      SELECT strftime('%Y-%m', i.date) FROM invoices i
      WHERE i.customer_id = cn.customer_id
        AND i.date <= cn.date
        AND i.status NOT IN ('void','draft')
      ORDER BY i.date DESC LIMIT 1
    )
  GROUP BY cn.creditnote_id
  ORDER BY cn.date DESC
  LIMIT 20
`).all();
if (crossPeriod.length === 0) {
  console.log('  None found (or insufficient data to detect)');
} else {
  crossPeriod.forEach(r => console.log(`  ${r.cn_date}  ${r.creditnote_number}  ${r.customer_name}  -$${r.amount.toFixed(2)}`));
}

// Invoice status breakdown for each period
console.log('\n=== STATUS BREAKDOWN FOR YTD ===');
db.prepare(`
  SELECT i.status, COUNT(DISTINCT i.invoice_id) as cnt,
         COALESCE(SUM(li.item_total),0) as rev
  FROM invoices i JOIN line_items li ON i.invoice_id = li.invoice_id
  WHERE i.date BETWEEN '2026-01-01' AND '2026-03-20'
  GROUP BY i.status ORDER BY rev DESC
`).all().forEach(r => console.log(`  ${r.status.padEnd(15)} ${r.cnt} invoices  $${r.rev.toFixed(2)}`));

db.close();
