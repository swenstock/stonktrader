'use strict';

const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const {
  SUBUNITS_PER_STONK,
  BROKER_RESERVE_BUCKET,
  OVERFLOW_RESERVE_BUCKET,
  getBalances,
} = require('./prizeReserveLedger');
const {
  BROKER_SHARE,
  WON_TOTAL,
  WON_OVERFLOW,
  getJuniorCount,
  redeemJuniorsForActivatedBroker,
} = require('./juniorBrokerStage2');
const {
  parseStonkDecimalToSubunits,
  computePostRakeNetSubunits,
  ensureSchema,
  getContestFundingPoolStatus,
  recordPostRakeContestFunding,
  issueWonJuniorFromContestPool,
} = require('./contestJuniorFundingPool');

function makeDb() {
  const db = new DatabaseSync(':memory:', { readBigInts: true });
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE accounts (id INTEGER PRIMARY KEY);
    INSERT INTO accounts(id) VALUES (1),(2);
  `);
  ensureSchema(db);
  return db;
}

assert.strictEqual(parseStonkDecimalToSubunits('24000'), 24000000000n);
assert.strictEqual(parseStonkDecimalToSubunits('36666.6'), 36666600000n);
assert.strictEqual(parseStonkDecimalToSubunits('3333.4'), 3333400000n);
assert.throws(() => parseStonkDecimalToSubunits(24000), /must be a string/);
assert.throws(() => parseStonkDecimalToSubunits('1.0000001'), /at most 6 fractional digits/);
assert.strictEqual(computePostRakeNetSubunits(24000000000n), 20400000000n);
assert.strictEqual(computePostRakeNetSubunits(960000000000n), 816000000000n);
assert.throws(
  () => computePostRakeNetSubunits(1n),
  err => err && err.code === 'RAKE_SUBUNIT_REMAINDER',
  'unrepresentable sub-unit rake fractions must reject instead of round'
);

// Cross-contest accumulation: neither contest alone funds a Junior, together they do.
{
  const db = makeDb();
  assert.strictEqual(db.prepare(`SELECT COUNT(*) AS n FROM sbc_prize_reserve_accounts`).get().n, 2n, 'there must still be exactly two reserve accounts');

  let status = recordPostRakeContestFunding(db, {
    fundingId: 'contest:A',
    sourceType: 'main_event',
    sourceId: 'A',
    netPrizeSubunits: 20400000000n,
  });
  assert.strictEqual(status.unallocatedSubunits, 20400000000n);
  assert.strictEqual(status.fundableWonJuniors, 0n);

  const beforeDuplicate = getBalances(db);
  assert.throws(
    () => recordPostRakeContestFunding(db, {
      fundingId: 'contest:A',
      sourceType: 'main_event',
      sourceId: 'A',
      netPrizeSubunits: 20400000000n,
    }),
    err => err && err.code === 'DUPLICATE_FUNDING'
  );
  assert.deepStrictEqual(getBalances(db), beforeDuplicate, 'duplicate contest funding must not move reserve balances');

  status = recordPostRakeContestFunding(db, {
    fundingId: 'contest:B',
    sourceType: 'main_event',
    sourceId: 'B',
    netPrizeSubunits: 20400000000n,
  });
  assert.strictEqual(status.brokerBalanceSubunits, 40800000000n);
  assert.strictEqual(status.backingLiabilitySubunits, 0n);
  assert.strictEqual(status.unallocatedSubunits, 40800000000n);
  assert.strictEqual(status.fundableWonJuniors, 1n);

  const issued = issueWonJuniorFromContestPool(db, { issuanceId: 'pool-junior-1', accountId: 1 });
  assert.strictEqual(issued.count, 1n);
  assert.strictEqual(getJuniorCount(db, 1), 1n);
  assert.strictEqual(issued.pool.backingLiabilitySubunits, BROKER_SHARE);
  assert.strictEqual(issued.pool.unallocatedSubunits, 800000000n, '800 STONK must carry forward, not be paid out or rounded away');
  assert.strictEqual(issued.balances[BROKER_RESERVE_BUCKET].balanceSubunits, 37466600000n);
  assert.strictEqual(issued.balances[OVERFLOW_RESERVE_BUCKET].balanceSubunits, WON_OVERFLOW);

  const allocation = db.prepare(`
    SELECT funding_unit_subunits, broker_backing_subunits, overflow_subunits,
           typeof(funding_unit_subunits) AS funding_type,
           typeof(broker_backing_subunits) AS broker_type,
           typeof(overflow_subunits) AS overflow_type
    FROM sbc_prize_pool_allocations WHERE issuance_id = ?
  `).get('pool-junior-1');
  assert.strictEqual(allocation.funding_unit_subunits, WON_TOTAL);
  assert.strictEqual(allocation.broker_backing_subunits, BROKER_SHARE);
  assert.strictEqual(allocation.overflow_subunits, WON_OVERFLOW);
  assert.deepStrictEqual([allocation.funding_type, allocation.broker_type, allocation.overflow_type], ['integer','integer','integer']);

  assert.strictEqual(
    db.prepare(`SELECT COUNT(*) AS n FROM sbc_prize_reserve_issuance_credits WHERE issuance_id = ?`).get('pool-junior-1').n,
    0n,
    'pooled issuance must not double-credit reserve cash through the external issuance-credit path'
  );
  assert.strictEqual(
    db.prepare(`SELECT COUNT(*) AS n FROM sbc_prize_reserve_transfers WHERE transfer_id = ?`).get('won-junior-overflow:pool-junior-1').n,
    1n,
    'won Junior must move exactly one Overflow allocation internally'
  );

  const beforeShort = getBalances(db);
  assert.throws(
    () => issueWonJuniorFromContestPool(db, { issuanceId: 'pool-junior-too-soon', accountId: 2 }),
    err => err && err.code === 'INSUFFICIENT_CONTEST_FUNDING'
  );
  assert.deepStrictEqual(getBalances(db), beforeShort);
  assert.strictEqual(getJuniorCount(db, 2), 0n);

  recordPostRakeContestFunding(db, {
    fundingId: 'contest:C',
    sourceType: 'main_event',
    sourceId: 'C',
    netPrizeSubunits: 39525000000n,
  });
  const issued2 = issueWonJuniorFromContestPool(db, { issuanceId: 'pool-junior-2', accountId: 2 });
  assert.strictEqual(issued2.pool.unallocatedSubunits, 325000000n, 'cross-contest carry must remain after the second funded Junior');

  assert.throws(
    () => recordPostRakeContestFunding(db, {
      fundingId: 'float-not-allowed',
      sourceType: 'main_event',
      sourceId: 'D',
      netPrizeSubunits: 20400000000,
    }),
    /must be a bigint sub-unit amount/
  );
  db.close();
}

// Full-cycle proof using current 3,000-STONK Main Event economics:
// 320 entries = 960,000 gross; after 15% rake = 816,000 exact pooled STONK.
// Twenty won Juniors consume 800,000, leaving 16,000 carry. Redemption then
// removes exactly 733,332 of Broker backing while Overflow remains untouched.
{
  const db = makeDb();
  const gross = parseStonkDecimalToSubunits('960000');
  const net = computePostRakeNetSubunits(gross);
  assert.strictEqual(net, 816000000000n);
  recordPostRakeContestFunding(db, {
    fundingId: 'main-event:320-entry-example',
    sourceType: 'main_event',
    sourceId: '320-entry-example',
    netPrizeSubunits: net,
  });

  for (let i = 1; i <= 20; i += 1) {
    issueWonJuniorFromContestPool(db, { issuanceId: `full-cycle-junior-${i}`, accountId: 1 });
  }

  let status = getContestFundingPoolStatus(db);
  let balances = getBalances(db);
  assert.strictEqual(getJuniorCount(db, 1), 20n);
  assert.strictEqual(status.backingLiabilitySubunits, 733332000000n);
  assert.strictEqual(status.unallocatedSubunits, 16000000000n);
  assert.strictEqual(balances[BROKER_RESERVE_BUCKET].balanceSubunits, 749332000000n);
  assert.strictEqual(balances[OVERFLOW_RESERVE_BUCKET].balanceSubunits, 66668000000n);

  const redeemed = redeemJuniorsForActivatedBroker(db, { redemptionId: 'full-cycle-broker-1', accountId: 1 });
  assert.strictEqual(redeemed.remainingJuniors, 0n);
  status = getContestFundingPoolStatus(db);
  balances = getBalances(db);
  assert.strictEqual(status.backingLiabilitySubunits, 0n);
  assert.strictEqual(status.unallocatedSubunits, 16000000000n, '16,000 STONK carry survives Broker redemption');
  assert.strictEqual(balances[BROKER_RESERVE_BUCKET].balanceSubunits, 16000000000n);
  assert.strictEqual(balances[OVERFLOW_RESERVE_BUCKET].balanceSubunits, 66668000000n, 'Overflow is not consumed by Broker redemption');
  db.close();
}

console.log('Prize Integration A pooled Junior funding: PASS');
console.log('Cross-contest pool:', '20,400 + 20,400 STONK -> 1 funded Junior + 800 STONK carry');
console.log('Won allocation:', '40,000 -> 36,666.6 Broker backing + 3,333.4 Overflow, no reserve double-credit');
console.log('Full cycle:', '960,000 gross -> 816,000 post-rake -> 20 Juniors -> Broker redemption + 16,000 carry');
console.log('Reserve count:', 'exactly two reserve accounts; no third Junior reserve introduced');
console.log('Precision:', 'BigInt sub-units only; unrepresentable rake fractions reject instead of rounding');
