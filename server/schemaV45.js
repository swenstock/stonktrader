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
  // Old tickets were all Main Event tickets. Preserve them by defaulting
  // migrated rows to main_event while enabling lower-tier ticket inventory.
  addColumn('tickets', "ticket_type TEXT NOT NULL DEFAULT 'main_event'");
  addColumn('tickets', 'applied_to_satellite_id INTEGER');
  addColumn('tickets', 'backing_stonk REAL');

  // Fill explicit backing for legacy Main Event tickets.
  db.prepare("UPDATE tickets SET backing_stonk = value_stonk WHERE backing_stonk IS NULL").run();

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tickets_type_owner_status
      ON tickets(ticket_type, account_id, status);

    -- One bid = one ticket. Funds are held when the bid is posted so a
    -- seller can fill it atomically without depending on the buyer still
    -- having a balance later.
    CREATE TABLE IF NOT EXISTS ticket_bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      ticket_type TEXT NOT NULL,
      bid_price REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', -- active | filled | cancelled
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

    -- Immutable SBC-side reserve movements. User balances remain in the
    -- existing ledger_entries table. This records platform economic buckets.
    CREATE TABLE IF NOT EXISTS sbc_reserve_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bucket TEXT NOT NULL, -- freeroll_reserve | main_event_reserve | ticket_liability | platform_revenue
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sbc_reserve_bucket
      ON sbc_reserve_ledger(bucket, id);
  `);
}

module.exports = { run };
