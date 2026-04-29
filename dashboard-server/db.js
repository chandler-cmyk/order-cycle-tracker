const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'invoices.db'));

// WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    invoice_id         TEXT PRIMARY KEY,
    invoice_number     TEXT,
    customer_id        TEXT,
    customer_name      TEXT,
    date               TEXT,
    status             TEXT,
    shipping_state     TEXT,
    last_modified_time TEXT,
    discount_total     REAL DEFAULT 0,
    sales_by_item_sync_version INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS line_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id  TEXT NOT NULL,
    item_id     TEXT,
    sku         TEXT,
    name        TEXT,
    brand       TEXT,
    category    TEXT,
    quantity    REAL DEFAULT 0,
    item_total  REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS customers (
    customer_id   TEXT PRIMARY KEY,
    customer_name TEXT,
    email         TEXT
  );

  CREATE TABLE IF NOT EXISTS sync_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS credit_notes (
    creditnote_id      TEXT PRIMARY KEY,
    creditnote_number  TEXT,
    customer_id        TEXT,
    customer_name      TEXT,
    date               TEXT,
    status             TEXT,
    invoice_id         TEXT,
    last_modified_time TEXT
  );

  CREATE TABLE IF NOT EXISTS credit_note_items (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    creditnote_id  TEXT NOT NULL,
    item_id        TEXT,
    sku            TEXT,
    name           TEXT,
    brand          TEXT,
    category       TEXT,
    quantity       REAL DEFAULT 0,
    item_total     REAL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_li_invoice   ON line_items(invoice_id);
  CREATE INDEX IF NOT EXISTS idx_li_sku       ON line_items(sku);
  CREATE INDEX IF NOT EXISTS idx_li_brand     ON line_items(brand);
  CREATE INDEX IF NOT EXISTS idx_li_category  ON line_items(category);
  CREATE INDEX IF NOT EXISTS idx_inv_date     ON invoices(date);
  CREATE INDEX IF NOT EXISTS idx_inv_customer ON invoices(customer_id);
  CREATE INDEX IF NOT EXISTS idx_inv_status   ON invoices(status);
  CREATE INDEX IF NOT EXISTS idx_inv_state    ON invoices(shipping_state);
  CREATE TABLE IF NOT EXISTS sales_returns (
    salesreturn_id     TEXT PRIMARY KEY,
    salesreturn_number TEXT,
    customer_id        TEXT,
    customer_name      TEXT,
    date               TEXT,
    status             TEXT,
    shipping_state     TEXT,
    invoice_id         TEXT,
    last_modified_time TEXT,
    linked_creditnote_sync_version INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sales_return_items (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    salesreturn_id   TEXT NOT NULL,
    item_id          TEXT,
    sku              TEXT,
    name             TEXT,
    brand            TEXT,
    category         TEXT,
    quantity         REAL DEFAULT 0,
    item_total       REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sales_return_credit_notes (
    salesreturn_id TEXT NOT NULL,
    creditnote_id  TEXT NOT NULL,
    PRIMARY KEY (salesreturn_id, creditnote_id)
  );

  CREATE INDEX IF NOT EXISTS idx_cni_cn       ON credit_note_items(creditnote_id);
  CREATE INDEX IF NOT EXISTS idx_cn_date      ON credit_notes(date);
  CREATE INDEX IF NOT EXISTS idx_cn_customer  ON credit_notes(customer_id);
  CREATE INDEX IF NOT EXISTS idx_sri_sr       ON sales_return_items(salesreturn_id);
  CREATE INDEX IF NOT EXISTS idx_sr_date      ON sales_returns(date);
  CREATE INDEX IF NOT EXISTS idx_sr_customer  ON sales_returns(customer_id);
  CREATE INDEX IF NOT EXISTS idx_sr_status    ON sales_returns(status);
  CREATE INDEX IF NOT EXISTS idx_srcn_sr      ON sales_return_credit_notes(salesreturn_id);
  CREATE INDEX IF NOT EXISTS idx_srcn_cn      ON sales_return_credit_notes(creditnote_id);
`);

// Idempotent migrations — add columns that may not exist in older DBs
try { db.exec(`ALTER TABLE credit_notes  ADD COLUMN invoice_id TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE sales_returns ADD COLUMN invoice_id TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE sales_returns ADD COLUMN linked_creditnote_sync_version INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE invoices ADD COLUMN discount_total REAL DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE invoices ADD COLUMN sales_by_item_sync_version INTEGER DEFAULT 0`); } catch (_) {}

module.exports = db;
