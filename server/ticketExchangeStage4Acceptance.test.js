'use strict';

process.env.TICKET_MARKET_FEE_PCT = '0.05';
process.env.BADGE_MARKET_WARNING_THRESHOLD = '0.25';

const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const {
  BROKER_RESERVE_BUCKET,
  OVERFLOW_RESERVE_BUCKET,
  getBalances,
  ensureSchema: ensurePrizeReserveSchema,
} = require('./prizeReserveLedger');
const {
  BADGE_ASSET_TYPE,
  MINT_PRICE_STONK,
  BADGE_FLOOR_STONK,
  ensureSchema,
  getHolding,
  createListing,
  cancelListing,
  createBid,
  sellToBid,
  mispricingWarning,
  mintBadge,
} = require('./badgeMarketV45');
const { ensureSchema: ensureJuniorBrokerSchema } = require('./juniorBrokerStage2');

function makeDb() {
  const db = new DatabaseSync(':memory:', { readBigInts: true });
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      referral_code TEXT UNIQUE NOT NULL
    );
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      stonk_balance REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      balance_after REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY,
      account_id INTEGER,
      ticket_type TEXT NOT NULL
    );
    INSERT INTO users VALUES
      (1,'a@test','x','Account A','A'),
      (2,'b@test','x','Account B','B'),
      (3,'c@test','x','Account C','C'),
      (4,'d@test','x','Account D','D');
    INSERT INTO accounts VALUES
      (1,1,100000),(2,2,100000),(3,3,100000),(4,4,100000);
  `);
  ensurePrizeReserveSchema(db);
  ensureJuniorBrokerSchema(db);
  ensureSchema(db);
  return db;
}
function custodianFor(db) {
  return {
    getBalance(id) { return Number(db.prepare('SELECT stonk_balance FROM accounts WHERE id=?').get(id).stonk_balance); },
    debit(id, amount, reason, { referenceType=null, referenceId=null }={}) {
      const bal=this.getBalance(id); if (bal < amount) throw new Error('Insufficient balance');
      db.prepare('UPDATE accounts SET stonk_balance=stonk_balance-? WHERE id=?').run(amount,id);
      const next=this.getBalance(id);
      db.prepare('INSERT INTO ledger_entries(account_id,amount,reason,reference_type,reference_id,balance_after) VALUES (?,?,?,?,?,?)')
        .run(id,-amount,reason,referenceType,referenceId,next);
      return next;
    },
    credit(id, amount, reason, { referenceType=null, referenceId=null }={}) {
      db.prepare('UPDATE accounts SET stonk_balance=stonk_balance+? WHERE id=?').run(amount,id);
      const next=this.getBalance(id);
      db.prepare('INSERT INTO ledger_entries(account_id,amount,reason,reference_type,reference_id,balance_after) VALUES (?,?,?,?,?,?)')
        .run(id,amount,reason,referenceType,referenceId,next);
      return next;
    },
  };
}
function seedHolding(db, accountId, quantity) {
  db.prepare(`INSERT INTO sbc_prize_holdings(account_id,asset_type,quantity,quantity_listed)
    VALUES (?,?,?,0)
    ON CONFLICT(account_id,asset_type) DO UPDATE SET quantity=excluded.quantity,quantity_listed=0`)
    .run(accountId, BADGE_ASSET_TYPE, BigInt(quantity));
}
function reserveSnapshot(db) {
  const b=getBalances(db);
  return {
    broker:b[BROKER_RESERVE_BUCKET].balanceSubunits,
    overflow:b[OVERFLOW_RESERVE_BUCKET].balanceSubunits,
  };
}

// 1 + 2: genuine two-account trade and direct Stage 3 quantity_listed integration.
{
  const db=makeDb(), custodian=custodianFor(db);
  seedHolding(db,1,1);
  db.prepare(`UPDATE sbc_prize_reserve_accounts SET balance_subunits=? WHERE bucket=?`).run(36666600000n,BROKER_RESERVE_BUCKET);
  db.prepare(`UPDATE sbc_prize_reserve_accounts SET balance_subunits=? WHERE bucket=?`).run(3333400000n,OVERFLOW_RESERVE_BUCKET);
  const beforeReserve=reserveSnapshot(db);
  assert.deepStrictEqual(getHolding(db,1),{quantity:1n,quantity_listed:0n});
  const listing=createListing(db,{accountId:1,askPrice:42000});
  assert.strictEqual(listing.reservation.quantity_listed,1n,'real listing must reserve via Stage 3 quantity_listed');
  const bid=createBid(db,custodian,{accountId:2,bidPrice:40000});
  assert.strictEqual(custodian.getBalance(2),60000,'bid must hold buyer STONK');
  const fill=sellToBid(db,custodian,{accountId:1,bidId:bid.id});
  assert.strictEqual(fill.soldFor,40000);
  assert.strictEqual(fill.platformFee,2000);
  assert.strictEqual(fill.sellerReceived,38000);
  assert.deepStrictEqual(getHolding(db,1),{quantity:0n,quantity_listed:0n});
  assert.deepStrictEqual(getHolding(db,2),{quantity:1n,quantity_listed:0n});
  assert.strictEqual(custodian.getBalance(1),138000);
  assert.strictEqual(custodian.getBalance(2),60000);
  const cancelledListing=db.prepare('SELECT status FROM badge_listings WHERE id=?').get(listing.id);
  assert.strictEqual(cancelledListing.status,'cancelled','selling listed unit into bid must retire colliding listing');
  const afterReserve=reserveSnapshot(db);
  assert.deepStrictEqual(afterReserve,beforeReserve,'P2P trade must not move Broker/Overflow backing');
  const feeRow=db.prepare("SELECT amount FROM sbc_reserve_ledger WHERE bucket='platform_revenue' AND reason='badge_market_fee'").get();
  assert.strictEqual(Number(feeRow.amount),2000);
  db.close();
}

// 3: 14 holdings -> exactly 14 simultaneous listings; 15th rejected unchanged.
{
  const db=makeDb();
  seedHolding(db,3,14);
  for(let i=0;i<14;i++) createListing(db,{accountId:3,askPrice:40000+i});
  assert.deepStrictEqual(getHolding(db,3),{quantity:14n,quantity_listed:14n});
  assert.throws(()=>createListing(db,{accountId:3,askPrice:41000}),err=>err?.code==='INSUFFICIENT_UNLISTED_QUANTITY');
  assert.deepStrictEqual(getHolding(db,3),{quantity:14n,quantity_listed:14n});
  db.close();
}

// 4: cancellation releases reservation directly.
{
  const db=makeDb();
  seedHolding(db,1,2);
  const listing=createListing(db,{accountId:1,askPrice:41000});
  assert.strictEqual(getHolding(db,1).quantity_listed,1n);
  cancelListing(db,{accountId:1,listingId:listing.id});
  assert.deepStrictEqual(getHolding(db,1),{quantity:2n,quantity_listed:0n});
  db.close();
}

// 5: mint regression — 48,000 debit and exact existing split.
{
  const db=makeDb(), custodian=custodianFor(db);
  const before=reserveSnapshot(db);
  const minted=mintBadge(db,custodian,{accountId:4,issuanceId:'stage4-mint-regression'});
  const after=reserveSnapshot(db);
  assert.strictEqual(minted.paid,48000);
  assert.strictEqual(custodian.getBalance(4),52000);
  assert.strictEqual(after.broker-before.broker,36666600000n);
  assert.strictEqual(after.overflow-before.overflow,11333400000n);
  assert.deepStrictEqual(getHolding(db,4),{quantity:1n,quantity_listed:0n});
  db.close();
}

// 6: two-condition symmetric warning and edge cases.
{
  assert.strictEqual(MINT_PRICE_STONK,48000);
  assert.strictEqual(BADGE_FLOOR_STONK,36666.6);
  const low=mispricingWarning(10000,{price:40000});
  assert.strictEqual(low.warn,true); assert.strictEqual(low.reason,'well_below_market'); assert.strictEqual(low.referencePrice,40000);
  const high=mispricingWarning(100000,{price:40000});
  assert.strictEqual(high.warn,true); assert.strictEqual(high.reason,'well_above_market');
  const thinButSensible=mispricingWarning(48000,{price:36667});
  assert.strictEqual(thinButSensible.gapPct>0.25,true); assert.strictEqual(thinButSensible.warn,false,'inside floor-to-mint band must not warn');
  const justInside=mispricingWarning(30001,{price:40000});
  assert.strictEqual(justInside.gapPct<0.25,true); assert.strictEqual(justInside.warn,false);
  const firstEver=mispricingWarning(10000,null);
  assert.strictEqual(firstEver.warn,false); assert.strictEqual(firstEver.reason,'no_reference');
}

console.log('Ticket Exchange Stage 4 Badge Trading: PASS');
console.log('P2P: A listed 1 Badge, B bid 40,000; A received 38,000, 2,000 fee; B owns Badge; Broker/Overflow unchanged');
console.log('Stage 3 integration: quantity_listed 0 -> 1 on listing; collision sale -> 0; cancel releases directly');
console.log('Capacity: 14/14 listings succeed; 15th rejected unchanged');
console.log('Mint: 48,000 -> 36,666.6 Broker + 11,333.4 Overflow; buyer balance debited exactly 48,000');
console.log('Warning: symmetric >25% + outside band only; in-band thin-market, just-inside threshold, and first-ever listing do not warn');
