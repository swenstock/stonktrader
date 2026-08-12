// Database layer — Node's built-in SQLite (node:sqlite), added in Node 22+.
//
// Why this instead of better-sqlite3: better-sqlite3 has to compile a native
// C++ module on install, which requires a C++ build toolchain (Visual Studio
// Build Tools on Windows, Xcode Command Line Tools on Mac) — a genuinely rough
// first install for anyone not already set up for native Node development.
// node:sqlite ships inside Node itself, so `npm install` never has to compile
// anything. It's marked "experimental" (you'll see a harmless warning when the
// server starts) but is fully functional for this app's needs.
//
// Scale note: same story as before — SQLite handles a 10k-account starting
// scale comfortably; the one real limit is write concurrency, since SQLite
// serializes writes to a single file. If you outgrow that, swap this file for
// a Postgres connection — everything else talks to the DB through the same
// prepare/run/get/all query shapes, so the migration is contained here.

const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "app.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;"); // allows concurrent reads while writing
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  referral_code TEXT UNIQUE NOT NULL,
  referred_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cash_balance REAL NOT NULL DEFAULT 100000,
  starting_balance REAL NOT NULL DEFAULT 100000,
  stonk_balance REAL NOT NULL DEFAULT 100000,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  avg_cost REAL NOT NULL DEFAULT 0,
  UNIQUE(account_id, symbol)
);
CREATE INDEX IF NOT EXISTS idx_positions_account ON positions(account_id);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('buy','sell')),
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_trades_account ON trades(account_id);

-- One Main Event per calendar week (Mon-Fri, US Eastern Time). Flat 15%
-- rake off the top (10% platform + 5% affiliate), remaining 85% funds as
-- many Activated Stonk Brokers as it supports via the ladder algorithm
-- (server/prizeLadder.js); the remainder goes winner-take-all to the next
-- finishing position. Entries can be paid in STONK or via a funded ticket
-- won from a satellite (see tickets table below).
CREATE TABLE IF NOT EXISTS contests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  entry_fee INTEGER NOT NULL,
  broker_unit_cost INTEGER NOT NULL, -- 733,332 (666,666 acquire + 66,666 activate)
  status TEXT NOT NULL DEFAULT 'open', -- open | resolved
  resolved_at TEXT,
  pool_gross INTEGER,
  player_pool INTEGER,           -- 85% of gross
  platform_take_stonk INTEGER,   -- realized platform revenue, in STONK
  affiliate_paid_stonk INTEGER,  -- total paid out to referrers, in STONK
  stonk_usd_price INTEGER,       -- price snapshot at resolution, stored as price*1e6 (avoids float drift)
  brokers_funded INTEGER,
  remainder_stonk INTEGER,
  remainder_account_id INTEGER REFERENCES accounts(id),
  remainder_display_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_contests_status ON contests(status);
CREATE INDEX IF NOT EXISTS idx_contests_week ON contests(week_start);

-- Ranked finishers of a resolved Main Event — one row per entrant, so the
-- app can show "you finished #4, you won a Broker" etc, not just the winner.
CREATE TABLE IF NOT EXISTS contest_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  pl REAL NOT NULL,
  prize_type TEXT NOT NULL, -- broker | stonk | none
  prize_amount INTEGER      -- STONK amount if prize_type='stonk', else null
);
CREATE INDEX IF NOT EXISTS idx_contest_results_contest ON contest_results(contest_id);

CREATE TABLE IF NOT EXISTS contest_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entry_fee_paid INTEGER NOT NULL, -- always 3,000 face value, whether paid in STONK or via ticket
  paid_with_ticket_id INTEGER REFERENCES tickets(id),
  starting_value REAL NOT NULL,
  escrow_status TEXT NOT NULL DEFAULT 'held', -- held | captured | refunded
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(contest_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_entries_contest ON contest_entries(contest_id);
CREATE INDEX IF NOT EXISTS idx_entries_account ON contest_entries(account_id);

-- Every payout to a referrer, generated automatically when a referred
-- user's contest entry is captured (see contestScheduler.js). This is a
-- ledger for transparency (referrers can see exactly what earned them what)
-- as well as the source of truth for total earnings.
CREATE TABLE IF NOT EXISTS referral_earnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contest_entry_id INTEGER NOT NULL REFERENCES contest_entries(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_referrer ON referral_earnings(referrer_user_id);

-- One satellite tier for now (Phase 1) — same ladder algorithm as the Main
-- Event, but the unit is a 3,000 STONK Main Event ticket instead of a
-- 733,332 STONK Broker. Runs on a recurring schedule (see
-- satelliteScheduler.js).
CREATE TABLE IF NOT EXISTS satellites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tier_id TEXT NOT NULL,
  name TEXT NOT NULL,
  entry_fee INTEGER NOT NULL,
  ticket_cost INTEGER NOT NULL DEFAULT 3000,
  opens_at TEXT NOT NULL,
  locks_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | resolved
  resolved_at TEXT,
  pool_gross INTEGER,
  player_pool INTEGER,
  platform_take_stonk INTEGER,
  affiliate_paid_stonk INTEGER,
  stonk_usd_price INTEGER,
  tickets_funded INTEGER,
  remainder_stonk INTEGER,
  remainder_account_id INTEGER REFERENCES accounts(id),
  remainder_display_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_satellites_status ON satellites(status);
CREATE INDEX IF NOT EXISTS idx_satellites_tier ON satellites(tier_id, status);

CREATE TABLE IF NOT EXISTS satellite_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  satellite_id INTEGER NOT NULL REFERENCES satellites(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entry_fee_paid INTEGER NOT NULL,
  starting_value REAL NOT NULL,
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(satellite_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_satellite_entries_satellite ON satellite_entries(satellite_id);

-- A funded Main Event seat won from a satellite. "Funded" means the 3,000
-- STONK backing it has already been collected during the satellite — using
-- a ticket to enter the Main Event doesn't charge the holder again, but
-- still counts fully toward that Main Event's gross pool (see
-- contests.js POST /:id/enter).
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source_satellite_id INTEGER REFERENCES satellites(id),
  value_stonk INTEGER NOT NULL DEFAULT 3000,
  status TEXT NOT NULL DEFAULT 'unredeemed', -- unredeemed | applied
  applied_to_contest_id INTEGER REFERENCES contests(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_account ON tickets(account_id, status);
`);

module.exports = db;
