'use strict';
process.env.TICKET_MARKET_FEE_PCT='0.05';
process.env.BADGE_MARKET_WARNING_THRESHOLD='0.25';
const assert=require('assert');
const {DatabaseSync}=require('node:sqlite');
const reserve=require('./prizeReserveLedger');
const junior=require('./juniorBrokerStage2');
const market=require('./badgeMarketV45');

function makeDb(){
  const db=new DatabaseSync(':memory:',{readBigInts:true});
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,display_name TEXT NOT NULL,referral_code TEXT UNIQUE NOT NULL);
    CREATE TABLE accounts(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),stonk_balance REAL NOT NULL DEFAULT 0);
    CREATE TABLE ledger_entries(id INTEGER PRIMARY KEY AUTOINCREMENT,account_id INTEGER NOT NULL,amount REAL NOT NULL,reason TEXT NOT NULL,reference_type TEXT,reference_id INTEGER,balance_after REAL NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE tickets(id INTEGER PRIMARY KEY,account_id INTEGER,ticket_type TEXT NOT NULL);
    CREATE TABLE sbc_reserve_ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,bucket TEXT NOT NULL,amount REAL NOT NULL,reason TEXT NOT NULL,reference_type TEXT,reference_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX idx_sbc_reserve_bucket ON sbc_reserve_ledger(bucket,id);
    INSERT INTO users VALUES(1,'a@test','x','Account A','A'),(2,'b@test','x','Account B','B'),(3,'c@test','x','Account C','C'),(4,'d@test','x','Account D','D');
    INSERT INTO accounts VALUES(1,1,100000),(2,2,100000),(3,3,100000),(4,4,100000);`);
  reserve.ensureSchema(db); junior.ensureSchema(db); market.ensureSchema(db); return db;
}
function custodian(db){return{
  getBalance(id){return Number(db.prepare('SELECT stonk_balance FROM accounts WHERE id=?').get(id).stonk_balance)},
  debit(id,n,reason,{referenceType=null,referenceId=null}={}){const b=this.getBalance(id);if(b<n)throw new Error('Insufficient balance');db.prepare('UPDATE accounts SET stonk_balance=stonk_balance-? WHERE id=?').run(n,id);const x=this.getBalance(id);db.prepare('INSERT INTO ledger_entries(account_id,amount,reason,reference_type,reference_id,balance_after) VALUES(?,?,?,?,?,?)').run(id,-n,reason,referenceType,referenceId,x);return x},
  credit(id,n,reason,{referenceType=null,referenceId=null}={}){db.prepare('UPDATE accounts SET stonk_balance=stonk_balance+? WHERE id=?').run(n,id);const x=this.getBalance(id);db.prepare('INSERT INTO ledger_entries(account_id,amount,reason,reference_type,reference_id,balance_after) VALUES(?,?,?,?,?,?)').run(id,n,reason,referenceType,referenceId,x);return x}
}}
function seed(db,id,q){db.prepare(`INSERT INTO sbc_prize_holdings(account_id,asset_type,quantity,quantity_listed) VALUES(?,?,?,0) ON CONFLICT(account_id,asset_type) DO UPDATE SET quantity=excluded.quantity,quantity_listed=0`).run(id,market.BADGE_ASSET_TYPE,BigInt(q))}
function holding(db,id,q,l){const h=market.getHolding(db,id);assert.strictEqual(h.quantity,BigInt(q));assert.strictEqual(h.quantity_listed,BigInt(l))}
function reserves(db){const b=reserve.getBalances(db);return [b[reserve.BROKER_RESERVE_BUCKET].balanceSubunits,b[reserve.OVERFLOW_RESERVE_BUCKET].balanceSubunits]}

// 1 + 2: two-account P2P trade + direct Stage 3 quantity lock state.
{
 const db=makeDb(),c=custodian(db);seed(db,1,1);
 db.prepare('UPDATE sbc_prize_reserve_accounts SET balance_subunits=? WHERE bucket=?').run(36666600000n,reserve.BROKER_RESERVE_BUCKET);
 db.prepare('UPDATE sbc_prize_reserve_accounts SET balance_subunits=? WHERE bucket=?').run(3333400000n,reserve.OVERFLOW_RESERVE_BUCKET);
 const before=reserves(db);holding(db,1,1,0);
 const listing=market.createListing(db,{accountId:1,askPrice:42000});holding(db,1,1,1);assert.strictEqual(listing.reservation.quantity_listed,1n);
 const bid=market.createBid(db,c,{accountId:2,bidPrice:40000});assert.strictEqual(c.getBalance(2),60000);
 const fill=market.sellToBid(db,c,{accountId:1,bidId:bid.id});
 assert.strictEqual(fill.soldFor,40000);assert.strictEqual(fill.platformFee,2000);assert.strictEqual(fill.sellerReceived,38000);
 holding(db,1,0,0);holding(db,2,1,0);assert.strictEqual(c.getBalance(1),138000);assert.strictEqual(c.getBalance(2),60000);
 assert.strictEqual(db.prepare('SELECT status FROM badge_listings WHERE id=?').get(listing.id).status,'cancelled');
 assert.strictEqual(reserves(db)[0],before[0]);assert.strictEqual(reserves(db)[1],before[1]);
 assert.strictEqual(Number(db.prepare("SELECT amount FROM sbc_reserve_ledger WHERE bucket='platform_revenue' AND reason='badge_market_fee'").get().amount),2000);db.close();
}
// 3: 14 allowed, 15th rejected unchanged.
{
 const db=makeDb();seed(db,3,14);for(let i=0;i<14;i++)market.createListing(db,{accountId:3,askPrice:40000+i});holding(db,3,14,14);
 assert.throws(()=>market.createListing(db,{accountId:3,askPrice:41000}),e=>e?.code==='INSUFFICIENT_UNLISTED_QUANTITY');holding(db,3,14,14);db.close();
}
// 4: cancellation releases actual reservation.
{
 const db=makeDb();seed(db,1,2);const l=market.createListing(db,{accountId:1,askPrice:41000});holding(db,1,2,1);market.cancelListing(db,{accountId:1,listingId:l.id});holding(db,1,2,0);db.close();
}
// 5: exact existing 48k mint split.
{
 const db=makeDb(),c=custodian(db),before=reserves(db);const m=market.mintBadge(db,c,{accountId:4,issuanceId:'stage4-mint-regression'}),after=reserves(db);
 assert.strictEqual(m.paid,48000);assert.strictEqual(c.getBalance(4),52000);assert.strictEqual(after[0]-before[0],36666600000n);assert.strictEqual(after[1]-before[1],11333400000n);holding(db,4,1,0);db.close();
}
// 6: symmetric, two-condition warning and edge cases.
{
 const low=market.mispricingWarning(10000,{price:40000}),high=market.mispricingWarning(100000,{price:40000});assert.strictEqual(low.warn,true);assert.strictEqual(low.reason,'well_below_market');assert.strictEqual(high.warn,true);assert.strictEqual(high.reason,'well_above_market');
 const inBand=market.mispricingWarning(48000,{price:36667});assert.strictEqual(inBand.gapPct>0.25,true);assert.strictEqual(inBand.warn,false);
 const inside=market.mispricingWarning(30001,{price:40000});assert.strictEqual(inside.gapPct<0.25,true);assert.strictEqual(inside.warn,false);
 const first=market.mispricingWarning(10000,null);assert.strictEqual(first.warn,false);assert.strictEqual(first.reason,'no_reference');
}
console.log('Ticket Exchange Stage 4 Badge Trading: PASS');
console.log('P2P: A listed 1 Badge, B bid 40,000; A received 38,000, 2,000 fee; B owns Badge; Broker/Overflow unchanged');
console.log('Stage 3 integration: quantity_listed 0 -> 1 on listing; collision sale -> 0; cancel releases directly');
console.log('Capacity: 14/14 listings succeed; 15th rejected unchanged');
console.log('Mint: 48,000 -> 36,666.6 Broker + 11,333.4 Overflow; buyer balance debited exactly 48,000');
console.log('Warning: symmetric >25% + outside band only; in-band thin-market, just-inside threshold, and first-ever listing do not warn');
