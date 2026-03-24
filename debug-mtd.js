// Debug: Break down MTD revenue components vs Zoho's $1,120,569.88
require('dotenv').config();
const Database = require('better-sqlite3');
const db = new Database('./data/invoices.db', { readonly: true });

const today = new Date();
const pad = n => String(n).padStart(2, '0');
const start = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
const end   = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

console.log(`\n📅 MTD range: ${start} → ${end}`);

// 1. Gross invoice revenue (line item totals only)
const invRev = db.prepare(`
  SELECT
    COUNT(DISTINCT i.invoice_id) AS invoiceCount,
    COALESCE(SUM(li.item_total), 0) AS lineItemTotal,
    COUNT(*) AS lineItemCount
  FROM invoices i
  JOIN line_items li ON i.invoice_id = li.invoice_id
  WHERE i.date BETWEEN ? AND ?
    AND i.status NOT IN ('void','draft')
`).get(start, end);

console.log(`\n1. INVOICES (gross, line items only):`);
console.log(`   Invoice count:   ${invRev.invoiceCount}`);
console.log(`   Line item total: $${invRev.lineItemTotal.toFixed(2)}`);
console.log(`   Line item rows:  ${invRev.lineItemCount}`);


// 3. Credit note deductions MTD
const cnRev = db.prepare(`
  SELECT
    COUNT(DISTINCT cn.creditnote_id) AS cnCount,
    COALESCE(SUM(cni.item_total), 0) AS lineItemTotal,
    COALESCE(SUM(cni.quantity), 0) AS units
  FROM credit_notes cn
  JOIN credit_note_items cni ON cn.creditnote_id = cni.creditnote_id
  WHERE cn.date BETWEEN ? AND ?
    AND cn.status != 'void'
`).get(start, end);

console.log(`\n3. CREDIT NOTES (MTD deductions):`);
console.log(`   Credit note count: ${cnRev.cnCount}`);
console.log(`   Line item total:  -$${cnRev.lineItemTotal.toFixed(2)}`);
console.log(`   Units:            -${cnRev.units}`);

// 4. Sales return deductions MTD
const srRev = db.prepare(`
  SELECT
    COUNT(DISTINCT sr.salesreturn_id) AS srCount,
    COALESCE(SUM(sri.item_total), 0) AS lineItemTotal,
    COALESCE(SUM(sri.quantity), 0) AS units
  FROM sales_returns sr
  JOIN sales_return_items sri ON sr.salesreturn_id = sri.salesreturn_id
  WHERE sr.date BETWEEN ? AND ?
    AND sr.status NOT IN ('void','cancelled')
`).get(start, end);

console.log(`\n4. SALES RETURNS (MTD deductions):`);
console.log(`   Sales return count: ${srRev.srCount}`);
console.log(`   Line item total:   -$${srRev.lineItemTotal.toFixed(2)}`);
console.log(`   Units:             -${srRev.units}`);

// 5. Summary
const grossInv    = invRev.lineItemTotal;
const grossUnits  = db.prepare(`SELECT COALESCE(SUM(li.quantity),0) AS u FROM invoices i JOIN line_items li ON i.invoice_id=li.invoice_id WHERE i.date BETWEEN ? AND ? AND i.status NOT IN ('void','draft')`).get(start,end).u;
const netRev      = grossInv - cnRev.lineItemTotal - srRev.lineItemTotal;
const netRevNoCN  = grossInv - srRev.lineItemTotal;   // if Zoho only subtracts SRs
const netRevNoSR  = grossInv - cnRev.lineItemTotal;   // if Zoho only subtracts CNs
const netRevGross = grossInv;                          // if Zoho shows gross
const netUnits    = grossUnits - cnRev.units - srRev.units;

const zoho = 1120569.88;
const zohoUnits = 33799;

console.log(`\n5. SUMMARY vs ZOHO ($${zoho.toFixed(2)} / ${zohoUnits} units):`);
console.log(`   Gross invoices (no deductions):        $${grossInv.toFixed(2)}   units: ${grossUnits}  gap: $${(grossInv - zoho).toFixed(2)}`);
console.log(`   Gross - credit notes only:             $${netRevNoSR.toFixed(2)}   units: ${grossUnits - cnRev.units}  gap: $${(netRevNoSR - zoho).toFixed(2)}`);
console.log(`   Gross - sales returns only:            $${netRevNoCN.toFixed(2)}   units: ${grossUnits - srRev.units}  gap: $${(netRevNoCN - zoho).toFixed(2)}`);
console.log(`   Net (gross - CNs - SRs) [dashboard]:  $${netRev.toFixed(2)}   units: ${netUnits}  gap: $${(netRev - zoho).toFixed(2)}`);

// 6. Check invoice statuses
const statuses = db.prepare(`
  SELECT status, COUNT(*) AS cnt, COALESCE(SUM(i.total),0) AS total
  FROM invoices i
  WHERE i.date BETWEEN ? AND ?
  GROUP BY status ORDER BY total DESC
`).all(start, end);

console.log(`\n6. INVOICE STATUSES MTD:`);
statuses.forEach(r => console.log(`   ${r.status.padEnd(12)} ${String(r.cnt).padStart(4)} invoices   $${r.total.toFixed(2)}`));

db.close();
