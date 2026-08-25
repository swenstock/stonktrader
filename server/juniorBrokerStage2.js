'use strict';

const {
  SUBUNITS_PER_STONK,
  BROKER_RESERVE_BUCKET,
  ensureSchema: ensureReserveSchema,
  getBalances,
  creditIssuanceInTransaction,
  debitReserveInTransaction,
} = require('./prizeReserveLedger');

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
  db.exec(`
    CREATE TABLE IF NOT EXISTS sbc_prize_holdings (
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      asset_type TEXT NOT NULL CHECK(asset_type = 'junior_broker_share'),
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(typeof(quantity) = 'integer' AND quantity >= 0),
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(account_id, asset_type)
    );

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

    prepareBigInt(db, `
      INSERT INTO sbc_junior_broker_issuances
        (issuance_id, account_id, asset_type, source, gross_subunits, broker_subunits, overflow_subunits)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(issuanceId, accountId, ASSET_TYPE, source, split.grossSubunits, split.brokerSubunits, split.overflowSubunits);

    prepareBigInt(db, `
      INSERT INTO sbc_prize_holdings (account_id, asset_type, quantity)
      VALUES (?, ?, 1)
      ON CONFLICT(account_id, asset_type) DO UPDATE SET
        quantity = quantity + 1,
        updated_at = CURRENT_TIMESTAMP
    `).run(accountId, ASSET_TYPE);

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
    const holding = prepareBigInt(db, `SELECT quantity FROM sbc_prize_holdings WHERE account_id = ? AND asset_type = ?`).get(accountId, ASSET_TYPE);
    const count = holding ? holding.quantity : 0n;
    if (count < REDEEM_COUNT) {
      const err = new Error('20 Junior Broker shares required');
      err.code = 'INSUFFICIENT_JUNIORS';
      throw err;
    }

    debitReserveInTransaction(db, {
      debitId: `broker-redemption:${redemptionId}`,
      bucket: BROKER_RESERVE_BUCKET,
      amountSubunits: ACTIVATED_BROKER_COST,
      reason: 'activated_broker_redemption',
    });

    prepareBigInt(db, `
      UPDATE sbc_prize_holdings
      SET quantity = quantity - 20, updated_at = CURRENT_TIMESTAMP
      WHERE account_id = ? AND asset_type = ? AND quantity >= 20
    `).run(accountId, ASSET_TYPE);

    prepareBigInt(db, `
      INSERT INTO sbc_activated_broker_redemptions
        (redemption_id, account_id, source_asset_type, shares_burned, broker_reserve_debit_subunits, status)
      VALUES (?, ?, ?, 20, ?, 'funded_pending_delivery')
    `).run(redemptionId, accountId, ASSET_TYPE, ACTIVATED_BROKER_COST);

    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
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
  ensureSchema,
  splitForSource,
  getJuniorCount,
  issueFundedJuniorBrokerShare,
  redeemJuniorsForActivatedBroker,
};
