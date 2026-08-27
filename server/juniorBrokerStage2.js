'use strict';

const {
  SUBUNITS_PER_STONK,
  BROKER_RESERVE_BUCKET,
  ensureSchema: ensureReserveSchema,
  getBalances,
  creditIssuanceInTransaction,
} = require('./prizeReserveLedger');
const {
  ensureSchema: ensureTierBurnSchema,
  burnTierForNextUnitInTransaction,
} = require('./tierBurnEngine');

const ASSET_TYPE = 'junior_broker_share';
const SOURCE_WON = 'won';
const SOURCE_MINTED = 'minted';
const REDEEM_COUNT = 20n;
const ACTIVATED_BROKER_COST = 733332n * SUBUNITS_PER_STONK;
const BROKER_SHARE = 36666600000n;
const WON_TOTAL = 40000n * SUBUNITS_PER_STONK;
const WON_OVERFLOW = 3333400000n;
const MINTED_TOTAL = 48000n * SUBUNITS_PER_STONK;
const MINTED_OVERFLOW = 11333400000n;
const ACTIVATED_BROKER_ASSET_TYPE = 'activated_stonk_broker';
const JUNIOR_TO_BROKER_BURN_CONFIG = Object.freeze({
  sourceAssetType: ASSET_TYPE,
  targetAssetType: ACTIVATED_BROKER_ASSET_TYPE,
  burnCount: REDEEM_COUNT,
  reserveBucket: BROKER_RESERVE_BUCKET,
  reserveDebitSubunits: ACTIVATED_BROKER_COST,
  reason: 'activated_broker_redemption',
});

function assertAccountId(accountId) {
  if (!Number.isSafeInteger(accountId) || accountId <= 0) throw new TypeError('accountId must be a positive safe integer');
}
function assertId(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
}
function prepareBigInt(db, sql) {
  const stmt = db.prepare(sql);
  stmt.setReadBigInts(true);
  return stmt;
}

