'use strict';

const {
  SUBUNITS_PER_STONK,
  BROKER_RESERVE_BUCKET,
  OVERFLOW_RESERVE_BUCKET,
  ensureSchema: ensureReserveSchema,
  getBalances,
  creditFunding,
  creditFundingInTransaction,
  transferReserveInTransaction,
} = require('./prizeReserveLedger');
const {
  ASSET_TYPE,
  SOURCE_WON,
  BROKER_SHARE,
  WON_TOTAL,
  WON_OVERFLOW,
  ensureSchema: ensureJuniorSchema,
  getJuniorCount,
  recordJuniorIssuanceInTransaction,
} = require('./juniorBrokerStage2');

const RAKE_BASIS_POINTS = 1500n;
const BASIS_POINTS_DENOMINATOR = 10000n;

function assertId(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
}

function assertAccountId(accountId) {
  if (!Number.isSafeInteger(accountId) || accountId <= 0) throw new TypeError('accountId must be a positive safe integer');
}

function assertPositiveBigInt(value, label) {
  if (typeof value !== 'bigint') throw new TypeError(`${label} must be a bigint sub-unit amount`);
  if (value <= 0n) throw new RangeError(`${label} must be greater than zero`);
}

function prepareBigInt(db, sql) {
  const stmt = db.prepare(sql);
  stmt.setReadBigInts(true);
  return stmt;
}

