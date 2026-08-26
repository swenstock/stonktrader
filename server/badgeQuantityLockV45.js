'use strict';

function assertAccountId(accountId) {
  if (!Number.isSafeInteger(accountId) || accountId <= 0) {
    throw new TypeError('accountId must be a positive safe integer');
  }
}

function assertAssetType(assetType) {
  if (typeof assetType !== 'string' || !assetType.trim()) {
    throw new TypeError('assetType must be a non-empty string');
  }
}

function assertPositiveBigInt(value, label) {
  if (typeof value !== 'bigint') throw new TypeError(`${label} must be a bigint`);
  if (value <= 0n) throw new RangeError(`${label} must be greater than zero`);
}

function prepareBigInt(db, sql) {
  const stmt = db.prepare(sql);
  stmt.setReadBigInts(true);
  return stmt;
}

function tableExists(db, table) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
}

function columns(db, table) {
  if (!tableExists(db, table)) return new Set();
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name));
}

function ensureSchema(db) {
  if (!tableExists(db, 'sbc_prize_holdings')) {
    db.exec(`
      CREATE TABLE sbc_prize_holdings (
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        asset_type TEXT NOT NULL CHECK(typeof(asset_type) = 'text' AND length(trim(asset_type)) > 0),
        quantity INTEGER NOT NULL DEFAULT 0 CHECK(typeof(quantity) = 'integer' AND quantity >= 0),
        quantity_listed INTEGER NOT NULL DEFAULT 0
          CHECK(typeof(quantity_listed) = 'integer' AND quantity_listed >= 0 AND quantity_listed <= quantity),
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(account_id, asset_type)
      );
    `);
    return;
  }

  if (!columns(db, 'sbc_prize_holdings').has('quantity_listed')) {
    db.exec(`
      ALTER TABLE sbc_prize_holdings
      ADD COLUMN quantity_listed INTEGER NOT NULL DEFAULT 0
      CHECK(typeof(quantity_listed) = 'integer' AND quantity_listed >= 0 AND quantity_listed <= quantity)
    `);
  }
}

function getHoldingReservation(db, accountId, assetType) {
  ensureSchema(db);
  assertAccountId(accountId);
  assertAssetType(assetType);
  const row = prepareBigInt(db, `
    SELECT quantity, quantity_listed
    FROM sbc_prize_holdings
    WHERE account_id = ? AND asset_type = ?
  `).get(accountId, assetType);
  return row || { quantity: 0n, quantity_listed: 0n };
}

function reserveListedQuantityInTransaction(db, { accountId, assetType, quantity = 1n }) {
  assertAccountId(accountId);
  assertAssetType(assetType);
  assertPositiveBigInt(quantity, 'quantity');

  const result = prepareBigInt(db, `
    UPDATE sbc_prize_holdings
    SET quantity_listed = quantity_listed + ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE account_id = ?
      AND asset_type = ?
      AND quantity_listed + ? <= quantity
  `).run(quantity, accountId, assetType, quantity);

  if (!(result.changes === 1 || result.changes === 1n)) {
    const err = new Error(`insufficient unlisted ${assetType} units`);
    err.code = 'INSUFFICIENT_UNLISTED_QUANTITY';
    throw err;
  }

  return getHoldingReservation(db, accountId, assetType);
}

function releaseListedQuantityInTransaction(db, { accountId, assetType, quantity = 1n }) {
  assertAccountId(accountId);
  assertAssetType(assetType);
  assertPositiveBigInt(quantity, 'quantity');

  const result = prepareBigInt(db, `
    UPDATE sbc_prize_holdings
    SET quantity_listed = quantity_listed - ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE account_id = ?
      AND asset_type = ?
      AND quantity_listed >= ?
  `).run(quantity, accountId, assetType, quantity);

  if (!(result.changes === 1 || result.changes === 1n)) {
    const err = new Error(`insufficient listed ${assetType} units to release`);
    err.code = 'INSUFFICIENT_LISTED_QUANTITY';
    throw err;
  }

  return getHoldingReservation(db, accountId, assetType);
}

function withImmediateTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
}

function reserveListedQuantity(db, params) {
  ensureSchema(db);
  return withImmediateTransaction(db, () => reserveListedQuantityInTransaction(db, params));
}

function releaseListedQuantity(db, params) {
  ensureSchema(db);
  return withImmediateTransaction(db, () => releaseListedQuantityInTransaction(db, params));
}

module.exports = {
  ensureSchema,
  getHoldingReservation,
  reserveListedQuantity,
  reserveListedQuantityInTransaction,
  releaseListedQuantity,
  releaseListedQuantityInTransaction,
};
