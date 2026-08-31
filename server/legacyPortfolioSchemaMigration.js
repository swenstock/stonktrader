'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'app.db');
const LEGACY_LABEL = 'Legacy migrated portfolio';

function tableExists(db, table) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
}

function columns(db, table) {
  if (!tableExists(db, table)) return new Set();
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name));
}

function assertLegacyShape(db, table, required) {
  const cols = columns(db, table);
  for (const name of required) {
    if (!cols.has(name)) {
      throw new Error(`Unsupported legacy ${table} schema: missing ${name}`);
    }
  }
  return cols;
}

function ensurePortfoliosTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      cash_balance REAL NOT NULL DEFAULT 100000,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const cols = columns(db, 'portfolios');
  if (!cols.has('id') || !cols.has('account_id')) {
    throw new Error('Unsupported legacy portfolios schema: id/account_id required');
  }
  if (!cols.has('label')) db.exec("ALTER TABLE portfolios ADD COLUMN label TEXT NOT NULL DEFAULT 'Legacy portfolio'");
  if (!cols.has('cash_balance')) db.exec('ALTER TABLE portfolios ADD COLUMN cash_balance REAL NOT NULL DEFAULT 100000');
  if (!cols.has('created_at')) db.exec('ALTER TABLE portfolios ADD COLUMN created_at TEXT');
}

function accountIdsNeedingMap(db, migratePositions, migrateTrades) {
  const ids = new Set();
  if (migratePositions) {
    for (const row of db.prepare('SELECT DISTINCT account_id FROM positions WHERE account_id IS NOT NULL').all()) ids.add(row.account_id);
  }
  if (migrateTrades) {
    for (const row of db.prepare('SELECT DISTINCT account_id FROM trades WHERE account_id IS NOT NULL').all()) ids.add(row.account_id);
  }
  return [...ids];
}

function portfolioForLegacyAccount(db, accountId) {
  const existing = db.prepare('SELECT id FROM portfolios WHERE account_id=? ORDER BY id').all(accountId);
  if (existing.length === 1) return existing[0].id;

  const dedicated = db.prepare('SELECT id FROM portfolios WHERE account_id=? AND label=? ORDER BY id LIMIT 1').get(accountId, LEGACY_LABEL);
  if (dedicated) return dedicated.id;

  const account = db.prepare('SELECT id FROM accounts WHERE id=?').get(accountId);
  if (!account) throw new Error(`Cannot migrate legacy portfolio rows for missing account_id=${accountId}`);

  return Number(db.prepare('INSERT INTO portfolios (account_id,label,cash_balance) VALUES (?,?,100000)').run(accountId, LEGACY_LABEL).lastInsertRowid);
}

function rebuildPositions(db) {
  db.exec(`
    ALTER TABLE positions RENAME TO positions_legacy_account_v1;
    CREATE TABLE positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      avg_cost REAL NOT NULL DEFAULT 0,
      UNIQUE(portfolio_id, symbol)
    );
    INSERT INTO positions (id, portfolio_id, symbol, quantity, avg_cost)
      SELECT p.id, m.portfolio_id, p.symbol, p.quantity, p.avg_cost
      FROM positions_legacy_account_v1 p
      JOIN _legacy_account_portfolio_map m ON m.account_id=p.account_id;
    DROP TABLE positions_legacy_account_v1;
  `);
}

function rebuildTrades(db, legacyCols) {
  const timestampExpr = legacyCols.has('timestamp') ? 't.timestamp' : 'CURRENT_TIMESTAMP';
  db.exec(`
    ALTER TABLE trades RENAME TO trades_legacy_account_v1;
    CREATE TABLE trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL CHECK(side IN ('buy','sell')),
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO trades (id, portfolio_id, symbol, side, quantity, price, timestamp)
      SELECT t.id, m.portfolio_id, t.symbol, t.side, t.quantity, t.price, ${timestampExpr}
      FROM trades_legacy_account_v1 t
      JOIN _legacy_account_portfolio_map m ON m.account_id=t.account_id;
    DROP TABLE trades_legacy_account_v1;
  `);
}

function migrateLegacyPortfolioSchema(options = {}) {
  const dbPath = options.dbPath || process.env.DB_PATH || DEFAULT_DB_PATH;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const ownDb = !options.db;
  const db = options.db || new DatabaseSync(dbPath);

  try {
    const positionCols = columns(db, 'positions');
    const tradeCols = columns(db, 'trades');
    const migratePositions = positionCols.size > 0 && !positionCols.has('portfolio_id');
    const migrateTrades = tradeCols.size > 0 && !tradeCols.has('portfolio_id');

    if (!migratePositions && !migrateTrades) {
      return { positionsMigrated: false, tradesMigrated: false, mappedAccounts: 0 };
    }

    if (migratePositions) assertLegacyShape(db, 'positions', ['id', 'account_id', 'symbol', 'quantity', 'avg_cost']);
    if (migrateTrades) assertLegacyShape(db, 'trades', ['id', 'account_id', 'symbol', 'side', 'quantity', 'price']);

    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN IMMEDIATE;');
    try {
      ensurePortfoliosTable(db);
      db.exec('CREATE TEMP TABLE _legacy_account_portfolio_map (account_id INTEGER PRIMARY KEY, portfolio_id INTEGER NOT NULL);');
      const ids = accountIdsNeedingMap(db, migratePositions, migrateTrades);
      const insertMap = db.prepare('INSERT INTO _legacy_account_portfolio_map (account_id,portfolio_id) VALUES (?,?)');
      for (const accountId of ids) insertMap.run(accountId, portfolioForLegacyAccount(db, accountId));

      if (migratePositions) rebuildPositions(db);
      if (migrateTrades) rebuildTrades(db, tradeCols);

      db.exec('DROP TABLE _legacy_account_portfolio_map;');
      db.exec('COMMIT;');
      return { positionsMigrated: migratePositions, tradesMigrated: migrateTrades, mappedAccounts: ids.length };
    } catch (err) {
      try { db.exec('ROLLBACK;'); } catch (_) {}
      throw err;
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  } finally {
    if (ownDb) db.close();
  }
}

module.exports = { migrateLegacyPortfolioSchema, LEGACY_LABEL };
