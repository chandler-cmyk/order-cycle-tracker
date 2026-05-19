const assert = require('assert');
const Database = require('better-sqlite3');
const {
  calculateRevenueAudit,
  saveRevenueReference,
} = require('./revenue-audit');

const db = new Database(':memory:');

db.exec(`
  CREATE TABLE invoices (
    invoice_id TEXT PRIMARY KEY,
    invoice_number TEXT,
    date TEXT,
    status TEXT,
    discount_total REAL DEFAULT 0,
    sales_by_item_sync_version INTEGER DEFAULT 1
  );
  CREATE TABLE line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT NOT NULL,
    quantity REAL DEFAULT 0,
    item_total REAL DEFAULT 0
  );
  CREATE TABLE credit_notes (
    creditnote_id TEXT PRIMARY KEY,
    creditnote_number TEXT,
    date TEXT,
    status TEXT,
    invoice_id TEXT
  );
  CREATE TABLE credit_note_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creditnote_id TEXT NOT NULL,
    quantity REAL DEFAULT 0,
    item_total REAL DEFAULT 0
  );
  CREATE TABLE sales_returns (
    salesreturn_id TEXT PRIMARY KEY,
    date TEXT,
    status TEXT
  );
  CREATE TABLE sales_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    salesreturn_id TEXT NOT NULL,
    quantity REAL DEFAULT 0,
    item_total REAL DEFAULT 0
  );
  CREATE TABLE sales_return_credit_notes (
    salesreturn_id TEXT NOT NULL,
    creditnote_id TEXT NOT NULL
  );
  CREATE TABLE revenue_audit_references (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_key TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    zoho_revenue REAL NOT NULL,
    source TEXT DEFAULT 'manual',
    notes TEXT DEFAULT '',
    updated_at TEXT NOT NULL,
    UNIQUE(period_key, start_date, end_date)
  );
`);

const insertInvoice = db.prepare(`
  INSERT INTO invoices (invoice_id, invoice_number, date, status, discount_total, sales_by_item_sync_version)
  VALUES (?,?,?,?,?,?)
`);
const insertLine = db.prepare(`
  INSERT INTO line_items (invoice_id, quantity, item_total) VALUES (?,?,?)
`);
const insertCreditNote = db.prepare(`
  INSERT INTO credit_notes (creditnote_id, creditnote_number, date, status, invoice_id) VALUES (?,?,?,?,?)
`);
const insertCreditLine = db.prepare(`
  INSERT INTO credit_note_items (creditnote_id, quantity, item_total) VALUES (?,?,?)
`);

insertInvoice.run('inv_reported', 'INV-1', '2026-05-01', 'sent', 100, 1);
insertLine.run('inv_reported', 1, 600);
insertLine.run('inv_reported', 1, 400);

insertInvoice.run('inv_approved', 'INV-2', '2026-05-02', 'approved', 0, 1);
insertLine.run('inv_approved', 1, 250);

insertInvoice.run('inv_pending', 'INV-3', '2026-05-03', 'pending_approval', 0, 1);
insertLine.run('inv_pending', 1, 75);

insertCreditNote.run('cn_reported', 'CN-1', '2026-05-04', 'open', 'inv_reported');
insertCreditLine.run('cn_reported', 1, 90);

insertCreditNote.run('cn_approved', 'CN-2', '2026-05-04', 'approved', 'inv_reported');
insertCreditLine.run('cn_approved', 1, 40);

db.prepare(`INSERT INTO sales_returns (salesreturn_id, date, status) VALUES ('sr1', '2026-05-04', 'open')`).run();
db.prepare(`INSERT INTO sales_return_items (salesreturn_id, quantity, item_total) VALUES ('sr1', 1, 90)`).run();
db.prepare(`INSERT INTO sales_return_credit_notes (salesreturn_id, creditnote_id) VALUES ('sr1', 'cn_reported')`).run();

let audit = calculateRevenueAudit(db, {
  periodKey: 'MTD',
  start: '2026-05-01',
  end: '2026-05-31',
});

assert.strictEqual(audit.components.invoiceItemSubtotal, 1000);
assert.strictEqual(audit.components.invoiceDiscount, 100);
assert.strictEqual(audit.components.invoiceNetRevenue, 900);
assert.strictEqual(audit.components.creditNoteDeduction, 90);
assert.strictEqual(audit.components.salesReturnDeductionApplied, 0);
assert.strictEqual(audit.components.netRevenue, 810);
assert.strictEqual(audit.parity.status, 'unchecked');
assert.deepStrictEqual(
  audit.excluded.invoicesByStatus.map(r => [r.status, r.revenue]),
  [['approved', 250], ['pending_approval', 75]]
);
assert.deepStrictEqual(
  audit.excluded.creditNotesByStatus.map(r => [r.status, r.total]),
  [['approved', 40]]
);

saveRevenueReference(db, {
  periodKey: 'MTD',
  start: '2026-05-01',
  end: '2026-05-31',
  zohoRevenue: 810,
});

audit = calculateRevenueAudit(db, {
  periodKey: 'MTD',
  start: '2026-05-01',
  end: '2026-05-31',
});
assert.strictEqual(audit.parity.status, 'pass');
assert.strictEqual(audit.parity.delta, 0);

console.log('revenue-audit fixture passed');
