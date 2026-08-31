'use strict';

const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const market = require('./badgeMarketV45');

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, display_name TEXT);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id));
  `);
  market.ensureSchema(db);
  db.prepare("INSERT INTO users(display_name) VALUES ('badge-json-boundary')").run();
  const accountId = Number(db.prepare('INSERT INTO accounts(user_id) VALUES (1)').run().lastInsertRowid);
  db.prepare(`INSERT INTO sbc_prize_holdings(account_id,asset_type,quantity,quantity_listed) VALUES (?,?,1,0)`)
    .run(accountId, market.BADGE_ASSET_TYPE);
  return { db, accountId };
}

(() => {
  const { db, accountId } = makeDb();
  const listing = market.createListing(db, { accountId, askPrice:48000 });
  assert.strictEqual(Number(db.prepare("SELECT COUNT(*) n FROM badge_listings WHERE seller_account_id=? AND status='active'").get(accountId).n), 1);
  assert.strictEqual(listing.reservation.quantity, 1n);
  assert.strictEqual(listing.reservation.quantity_listed, 1n);
  assert.throws(() => JSON.stringify({ ok:true, ...listing }), /BigInt/);
  const listingPayload = { ok:true, ...listing, reservation:market.holdingForJson(listing.reservation) };
  assert.deepStrictEqual(listingPayload.reservation, { quantity:1, quantity_listed:1 });
  assert.doesNotThrow(() => JSON.stringify(listingPayload));
  assert.strictEqual(listing.warning.warn, false);
  assert.strictEqual(listing.warning.reason, 'no_reference');

  const cancelled = market.cancelListing(db, { accountId, listingId:listing.id });
  assert.strictEqual(cancelled.reservation.quantity, 1n);
  assert.strictEqual(cancelled.reservation.quantity_listed, 0n);
  const cancelPayload = { ...cancelled, reservation:market.holdingForJson(cancelled.reservation) };
  assert.deepStrictEqual(cancelPayload.reservation, { quantity:1, quantity_listed:0 });
  assert.doesNotThrow(() => JSON.stringify(cancelPayload));
  assert.strictEqual(db.prepare('SELECT status FROM badge_listings WHERE id=?').get(listing.id).status, 'cancelled');

  const fakeCustodian = { getBalance:() => 1000000, debit:() => {} };
  const bid = market.createBid(db, fakeCustodian, { accountId, bidPrice:47000 });
  assert.doesNotThrow(() => JSON.stringify({ ok:true, ...bid }));
  assert.strictEqual(Number(db.prepare("SELECT COUNT(*) n FROM badge_bids WHERE buyer_account_id=? AND status='active'").get(accountId).n), 1);
  db.close();
  console.log('Badge Market JSON Boundary V1: PASS');
  console.log('Internal reservation contract remains BigInt; listing/cancel HTTP payloads are JSON-safe; listing persists exactly once; bid response remains JSON-safe.');
})();
