'use strict';

const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const {
  SUBUNITS_PER_STONK,
  BROKER_RESERVE_BUCKET,
  OVERFLOW_RESERVE_BUCKET,
  ensureSchema,
  getBalances,
  creditIssuance,
} = require('./prizeReserveLedger');

const db = new DatabaseSync(':memory:', { readBigInts: true });
db.exec('PRAGMA foreign_keys = ON;');
ensureSchema(db);

const WON_TOTAL = 40000n * SUBUNITS_PER_STONK;
const BROKER_SHARE = 36666600000n;
const WON_OVERFLOW = 3333400000n;
const ACTIVATED_BROKER_COST = 733332n * SUBUNITS_PER_STONK;

assert.strictEqual(WON_TOTAL, 40000000000n);
assert.strictEqual(BROKER_SHARE + WON_OVERFLOW, WON_TOTAL);
assert.strictEqual(BROKER_SHARE * 20n, ACTIVATED_BROKER_COST);

for (let i = 1; i <= 20; i += 1) {
  creditIssuance(db, {
    issuanceId: `stage1-junior-${i}`,
    brokerSubunits: BROKER_SHARE,
    overflowSubunits: WON_OVERFLOW,
    reason: 'stage1_acceptance_credit',
  });
}

let balances = getBalances(db);
assert.strictEqual(
  balances[BROKER_RESERVE_BUCKET].balanceSubunits,
  733332000000n,
  '20 exact Junior broker shares must produce 733,332.0 STONK with zero drift'
);
assert.strictEqual(
  balances[OVERFLOW_RESERVE_BUCKET].balanceSubunits,
  66668000000n,
  '20 won-Junior overflow shares must produce 66,668.0 STONK exactly'
);

const beforeDuplicateBroker = balances[BROKER_RESERVE_BUCKET].balanceSubunits;
const beforeDuplicateOverflow = balances[OVERFLOW_RESERVE_BUCKET].balanceSubunits;
assert.throws(
  () => creditIssuance(db, {
    issuanceId: 'stage1-junior-1',
    brokerSubunits: BROKER_SHARE,
    overflowSubunits: WON_OVERFLOW,
    reason: 'duplicate_should_fail',
  }),
  err => err && err.code === 'DUPLICATE_ISSUANCE',
  'same issuance ID must be rejected, not silently deduplicated'
);

balances = getBalances(db);
assert.strictEqual(balances[BROKER_RESERVE_BUCKET].balanceSubunits, beforeDuplicateBroker);
assert.strictEqual(balances[OVERFLOW_RESERVE_BUCKET].balanceSubunits, beforeDuplicateOverflow);

assert.throws(
  () => creditIssuance(db, {
    issuanceId: 'float-path-broker',
    brokerSubunits: 36666600000,
    overflowSubunits: WON_OVERFLOW,
  }),
  /must be a bigint sub-unit amount/,
  'number-valued STONK amount must fail loudly before persistence'
);
assert.throws(
  () => creditIssuance(db, {
    issuanceId: 'float-path-overflow',
    brokerSubunits: BROKER_SHARE,
    overflowSubunits: 3333400000,
  }),
  /must be a bigint sub-unit amount/,
  'number-valued overflow amount must fail loudly before persistence'
);

assert.throws(
  () => db.prepare(`
    INSERT INTO sbc_prize_reserve_issuance_credits
      (issuance_id, broker_subunits, overflow_subunits, reason)
    VALUES ('sql-real-rejected', 1.5, 0, 'direct_sql_float_probe')
  `).run(),
  /CHECK constraint failed/,
  'SQLite schema must reject REAL values in integer reserve columns'
);

const accountRows = db.prepare(`
  SELECT bucket, typeof(balance_subunits) AS balance_type,
         typeof(credited_lifetime_subunits) AS lifetime_type
  FROM sbc_prize_reserve_accounts ORDER BY bucket
`).all();
assert.deepStrictEqual(
  accountRows.map(r => [r.bucket, r.balance_type, r.lifetime_type]),
  [
    ['broker_reserve', 'integer', 'integer'],
    ['overflow_reserve', 'integer', 'integer'],
  ],
  'reserve storage types must remain SQLite INTEGER'
);

const issuanceRows = db.prepare(`
  SELECT issuance_id, typeof(broker_subunits) AS broker_type,
         typeof(overflow_subunits) AS overflow_type
  FROM sbc_prize_reserve_issuance_credits ORDER BY issuance_id
`).all();
assert.strictEqual(issuanceRows.length, 20);
assert.ok(issuanceRows.every(r => r.broker_type === 'integer' && r.overflow_type === 'integer'));

console.log('Stage 1 prize reserve ledger: PASS');
console.log('Broker Reserve:', balances[BROKER_RESERVE_BUCKET].balanceSubunits.toString(), 'subunits = 733,332 STONK');
console.log('Overflow Reserve:', balances[OVERFLOW_RESERVE_BUCKET].balanceSubunits.toString(), 'subunits = 66,668 STONK');
console.log('Duplicate issuance: rejected with DUPLICATE_ISSUANCE');
console.log('Floating-point paths: rejected by API and SQLite CHECK constraints');

db.close();
