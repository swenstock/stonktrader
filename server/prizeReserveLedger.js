'use strict';

const SUBUNITS_PER_STONK = 1000000n;
const BROKER_RESERVE_BUCKET = 'broker_reserve';
const OVERFLOW_RESERVE_BUCKET = 'overflow_reserve';

function assertBigInt(value, label) {
  if (typeof value !== 'bigint') throw new TypeError(`${label} must be a bigint sub-unit amount`);
  if (value < 0n) throw new RangeError(`${label} must be non-negative`);
}

function assertNonEmptyId(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function assertBucket(bucket) {
  if (![BROKER_RESERVE_BUCKET, OVERFLOW_RESERVE_BUCKET].includes(bucket)) {
    throw new TypeError(`unsupported reserve bucket: ${bucket}`);
  }
}

function prepareBigInt(db, sql) {
  const stmt = db.prepare(sql);
  stmt.setReadBigInts(true);
  return stmt;
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sbc_prize_reserve_accounts (
      bucket TEXT PRIMARY KEY CHECK(bucket IN ('broker_reserve','overflow_reserve')),
      balance_subunits INTEGER NOT NULL DEFAULT 0 CHECK(typeof(balance_subunits) = 'integer' AND balance_subunits >= 0),
      credited_lifetime_subunits INTEGER NOT NULL DEFAULT 0 CHECK(typeof(credited_lifetime_subunits) = 'integer' AND credited_lifetime_subunits >= 0),
      debited_lifetime_subunits INTEGER NOT NULL DEFAULT 0 CHECK(typeof(debited_lifetime_subunits) = 'integer' AND debited_lifetime_subunits >= 0),
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO sbc_prize_reserve_accounts (bucket) VALUES
      ('broker_reserve'), ('overflow_reserve');

    CREATE TABLE IF NOT EXISTS sbc_prize_reserve_issuance_credits (
      issuance_id TEXT PRIMARY KEY,
      broker_subunits INTEGER NOT NULL CHECK(typeof(broker_subunits) = 'integer' AND broker_subunits >= 0),
      overflow_subunits INTEGER NOT NULL CHECK(typeof(overflow_subunits) = 'integer' AND overflow_subunits >= 0),
      reason TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sbc_prize_reserve_debits (
      debit_id TEXT PRIMARY KEY,
      bucket TEXT NOT NULL CHECK(bucket IN ('broker_reserve','overflow_reserve')),
      amount_subunits INTEGER NOT NULL CHECK(typeof(amount_subunits) = 'integer' AND amount_subunits >= 0),
      reason TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const accountColumns = new Set(
    db.prepare('PRAGMA table_info(sbc_prize_reserve_accounts)').all().map(row => row.name)
  );
  if (!accountColumns.has('debited_lifetime_subunits')) {
    db.exec(`
      ALTER TABLE sbc_prize_reserve_accounts
      ADD COLUMN debited_lifetime_subunits INTEGER NOT NULL DEFAULT 0
      CHECK(typeof(debited_lifetime_subunits) = 'integer' AND debited_lifetime_subunits >= 0)
    `);
  }
}

function getBalances(db) {
  ensureSchema(db);
  const rows = prepareBigInt(db, `
    SELECT bucket, balance_subunits, credited_lifetime_subunits, debited_lifetime_subunits
    FROM sbc_prize_reserve_accounts
    ORDER BY bucket
  `).all();

  const out = {};
  for (const row of rows) {
    out[row.bucket] = {
      balanceSubunits: row.balance_subunits,
      creditedLifetimeSubunits: row.credited_lifetime_subunits,
      debitedLifetimeSubunits: row.debited_lifetime_subunits,
    };
  }
  return out;
}

function translateDuplicate(err, code, message) {
  if (/UNIQUE constraint failed|PRIMARY KEY/.test(String(err && err.message))) {
    const duplicate = new Error(message);
    duplicate.code = code;
    return duplicate;
  }
  return err;
}

function creditIssuanceInTransaction(db, {
  issuanceId,
  brokerSubunits,
  overflowSubunits,
  reason = 'prize_reserve_issuance',
}) {
  assertNonEmptyId(issuanceId, 'issuanceId');
  assertBigInt(brokerSubunits, 'brokerSubunits');
  assertBigInt(overflowSubunits, 'overflowSubunits');
  assertNonEmptyId(reason, 'reason');

  try {
    prepareBigInt(db, `
      INSERT INTO sbc_prize_reserve_issuance_credits
        (issuance_id, broker_subunits, overflow_subunits, reason)
      VALUES (?, ?, ?, ?)
    `).run(issuanceId, brokerSubunits, overflowSubunits, reason);
  } catch (err) {
    throw translateDuplicate(err, 'DUPLICATE_ISSUANCE', `issuance already credited: ${issuanceId}`);
  }

  prepareBigInt(db, `
    UPDATE sbc_prize_reserve_accounts
    SET balance_subunits = balance_subunits + ?,
        credited_lifetime_subunits = credited_lifetime_subunits + ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE bucket = ?
  `).run(brokerSubunits, brokerSubunits, BROKER_RESERVE_BUCKET);

  prepareBigInt(db, `
    UPDATE sbc_prize_reserve_accounts
    SET balance_subunits = balance_subunits + ?,
        credited_lifetime_subunits = credited_lifetime_subunits + ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE bucket = ?
  `).run(overflowSubunits, overflowSubunits, OVERFLOW_RESERVE_BUCKET);
}

function creditIssuance(db, params) {
  ensureSchema(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    creditIssuanceInTransaction(db, params);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
  return getBalances(db);
}

function debitReserveInTransaction(db, {
  debitId,
  bucket,
  amountSubunits,
  reason = 'prize_reserve_debit',
}) {
  assertNonEmptyId(debitId, 'debitId');
  assertBucket(bucket);
  assertBigInt(amountSubunits, 'amountSubunits');
  assertNonEmptyId(reason, 'reason');

  try {
    prepareBigInt(db, `
      INSERT INTO sbc_prize_reserve_debits
        (debit_id, bucket, amount_subunits, reason)
      VALUES (?, ?, ?, ?)
    `).run(debitId, bucket, amountSubunits, reason);
  } catch (err) {
    throw translateDuplicate(err, 'DUPLICATE_DEBIT', `reserve debit already recorded: ${debitId}`);
  }

  const result = prepareBigInt(db, `
    UPDATE sbc_prize_reserve_accounts
    SET balance_subunits = balance_subunits - ?,
        debited_lifetime_subunits = debited_lifetime_subunits + ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE bucket = ? AND balance_subunits >= ?
  `).run(amountSubunits, amountSubunits, bucket, amountSubunits);

  if (!(result.changes === 1 || result.changes === 1n)) {
    const err = new Error(`insufficient reserve balance in ${bucket}`);
    err.code = 'INSUFFICIENT_RESERVE';
    throw err;
  }
}

function debitReserve(db, params) {
  ensureSchema(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    debitReserveInTransaction(db, params);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
  return getBalances(db);
}

module.exports = {
  SUBUNITS_PER_STONK,
  BROKER_RESERVE_BUCKET,
  OVERFLOW_RESERVE_BUCKET,
  ensureSchema,
  getBalances,
  creditIssuance,
  creditIssuanceInTransaction,
  debitReserve,
  debitReserveInTransaction,
};
