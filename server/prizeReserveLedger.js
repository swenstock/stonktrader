'use strict';

const SUBUNITS_PER_STONK = 1000000n;
const BROKER_RESERVE_BUCKET = 'broker_reserve';
const OVERFLOW_RESERVE_BUCKET = 'overflow_reserve';

function assertBigInt(value, label) {
  if (typeof value !== 'bigint') throw new TypeError(`${label} must be a bigint sub-unit amount`);
  if (value < 0n) throw new RangeError(`${label} must be non-negative`);
}

function assertIssuanceId(issuanceId) {
  if (typeof issuanceId !== 'string' || !issuanceId.trim()) {
    throw new TypeError('issuanceId must be a non-empty string');
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
  `);
}

function getBalances(db) {
  ensureSchema(db);
  const rows = prepareBigInt(db, `
    SELECT bucket, balance_subunits, credited_lifetime_subunits
    FROM sbc_prize_reserve_accounts
    ORDER BY bucket
  `).all();

  const out = {};
  for (const row of rows) {
    out[row.bucket] = {
      balanceSubunits: row.balance_subunits,
      creditedLifetimeSubunits: row.credited_lifetime_subunits,
    };
  }
  return out;
}

function creditIssuance(db, { issuanceId, brokerSubunits, overflowSubunits, reason = 'prize_reserve_issuance' }) {
  ensureSchema(db);
  assertIssuanceId(issuanceId);
  assertBigInt(brokerSubunits, 'brokerSubunits');
  assertBigInt(overflowSubunits, 'overflowSubunits');
  if (typeof reason !== 'string' || !reason.trim()) throw new TypeError('reason must be a non-empty string');

  db.exec('BEGIN IMMEDIATE');
  try {
    prepareBigInt(db, `
      INSERT INTO sbc_prize_reserve_issuance_credits
        (issuance_id, broker_subunits, overflow_subunits, reason)
      VALUES (?, ?, ?, ?)
    `).run(issuanceId, brokerSubunits, overflowSubunits, reason);

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

    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    if (/UNIQUE constraint failed|PRIMARY KEY/.test(String(err && err.message))) {
      const duplicate = new Error(`issuance already credited: ${issuanceId}`);
      duplicate.code = 'DUPLICATE_ISSUANCE';
      throw duplicate;
    }
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
};
