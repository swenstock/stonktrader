'use strict';

const {
  BROKER_RESERVE_BUCKET,
  OVERFLOW_RESERVE_BUCKET,
  ensureSchema: ensureReserveSchema,
  getBalances,
  debitReserveInTransaction,
} = require('./prizeReserveLedger');

const TARGET_QUANTITY = 1n;

function assertId(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
}

function assertAccountId(accountId) {
  if (!Number.isSafeInteger(accountId) || accountId <= 0) throw new TypeError('accountId must be a positive safe integer');
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

function ensureGenericHoldingsTable(db) {
  const existing = db.prepare(`
    SELECT sql FROM sqlite_master
    WHERE type = 'table' AND name = 'sbc_prize_holdings'
  `).get();

  if (existing && /asset_type\s*=\s*'junior_broker_share'/.test(existing.sql || '')) {
    db.exec(`
      ALTER TABLE sbc_prize_holdings RENAME TO sbc_prize_holdings_stage3_legacy;

      CREATE TABLE sbc_prize_holdings (
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        asset_type TEXT NOT NULL CHECK(typeof(asset_type) = 'text' AND length(trim(asset_type)) > 0),
        quantity INTEGER NOT NULL DEFAULT 0 CHECK(typeof(quantity) = 'integer' AND quantity >= 0),
        quantity_listed INTEGER NOT NULL DEFAULT 0 CHECK(typeof(quantity_listed) = 'integer' AND quantity_listed >= 0 AND quantity_listed <= quantity),
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(account_id, asset_type)
      );

      INSERT INTO sbc_prize_holdings (account_id, asset_type, quantity, quantity_listed, updated_at)
      SELECT account_id, asset_type, quantity, 0, updated_at
      FROM sbc_prize_holdings_stage3_legacy;

      DROP TABLE sbc_prize_holdings_stage3_legacy;
    `);
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS sbc_prize_holdings (
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      asset_type TEXT NOT NULL CHECK(typeof(asset_type) = 'text' AND length(trim(asset_type)) > 0),
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(typeof(quantity) = 'integer' AND quantity >= 0),
      quantity_listed INTEGER NOT NULL DEFAULT 0 CHECK(typeof(quantity_listed) = 'integer' AND quantity_listed >= 0 AND quantity_listed <= quantity),
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(account_id, asset_type)
    );
  `);
  const holdingColumns = new Set(db.prepare(`PRAGMA table_info(sbc_prize_holdings)`).all().map(row => row.name));
  if (!holdingColumns.has('quantity_listed')) {
    db.exec(`ALTER TABLE sbc_prize_holdings ADD COLUMN quantity_listed INTEGER NOT NULL DEFAULT 0
      CHECK(typeof(quantity_listed) = 'integer' AND quantity_listed >= 0 AND quantity_listed <= quantity)`);
  }
}

function ensureSchema(db) {
  ensureReserveSchema(db);
  ensureGenericHoldingsTable(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sbc_prize_tier_burns (
      burn_id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      source_asset_type TEXT NOT NULL,
      target_asset_type TEXT NOT NULL,
      source_quantity_burned INTEGER NOT NULL CHECK(typeof(source_quantity_burned) = 'integer' AND source_quantity_burned > 0),
      target_quantity_funded INTEGER NOT NULL CHECK(typeof(target_quantity_funded) = 'integer' AND target_quantity_funded = 1),
      reserve_bucket TEXT NOT NULL CHECK(reserve_bucket IN ('broker_reserve','overflow_reserve')),
      reserve_debit_subunits INTEGER NOT NULL CHECK(typeof(reserve_debit_subunits) = 'integer' AND reserve_debit_subunits > 0),
      reason TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function validateTierConfig(config) {
  if (!config || typeof config !== 'object') throw new TypeError('tier config is required');
  assertId(config.sourceAssetType, 'sourceAssetType');
  assertId(config.targetAssetType, 'targetAssetType');
  assertPositiveBigInt(config.burnCount, 'burnCount');
  assertPositiveBigInt(config.reserveDebitSubunits, 'reserveDebitSubunits');
  if (![BROKER_RESERVE_BUCKET, OVERFLOW_RESERVE_BUCKET].includes(config.reserveBucket)) {
    throw new TypeError(`unsupported reserve bucket: ${config.reserveBucket}`);
  }
  assertId(config.reason, 'reason');
  return Object.freeze({
    sourceAssetType: config.sourceAssetType,
    targetAssetType: config.targetAssetType,
    burnCount: config.burnCount,
    reserveBucket: config.reserveBucket,
    reserveDebitSubunits: config.reserveDebitSubunits,
    reason: config.reason,
  });
}

function getHoldingCount(db, accountId, assetType) {
  ensureSchema(db);
  assertAccountId(accountId);
  assertId(assetType, 'assetType');
  const row = prepareBigInt(db, `
    SELECT quantity FROM sbc_prize_holdings
    WHERE account_id = ? AND asset_type = ?
  `).get(accountId, assetType);
  return row ? row.quantity : 0n;
}

function burnTierForNextUnitInTransaction(db, { burnId, accountId, config }) {
  assertId(burnId, 'burnId');
  assertAccountId(accountId);
  const tier = validateTierConfig(config);

  const row = prepareBigInt(db, `
    SELECT quantity, quantity_listed FROM sbc_prize_holdings
    WHERE account_id = ? AND asset_type = ?
  `).get(accountId, tier.sourceAssetType);
  const total = row ? row.quantity : 0n;
  const listed = row ? row.quantity_listed : 0n;
  const available = total - listed;
  if (available < tier.burnCount) {
    const err = new Error(`insufficient available ${tier.sourceAssetType} units`);
    err.code = 'INSUFFICIENT_TIER_UNITS';
    err.totalUnits = total;
    err.listedUnits = listed;
    err.availableUnits = available;
    throw err;
  }

  debitReserveInTransaction(db, {
    debitId: `tier-burn:${burnId}`,
    bucket: tier.reserveBucket,
    amountSubunits: tier.reserveDebitSubunits,
    reason: tier.reason,
  });

  const holdingUpdate = prepareBigInt(db, `
    UPDATE sbc_prize_holdings
    SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
    WHERE account_id = ? AND asset_type = ? AND quantity - quantity_listed >= ?
  `).run(tier.burnCount, accountId, tier.sourceAssetType, tier.burnCount);

  if (!(holdingUpdate.changes === 1 || holdingUpdate.changes === 1n)) {
    const err = new Error(`insufficient ${tier.sourceAssetType} units`);
    err.code = 'INSUFFICIENT_TIER_UNITS';
    throw err;
  }

  try {
    prepareBigInt(db, `
      INSERT INTO sbc_prize_tier_burns
        (burn_id, account_id, source_asset_type, target_asset_type,
         source_quantity_burned, target_quantity_funded,
         reserve_bucket, reserve_debit_subunits, reason)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      burnId,
      accountId,
      tier.sourceAssetType,
      tier.targetAssetType,
      tier.burnCount,
      tier.reserveBucket,
      tier.reserveDebitSubunits,
      tier.reason,
    );
  } catch (err) {
    if (/UNIQUE constraint failed|PRIMARY KEY/.test(String(err && err.message))) {
      const duplicate = new Error(`tier burn already recorded: ${burnId}`);
      duplicate.code = 'DUPLICATE_TIER_BURN';
      throw duplicate;
    }
    throw err;
  }

  return {
    burnId,
    accountId,
    sourceAssetType: tier.sourceAssetType,
    targetAssetType: tier.targetAssetType,
    sourceQuantityBurned: tier.burnCount,
    targetQuantityFunded: TARGET_QUANTITY,
    remainingSourceUnits: total - tier.burnCount,
    remainingAvailableUnits: available - tier.burnCount,
    reserveBucket: tier.reserveBucket,
    reserveDebitSubunits: tier.reserveDebitSubunits,
  };
}

function burnTierForNextUnit(db, params) {
  ensureSchema(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = burnTierForNextUnitInTransaction(db, params);
    db.exec('COMMIT');
    return { ...result, balances: getBalances(db) };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    if (err && err.code === 'DUPLICATE_DEBIT') {
      const duplicate = new Error(`tier burn already recorded: ${params && params.burnId}`);
      duplicate.code = 'DUPLICATE_TIER_BURN';
      throw duplicate;
    }
    throw err;
  }
}

module.exports = {
  TARGET_QUANTITY,
  ensureSchema,
  validateTierConfig,
  getHoldingCount,
  burnTierForNextUnit,
  burnTierForNextUnitInTransaction,
};
