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
} = require('./juniorBrokerStage2');

function makeDb() {
  const db = new DatabaseSync(':memory:', { readBigInts: true });
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE accounts (id INTEGER PRIMARY KEY);
    INSERT INTO accounts(id) VALUES (1),(2),(3),(4);
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY,
      account_id INTEGER,
      ticket_type TEXT NOT NULL
    );
    INSERT INTO tickets(id, account_id, ticket_type) VALUES (1, 1, 'junior');
  `);
  ensureSchema(db);
  return db;
}

assert.strictEqual(ASSET_TYPE, 'junior_broker_share');
assert.notStrictEqual(ASSET_TYPE, 'junior');
assert.strictEqual(REDEEM_COUNT, 20n);
assert.strictEqual(BROKER_SHARE, 36666600000n);
assert.strictEqual(ACTIVATED_BROKER_COST, 733332000000n);
assert.strictEqual(BROKER_SHARE * REDEEM_COUNT, ACTIVATED_BROKER_COST);

const won = splitForSource(SOURCE_WON);
assert.deepStrictEqual(won, {
  grossSubunits: 40000000000n,
  brokerSubunits: 36666600000n,
  overflowSubunits: 3333400000n,
});
assert.strictEqual(won.grossSubunits, WON_TOTAL);
assert.strictEqual(won.brokerSubunits + won.overflowSubunits, won.grossSubunits);

const minted = splitForSource(SOURCE_MINTED);
assert.deepStrictEqual(minted, {
  grossSubunits: 48000000000n,
  brokerSubunits: 36666600000n,
  overflowSubunits: 11333400000n,
});
assert.strictEqual(minted.grossSubunits, MINTED_TOTAL);
assert.strictEqual(minted.brokerSubunits + minted.overflowSubunits, minted.grossSubunits);
assert.strictEqual(minted.brokerSubunits, won.brokerSubunits, 'Broker Reserve share must be identical for won and minted paths');
assert.strictEqual(minted.overflowSubunits - won.overflowSubunits, 8000000000n, 'entire 8,000 STONK mint premium must flow to Overflow');
assert.strictEqual(WON_OVERFLOW, 3333400000n);
assert.strictEqual(MINTED_OVERFLOW, 11333400000n);

// Won and minted issuance both execute the real Stage 1 reserve ledger and update holdings.
{
  const db = makeDb();
  const wonIssue = issueFundedJuniorBrokerShare(db, { issuanceId: 'won-1', accountId: 1, source: SOURCE_WON });
  assert.strictEqual(wonIssue.count, 1n);
  let balances = getBalances(db);
  assert.strictEqual(balances[BROKER_RESERVE_BUCKET].balanceSubunits, BROKER_SHARE);
  assert.strictEqual(balances[OVERFLOW_RESERVE_BUCKET].balanceSubunits, WON_OVERFLOW);

  const mintIssue = issueFundedJuniorBrokerShare(db, { issuanceId: 'mint-1', accountId: 1, source: SOURCE_MINTED });
  assert.strictEqual(mintIssue.count, 2n);
  balances = getBalances(db);
  assert.strictEqual(balances[BROKER_RESERVE_BUCKET].balanceSubunits, BROKER_SHARE * 2n);
  assert.strictEqual(balances[OVERFLOW_RESERVE_BUCKET].balanceSubunits, WON_OVERFLOW + MINTED_OVERFLOW);

  const issuanceRows = db.prepare(`
    SELECT issuance_id, asset_type, source,
           typeof(gross_subunits) AS gross_type,
           typeof(broker_subunits) AS broker_type,
           typeof(overflow_subunits) AS overflow_type
    FROM sbc_junior_broker_issuances ORDER BY issuance_id
  `).all();
  assert.strictEqual(issuanceRows.length, 2);
  assert.ok(issuanceRows.every(r => r.asset_type === ASSET_TYPE));
  assert.ok(issuanceRows.every(r => r.gross_type === 'integer' && r.broker_type === 'integer' && r.overflow_type === 'integer'));
  assert.strictEqual(db.prepare(`SELECT ticket_type FROM tickets WHERE id = 1`).get().ticket_type, 'junior', 'existing junior ticket identifier must remain untouched');

  const beforeDuplicate = getBalances(db);
  assert.throws(
    () => issueFundedJuniorBrokerShare(db, { issuanceId: 'won-1', accountId: 1, source: SOURCE_WON }),
    err => err && err.code === 'DUPLICATE_ISSUANCE'
  );
  const afterDuplicate = getBalances(db);
  assert.deepStrictEqual(afterDuplicate, beforeDuplicate);
  assert.strictEqual(getJuniorCount(db, 1), 2n, 'duplicate issuance must not increment holdings');
  db.close();
}

// 19 cannot redeem; 20 can; >20 preserves remainder.
{
  const db = makeDb();
  for (let i = 1; i <= 19; i += 1) {
    issueFundedJuniorBrokerShare(db, { issuanceId: `acct2-${i}`, accountId: 2, source: SOURCE_WON });
  }
  assert.strictEqual(getJuniorCount(db, 2), 19n);
  const beforeRejected = getBalances(db);
  assert.throws(
    () => redeemJuniorsForActivatedBroker(db, { redemptionId: 'acct2-too-early', accountId: 2 }),
    err => err && err.code === 'INSUFFICIENT_JUNIORS'
  );
  assert.strictEqual(getJuniorCount(db, 2), 19n);
  assert.deepStrictEqual(getBalances(db), beforeRejected);

  issueFundedJuniorBrokerShare(db, { issuanceId: 'acct2-20', accountId: 2, source: SOURCE_WON });
  const beforeRedeem = getBalances(db);
  assert.strictEqual(beforeRedeem[BROKER_RESERVE_BUCKET].balanceSubunits, ACTIVATED_BROKER_COST);
  const redeemed = redeemJuniorsForActivatedBroker(db, { redemptionId: 'acct2-broker-1', accountId: 2 });
  assert.strictEqual(redeemed.remainingJuniors, 0n);
  assert.strictEqual(redeemed.status, 'funded_pending_delivery');
  assert.strictEqual(redeemed.brokerReserveDebitSubunits, ACTIVATED_BROKER_COST);
  assert.strictEqual(redeemed.balances[BROKER_RESERVE_BUCKET].balanceSubunits, 0n);
  assert.strictEqual(redeemed.balances[BROKER_RESERVE_BUCKET].debitedLifetimeSubunits, ACTIVATED_BROKER_COST);
  assert.strictEqual(redeemed.balances[OVERFLOW_RESERVE_BUCKET].balanceSubunits, WON_OVERFLOW * 20n, 'Overflow is not consumed by Broker redemption');

  for (let i = 1; i <= 23; i += 1) {
    issueFundedJuniorBrokerShare(db, { issuanceId: `acct3-${i}`, accountId: 3, source: SOURCE_WON });
  }
  const remainderRedeem = redeemJuniorsForActivatedBroker(db, { redemptionId: 'acct3-broker-1', accountId: 3 });
  assert.strictEqual(remainderRedeem.remainingJuniors, 3n, 'redemption must preserve holdings above 20');
  db.close();
}

// Defensive solvency: even a holder with 20 cannot redeem against a short Broker Reserve.
{
  const db = makeDb();
  for (let i = 1; i <= 20; i += 1) {
    issueFundedJuniorBrokerShare(db, { issuanceId: `acct4-${i}`, accountId: 4, source: SOURCE_WON });
  }
  db.prepare(`UPDATE sbc_prize_reserve_accounts SET balance_subunits = ? WHERE bucket = ?`)
    .run(ACTIVATED_BROKER_COST - 1n, BROKER_RESERVE_BUCKET);
  const before = getBalances(db);
  assert.throws(
    () => redeemJuniorsForActivatedBroker(db, { redemptionId: 'acct4-short-reserve', accountId: 4 }),
    err => err && err.code === 'INSUFFICIENT_RESERVE'
  );
  assert.strictEqual(getJuniorCount(db, 4), 20n, 'failed redemption must not burn Juniors');
  assert.deepStrictEqual(getBalances(db), before, 'failed solvency check must roll back reserve mutations');
  assert.strictEqual(db.prepare(`SELECT COUNT(*) AS n FROM sbc_activated_broker_redemptions`).get().n, 0n);
  db.close();
}

console.log('Stage 2 Junior Broker share: PASS');
console.log('Won split:', `${WON_TOTAL / SUBUNITS_PER_STONK} total -> ${BROKER_SHARE / SUBUNITS_PER_STONK} Broker + ${WON_OVERFLOW / SUBUNITS_PER_STONK} Overflow STONK`);
console.log('Minted split:', `${MINTED_TOTAL / SUBUNITS_PER_STONK} total -> ${BROKER_SHARE / SUBUNITS_PER_STONK} Broker + ${MINTED_OVERFLOW / SUBUNITS_PER_STONK} Overflow STONK`);
console.log('Redemption:', '19 rejected; 20 burns exactly 20; 23 leaves 3');
console.log('Solvency:', 'short Broker Reserve rejects redemption and rolls back holdings');
console.log('Identifier:', "junior_broker_share is isolated from existing ticket_type='junior'");