function ensureSchema(db) {
  ensureReserveSchema(db);
  ensureJuniorSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sbc_prize_pool_allocations (
      issuance_id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      asset_type TEXT NOT NULL CHECK(asset_type = 'junior_broker_share'),
      funding_unit_subunits INTEGER NOT NULL CHECK(typeof(funding_unit_subunits) = 'integer' AND funding_unit_subunits = 40000000000),
      broker_backing_subunits INTEGER NOT NULL CHECK(typeof(broker_backing_subunits) = 'integer' AND broker_backing_subunits = 36666600000),
      overflow_subunits INTEGER NOT NULL CHECK(typeof(overflow_subunits) = 'integer' AND overflow_subunits = 3333400000),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function parseStonkDecimalToSubunits(text) {
  if (typeof text !== 'string') throw new TypeError('STONK decimal input must be a string');
  const raw = text.trim();
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(raw);
  if (!match) throw new TypeError('STONK decimal input must have at most 6 fractional digits');
  const whole = BigInt(match[1]);
  const fraction = (match[2] || '').padEnd(6, '0');
  return whole * SUBUNITS_PER_STONK + BigInt(fraction || '0');
}

function computePostRakeNetSubunits(grossSubunits, rakeBasisPoints = RAKE_BASIS_POINTS) {
  assertPositiveBigInt(grossSubunits, 'grossSubunits');
  if (typeof rakeBasisPoints !== 'bigint' || rakeBasisPoints < 0n || rakeBasisPoints >= BASIS_POINTS_DENOMINATOR) {
    throw new RangeError('rakeBasisPoints must be a bigint from 0 through 9999');
  }
  const numerator = grossSubunits * (BASIS_POINTS_DENOMINATOR - rakeBasisPoints);
  if (numerator % BASIS_POINTS_DENOMINATOR !== 0n) {
    const err = new Error('post-rake amount is not representable in whole STONK sub-units');
    err.code = 'RAKE_SUBUNIT_REMAINDER';
    throw err;
  }
  return numerator / BASIS_POINTS_DENOMINATOR;
}

function outstandingJuniorBackingSubunits(db) {
  const row = prepareBigInt(db, `
    SELECT COALESCE(SUM(quantity), 0) AS quantity
    FROM sbc_prize_holdings
    WHERE asset_type = ?
  `).get(ASSET_TYPE);
  return row.quantity * BROKER_SHARE;
}

function poolStatusInTransaction(db) {
  const broker = prepareBigInt(db, `
    SELECT balance_subunits FROM sbc_prize_reserve_accounts WHERE bucket = ?
  `).get(BROKER_RESERVE_BUCKET);
  const brokerBalanceSubunits = broker ? broker.balance_subunits : 0n;
  const backingLiabilitySubunits = outstandingJuniorBackingSubunits(db);
  if (brokerBalanceSubunits < backingLiabilitySubunits) {
    const err = new Error('Broker Reserve is below outstanding Junior backing liability');
    err.code = 'RESERVE_BACKING_DEFICIT';
    throw err;
  }
  const unallocatedSubunits = brokerBalanceSubunits - backingLiabilitySubunits;
  return {
    brokerBalanceSubunits,
    backingLiabilitySubunits,
    unallocatedSubunits,
    wonJuniorFundingUnitSubunits: WON_TOTAL,
    fundableWonJuniors: unallocatedSubunits / WON_TOTAL,
  };
}

function getContestFundingPoolStatus(db) {
  ensureSchema(db);
  return poolStatusInTransaction(db);
}

function recordContestFundingInTransaction(db, { fundingId, sourceType, sourceId, netPrizeSubunits }) {
  assertId(fundingId, 'fundingId');
  assertId(sourceType, 'sourceType');
  assertId(String(sourceId), 'sourceId');
  assertPositiveBigInt(netPrizeSubunits, 'netPrizeSubunits');
  creditFundingInTransaction(db, {
    fundingId,
    bucket: BROKER_RESERVE_BUCKET,
    amountSubunits: netPrizeSubunits,
    sourceType,
    sourceId: String(sourceId),
    reason: 'post_rake_contest_prize_funding',
  });
  return poolStatusInTransaction(db);
}

function recordPostRakeContestFunding(db, params) {
  ensureSchema(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    recordContestFundingInTransaction(db, params);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
  return getContestFundingPoolStatus(db);
}

function issueWonJuniorFromContestPoolInTransaction(db, { issuanceId, accountId }) {
  assertId(issuanceId, 'issuanceId');
  assertAccountId(accountId);
  const before = poolStatusInTransaction(db);
  if (before.unallocatedSubunits < WON_TOTAL) {
    const err = new Error('pooled contest funding cannot yet cover one won Junior');
    err.code = 'INSUFFICIENT_CONTEST_FUNDING';
    throw err;
  }
  try {
    prepareBigInt(db, `
      INSERT INTO sbc_prize_pool_allocations
        (issuance_id, account_id, asset_type, funding_unit_subunits, broker_backing_subunits, overflow_subunits)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(issuanceId, accountId, ASSET_TYPE, WON_TOTAL, BROKER_SHARE, WON_OVERFLOW);
  } catch (err) {
    if (/UNIQUE constraint failed|PRIMARY KEY/.test(String(err && err.message))) {
      const duplicate = new Error(`contest pool allocation already recorded: ${issuanceId}`);
      duplicate.code = 'DUPLICATE_ISSUANCE';
      throw duplicate;
    }
    throw err;
  }
  transferReserveInTransaction(db, {
    transferId: `won-junior-overflow:${issuanceId}`,
    fromBucket: BROKER_RESERVE_BUCKET,
    toBucket: OVERFLOW_RESERVE_BUCKET,
    amountSubunits: WON_OVERFLOW,
    reason: 'won_junior_overflow_allocation',
  });
  recordJuniorIssuanceInTransaction(db, {
    issuanceId, accountId, source: SOURCE_WON,
    split: { grossSubunits: WON_TOTAL, brokerSubunits: BROKER_SHARE, overflowSubunits: WON_OVERFLOW },
  });
  return poolStatusInTransaction(db);
}

function issueWonJuniorFromContestPool(db, params) {
  ensureSchema(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    issueWonJuniorFromContestPoolInTransaction(db, params);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
  const { issuanceId, accountId } = params;
  return {
    issuanceId, accountId, assetType: ASSET_TYPE, source: SOURCE_WON, count: getJuniorCount(db, accountId),
    fundingUnitSubunits: WON_TOTAL, brokerBackingSubunits: BROKER_SHARE, overflowSubunits: WON_OVERFLOW,
    pool: getContestFundingPoolStatus(db), balances: getBalances(db),
  };
}

module.exports = {
  RAKE_BASIS_POINTS,
  BASIS_POINTS_DENOMINATOR,
  parseStonkDecimalToSubunits,
  computePostRakeNetSubunits,
  ensureSchema,
  getContestFundingPoolStatus,
  poolStatusInTransaction,
  recordContestFundingInTransaction,
  recordPostRakeContestFunding,
  issueWonJuniorFromContestPoolInTransaction,
  issueWonJuniorFromContestPool,
};