function ensureSchema(db) {
  ensureReserveSchema(db);
  ensureTierBurnSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sbc_junior_broker_issuances (
      issuance_id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      asset_type TEXT NOT NULL CHECK(asset_type = 'junior_broker_share'),
      source TEXT NOT NULL CHECK(source IN ('won','minted')),
      gross_subunits INTEGER NOT NULL CHECK(typeof(gross_subunits) = 'integer' AND gross_subunits >= 0),
      broker_subunits INTEGER NOT NULL CHECK(typeof(broker_subunits) = 'integer' AND broker_subunits >= 0),
      overflow_subunits INTEGER NOT NULL CHECK(typeof(overflow_subunits) = 'integer' AND overflow_subunits >= 0),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sbc_activated_broker_redemptions (
      redemption_id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      source_asset_type TEXT NOT NULL CHECK(source_asset_type = 'junior_broker_share'),
      shares_burned INTEGER NOT NULL CHECK(typeof(shares_burned) = 'integer' AND shares_burned = 20),
      broker_reserve_debit_subunits INTEGER NOT NULL CHECK(typeof(broker_reserve_debit_subunits) = 'integer' AND broker_reserve_debit_subunits = 733332000000),
      status TEXT NOT NULL DEFAULT 'funded_pending_delivery' CHECK(status IN ('funded_pending_delivery','delivered')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function splitForSource(source) {
  if (source === SOURCE_WON) return { grossSubunits: WON_TOTAL, brokerSubunits: BROKER_SHARE, overflowSubunits: WON_OVERFLOW };
  if (source === SOURCE_MINTED) return { grossSubunits: MINTED_TOTAL, brokerSubunits: BROKER_SHARE, overflowSubunits: MINTED_OVERFLOW };
  throw new TypeError(`unsupported Junior source: ${source}`);
}

function getJuniorCount(db, accountId) {
  ensureSchema(db);
  assertAccountId(accountId);
  const row = prepareBigInt(db, `SELECT quantity FROM sbc_prize_holdings WHERE account_id = ? AND asset_type = ?`).get(accountId, ASSET_TYPE);
  return row ? row.quantity : 0n;
}

function recordJuniorIssuanceInTransaction(db, { issuanceId, accountId, source, split = splitForSource(source) }) {
  assertId(issuanceId, 'issuanceId');
  assertAccountId(accountId);
  splitForSource(source);

  try {
    prepareBigInt(db, `
      INSERT INTO sbc_junior_broker_issuances
        (issuance_id, account_id, asset_type, source, gross_subunits, broker_subunits, overflow_subunits)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(issuanceId, accountId, ASSET_TYPE, source, split.grossSubunits, split.brokerSubunits, split.overflowSubunits);
  } catch (err) {
    if (/UNIQUE constraint failed|PRIMARY KEY/.test(String(err && err.message))) {
      const duplicate = new Error(`issuance already recorded: ${issuanceId}`);
      duplicate.code = 'DUPLICATE_ISSUANCE';
      throw duplicate;
    }
    throw err;
  }

  prepareBigInt(db, `
    INSERT INTO sbc_prize_holdings (account_id, asset_type, quantity)
    VALUES (?, ?, 1)
    ON CONFLICT(account_id, asset_type) DO UPDATE SET
      quantity = quantity + 1,
      updated_at = CURRENT_TIMESTAMP
  `).run(accountId, ASSET_TYPE);
}

function issueFundedJuniorBrokerShare(db, { issuanceId, accountId, source }) {
  ensureSchema(db);
  assertId(issuanceId, 'issuanceId');
  assertAccountId(accountId);
  const split = splitForSource(source);

  db.exec('BEGIN IMMEDIATE');
  try {
    creditIssuanceInTransaction(db, {
      issuanceId,
      brokerSubunits: split.brokerSubunits,
      overflowSubunits: split.overflowSubunits,
      reason: `junior_broker_share_${source}`,
    });
    recordJuniorIssuanceInTransaction(db, { issuanceId, accountId, source, split });
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }

  return { assetType: ASSET_TYPE, source, count: getJuniorCount(db, accountId), ...split };
}

function redeemJuniorsForActivatedBroker(db, { redemptionId, accountId }) {
  ensureSchema(db);
  assertId(redemptionId, 'redemptionId');
  assertAccountId(accountId);

  db.exec('BEGIN IMMEDIATE');
  try {
    burnTierForNextUnitInTransaction(db, {
      burnId: `junior-to-broker:${redemptionId}`,
      accountId,
      config: JUNIOR_TO_BROKER_BURN_CONFIG,
    });

    prepareBigInt(db, `
      INSERT INTO sbc_activated_broker_redemptions
        (redemption_id, account_id, source_asset_type, shares_burned, broker_reserve_debit_subunits, status)
      VALUES (?, ?, ?, 20, ?, 'funded_pending_delivery')
    `).run(redemptionId, accountId, ASSET_TYPE, ACTIVATED_BROKER_COST);

    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    if (err && err.code === 'INSUFFICIENT_TIER_UNITS') {
      if (typeof err.totalUnits === 'bigint' && err.totalUnits >= REDEEM_COUNT && err.availableUnits < REDEEM_COUNT) {
        const translated = new Error(`${err.listedUnits} Junior Broker Badge${err.listedUnits === 1n ? '' : 's'} currently listed; cancel listing(s) before promotion`);
        translated.code = 'JUNIORS_LISTED';
        translated.totalUnits = err.totalUnits;
        translated.listedUnits = err.listedUnits;
        translated.availableUnits = err.availableUnits;
        throw translated;
      }
      const translated = new Error('20 Junior Broker shares required');
      translated.code = 'INSUFFICIENT_JUNIORS';
      throw translated;
    }
    if (err && (err.code === 'DUPLICATE_TIER_BURN' || err.code === 'DUPLICATE_DEBIT')) {
      const duplicate = new Error(`redemption already recorded: ${redemptionId}`);
      duplicate.code = 'DUPLICATE_REDEMPTION';
      throw duplicate;
    }
    if (/UNIQUE constraint failed: sbc_activated_broker_redemptions.redemption_id/.test(String(err && err.message))) {
      const duplicate = new Error(`redemption already recorded: ${redemptionId}`);
      duplicate.code = 'DUPLICATE_REDEMPTION';
      throw duplicate;
    }
    throw err;
  }

  return {
    redemptionId,
    accountId,
    assetType: ASSET_TYPE,
    sharesBurned: REDEEM_COUNT,
    remainingJuniors: getJuniorCount(db, accountId),
    brokerReserveDebitSubunits: ACTIVATED_BROKER_COST,
    status: 'funded_pending_delivery',
    balances: getBalances(db),
  };
}

module.exports = {
  ASSET_TYPE,
  SOURCE_WON,
  SOURCE_MINTED,
  REDEEM_COUNT,
  ACTIVATED_BROKER_COST,
  BROKER_SHARE,
  WON_TOTAL,
  WON_OVERFLOW,
  MINTED_TOTAL,
  MINTED_OVERFLOW,
  ACTIVATED_BROKER_ASSET_TYPE,
  JUNIOR_TO_BROKER_BURN_CONFIG,
  ensureSchema,
  splitForSource,
  getJuniorCount,
  recordJuniorIssuanceInTransaction,
  issueFundedJuniorBrokerShare,
  redeemJuniorsForActivatedBroker,
};
