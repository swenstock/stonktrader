// Backward-compatible V45 schema additions.
// Runs after db.js creates the legacy schema. Never drops existing data.

const db = require('./db');

function columns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name));
}

function addColumn(table, definition) {
  const name = definition.trim().split(/\s+/)[0];
  if (!columns(table).has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function run() {
  addColumn('tickets', "ticket_type TEXT NOT NULL DEFAULT 'main_event'");
  addColumn('tickets', 'applied_to_satellite_id INTEGER');
  addColumn('tickets', 'backing_stonk REAL');
  addColumn('satellites', 'settlement_version TEXT');
  addColumn('satellites', 'settlement_error TEXT');
  addColumn('satellite_results', 'entry_id INTEGER');
  addColumn('satellite_results', 'portfolio_id INTEGER');
  addColumn('satellite_results', 'ticket_type TEXT');
  addColumn('satellite_results', 'ticket_quantity INTEGER');
  addColumn('satellite_results', 'stonk_bonus REAL');
  db.prepare("UPDATE tickets SET backing_stonk = value_stonk WHERE backing_stonk IS NULL").run();

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tickets_type_owner_status
      ON tickets(ticket_type, account_id, status);

    CREATE TABLE IF NOT EXISTS ticket_bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      ticket_type TEXT NOT NULL,
      bid_price REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      filled_ticket_id INTEGER REFERENCES tickets(id),
      seller_account_id INTEGER REFERENCES accounts(id),
      platform_fee_stonk REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      filled_at TEXT,
      cancelled_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_bids_book
      ON ticket_bids(ticket_type, status, bid_price DESC);
    CREATE INDEX IF NOT EXISTS idx_ticket_bids_buyer
      ON ticket_bids(buyer_account_id, status);

    CREATE TABLE IF NOT EXISTS quick_ticket_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      symbols_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(account_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_quick_ticket_lists_account
      ON quick_ticket_lists(account_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS sbc_reserve_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bucket TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sbc_reserve_bucket
      ON sbc_reserve_ledger(bucket, id);

    INSERT OR IGNORE INTO freeroll_fund (category_id) VALUES ('race_to_close');

    CREATE TABLE IF NOT EXISTS freeroll_reserve_v45 (
      category_id TEXT PRIMARY KEY,
      balance_stonk REAL NOT NULL DEFAULT 0,
      contributed_lifetime REAL NOT NULL DEFAULT 0,
      spent_lifetime REAL NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO freeroll_reserve_v45 (category_id) VALUES
      ('weekly_qualifier'), ('full_day'), ('morning'), ('afternoon'), ('degen');

    DROP TRIGGER IF EXISTS trg_v45_mirror_freeroll_contribution;
    CREATE TRIGGER trg_v45_mirror_freeroll_contribution
    AFTER UPDATE OF accumulated_stonk ON freeroll_fund
    WHEN NEW.accumulated_stonk > OLD.accumulated_stonk
    BEGIN
      INSERT OR IGNORE INTO freeroll_reserve_v45 (category_id)
      VALUES (CASE WHEN NEW.category_id IN ('hourly','race_to_close') THEN 'degen' ELSE NEW.category_id END);

      UPDATE freeroll_reserve_v45
      SET balance_stonk = balance_stonk + (NEW.accumulated_stonk - OLD.accumulated_stonk),
          contributed_lifetime = contributed_lifetime + (NEW.accumulated_stonk - OLD.accumulated_stonk),
          updated_at = CURRENT_TIMESTAMP
      WHERE category_id = CASE WHEN NEW.category_id IN ('hourly','race_to_close') THEN 'degen' ELSE NEW.category_id END;

      INSERT INTO sbc_reserve_ledger (bucket, amount, reason, reference_type, reference_id)
      VALUES ('freeroll_reserve', NEW.accumulated_stonk - OLD.accumulated_stonk,
              'protected_freeroll_contribution', 'freeroll_fund', NULL);
    END;
  `);
}

module.exports = { run };
