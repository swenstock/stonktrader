'use strict';

const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const { queryHistory } = require('./exchangeHistoryV1');

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE users(id INTEGER PRIMARY KEY, display_name TEXT NOT NULL);
  CREATE TABLE accounts(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL);
  CREATE TABLE tickets(id INTEGER PRIMARY KEY, ticket_type TEXT NOT NULL);
  CREATE TABLE ticket_listings(
    id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL, seller_account_id INTEGER NOT NULL,
    buyer_account_id INTEGER, ask_price INTEGER NOT NULL, status TEXT NOT NULL, sold_at TEXT
  );
  CREATE TABLE ticket_bids(
    id INTEGER PRIMARY KEY, filled_ticket_id INTEGER, ticket_type TEXT NOT NULL,
    buyer_account_id INTEGER NOT NULL, seller_account_id INTEGER,
    bid_price INTEGER NOT NULL, status TEXT NOT NULL, filled_at TEXT
  );
  CREATE TABLE badge_trades(
    id INTEGER PRIMARY KEY, buyer_account_id INTEGER NOT NULL, seller_account_id INTEGER NOT NULL,
    price_stonk INTEGER NOT NULL, created_at TEXT NOT NULL
  );
`);

const addUser=db.prepare('INSERT INTO users(id,display_name) VALUES (?,?)');
const addAccount=db.prepare('INSERT INTO accounts(id,user_id) VALUES (?,?)');
[['Alice Alpha',1],['Bob Beta',2],['Carol Gamma',3],['Delta Desk',4]].forEach(([name,id])=>{addUser.run(id,name);addAccount.run(id,id)});
const addTicket=db.prepare('INSERT INTO tickets(id,ticket_type) VALUES (?,?)');
const addListing=db.prepare(`INSERT INTO ticket_listings(id,ticket_id,seller_account_id,buyer_account_id,ask_price,status,sold_at)
  VALUES (?,?,?,?,?,'sold',?)`);
for(let i=1;i<=30;i++){
  const type=['runner','clerk','trader','junior'][i%4];
  addTicket.run(i,type);
  addListing.run(i,i,(i%3)+2,1,100+i,`2026-08-31T10:${String(i).padStart(2,'0')}:00.000Z`);
}
const addBid=db.prepare(`INSERT INTO ticket_bids(id,filled_ticket_id,ticket_type,buyer_account_id,seller_account_id,bid_price,status,filled_at)
  VALUES (?,?,?,?,?,?,'filled',?)`);
addTicket.run(101,'runner');addBid.run(101,101,'runner',2,3,225,'2026-08-31T11:01:00.000Z');
addTicket.run(102,'clerk');addBid.run(102,102,'clerk',3,4,325,'2026-08-31T11:02:00.000Z');
const addBadge=db.prepare('INSERT INTO badge_trades(id,buyer_account_id,seller_account_id,price_stonk,created_at) VALUES (?,?,?,?,?)');
addBadge.run(1,4,2,48000,'2026-08-31T11:03:00.000Z');
addBadge.run(2,3,1,47750,'2026-08-31T11:04:00.000Z');

const first=queryHistory(db,{limit:10,offset:0});
const second=queryHistory(db,{limit:10,offset:first.nextOffset});
assert.strictEqual(first.rows.length,10,'first page must be limited to 10 rows');
assert.strictEqual(first.hasMore,true,'first page should advertise more rows');
assert.strictEqual(first.nextOffset,10,'next offset must advance by actual page size');
assert.strictEqual(second.rows.length,10,'second page must also be limited');
assert.notDeepStrictEqual(second.rows,first.rows,'pagination must return a different page');
assert.strictEqual(first.rows[0].market,'badge','global newest row should be newest Badge trade');
assert.strictEqual(first.rows[0].price,47750);
assert.strictEqual(Object.keys(first.rows[0]).sort().join(','),'buyer,item,market,price,seller,time','row shape must be normalized');

const filtered=queryHistory(db,{limit:100,offset:0,search:'aLi'});
assert(filtered.rows.length>0,'partial account search should return matches');
assert(filtered.rows.length<34,'server-side search must narrow the unfiltered history set');
assert(filtered.rows.every(r=>/ali/i.test(r.buyer)||/ali/i.test(r.seller)),'every filtered row must match buyer or seller display name');

const runner=queryHistory(db,{limit:100,offset:0,market:'RUNNER'});
assert(runner.rows.length>0,'market filter should return Runner rows');
assert(runner.rows.every(r=>r.market==='runner'),'market filter must be applied server-side');

assert.throws(()=>queryHistory(db,{limit:0}),/limit must be an integer/);
assert.throws(()=>queryHistory(db,{limit:101}),/limit must be an integer/);
assert.throws(()=>queryHistory(db,{market:'not-a-market'}),/Unknown Exchange market/);

console.log('Exchange History V1: PASS');
console.log(`UNFILTERED_PAGE=${first.rows.length} HAS_MORE=${first.hasMore} NEXT_OFFSET=${first.nextOffset}`);
console.log(`SECOND_PAGE=${second.rows.length}`);
console.log(`SEARCH_aLi_MATCHES=${filtered.rows.length} OF_TOTAL=34`);
console.log(`RUNNER_MARKET_MATCHES=${runner.rows.length}`);
console.log('SEARCH_MODE=case-insensitive partial display-name match, executed in SQL');
