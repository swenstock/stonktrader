'use strict';

const crypto = require('crypto');
const {
  reserveListedQuantityInTransaction,
  releaseListedQuantityInTransaction,
  ensureSchema: ensureQuantityLockSchema,
} = require('./badgeQuantityLockV45');
const {
  ASSET_TYPE,
  SOURCE_MINTED,
  splitForSource,
  recordJuniorIssuanceInTransaction,
} = require('./juniorBrokerStage2');
const { creditIssuanceInTransaction, getBalances } = require('./prizeReserveLedger');

const BADGE_ASSET_TYPE = ASSET_TYPE;
const MINT_PRICE_STONK = 48000;
const BADGE_FLOOR_STONK = 36666.6;
const MISPRICING_THRESHOLD = Math.max(0, Number(process.env.BADGE_MARKET_WARNING_THRESHOLD || 0.25));
const EXCHANGE_FEE_PCT = Math.max(0, Math.min(1, Number(process.env.TICKET_MARKET_FEE_PCT || 0)));

function assertAccountId(id) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new TypeError('accountId must be a positive safe integer');
}
function assertPrice(value, label = 'price') {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) throw new RangeError(`${label} must be a positive number`);
  return n;
}
function prepareBigInt(db, sql) {
  const stmt = db.prepare(sql);
  stmt.setReadBigInts(true);
  return stmt;
}
function ensureSchema(db) {
  ensureQuantityLockSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS badge_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      ask_price INTEGER NOT NULL CHECK(ask_price > 0),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','sold','cancelled')),
      buyer_account_id INTEGER REFERENCES accounts(id),
      platform_fee_stonk INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      sold_at TEXT,
      cancelled_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_badge_listings_book ON badge_listings(status, ask_price, id);
    CREATE INDEX IF NOT EXISTS idx_badge_listings_seller ON badge_listings(seller_account_id, status);

    CREATE TABLE IF NOT EXISTS badge_bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      bid_price INTEGER NOT NULL CHECK(bid_price > 0),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','filled','cancelled')),
      seller_account_id INTEGER REFERENCES accounts(id),
      platform_fee_stonk INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      filled_at TEXT,
      cancelled_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_badge_bids_book ON badge_bids(status, bid_price DESC, id);
    CREATE INDEX IF NOT EXISTS idx_badge_bids_buyer ON badge_bids(buyer_account_id, status);

    CREATE TABLE IF NOT EXISTS badge_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER REFERENCES badge_listings(id),
      bid_id INTEGER REFERENCES badge_bids(id),
      buyer_account_id INTEGER NOT NULL REFERENCES accounts(id),
      seller_account_id INTEGER NOT NULL REFERENCES accounts(id),
      price_stonk INTEGER NOT NULL,
      platform_fee_stonk INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      CHECK((listing_id IS NOT NULL) != (bid_id IS NOT NULL))
    );
    CREATE INDEX IF NOT EXISTS idx_badge_trades_recent ON badge_trades(id DESC);
  `);
}

function feeFor(price) { return Math.round(assertPrice(price) * EXCHANGE_FEE_PCT); }
function recordPlatformFee(db, amount, referenceType, referenceId) {
  if (!(amount > 0)) return;
  db.prepare(`INSERT INTO sbc_reserve_ledger
    (bucket, amount, reason, reference_type, reference_id)
    VALUES ('platform_revenue', ?, 'badge_market_fee', ?, ?)`)
    .run(amount, referenceType, referenceId);
}
function getHolding(db, accountId) {
  const row = prepareBigInt(db, `SELECT quantity, quantity_listed FROM sbc_prize_holdings WHERE account_id=? AND asset_type=?`)
    .get(accountId, BADGE_ASSET_TYPE);
  return row || { quantity: 0n, quantity_listed: 0n };
}
function addBadgeInTransaction(db, accountId) {
  prepareBigInt(db, `INSERT INTO sbc_prize_holdings(account_id, asset_type, quantity, quantity_listed)
    VALUES (?, ?, 1, 0)
    ON CONFLICT(account_id, asset_type) DO UPDATE SET quantity=quantity+1, updated_at=CURRENT_TIMESTAMP`)
    .run(accountId, BADGE_ASSET_TYPE);
}
function consumeReservedBadgeInTransaction(db, accountId) {
  const info = prepareBigInt(db, `UPDATE sbc_prize_holdings
    SET quantity=quantity-1, quantity_listed=quantity_listed-1, updated_at=CURRENT_TIMESTAMP
    WHERE account_id=? AND asset_type=? AND quantity>=1 AND quantity_listed>=1`)
    .run(accountId, BADGE_ASSET_TYPE);
  if (!(info.changes === 1 || info.changes === 1n)) {
    const err = new Error('reserved Badge unit is no longer available');
    err.code = 'BADGE_RESERVATION_MISSING';
    throw err;
  }
}
function consumeUnlistedBadgeInTransaction(db, accountId) {
  const info = prepareBigInt(db, `UPDATE sbc_prize_holdings
    SET quantity=quantity-1, updated_at=CURRENT_TIMESTAMP
    WHERE account_id=? AND asset_type=? AND quantity-quantity_listed>=1`)
    .run(accountId, BADGE_ASSET_TYPE);
  if (!(info.changes === 1 || info.changes === 1n)) {
    const err = new Error('no unlisted Badge unit is available');
    err.code = 'INSUFFICIENT_UNLISTED_QUANTITY';
    throw err;
  }
}
function currentReferencePrice(db) {
  ensureSchema(db);
  const ask = db.prepare(`SELECT ask_price FROM badge_listings WHERE status='active' ORDER BY ask_price ASC, id ASC LIMIT 1`).get();
  if (ask) return { price: Number(ask.ask_price), source: 'lowest_ask' };
  const sale = db.prepare(`SELECT price_stonk FROM badge_trades ORDER BY id DESC LIMIT 1`).get();
  if (sale) return { price: Number(sale.price_stonk), source: 'last_sale' };
  return null;
}
function currentReferencePriceExcluding(db, listingId) {
  const ask = db.prepare(`SELECT ask_price FROM badge_listings WHERE status='active' AND id<>? ORDER BY ask_price ASC, id ASC LIMIT 1`).get(listingId);
  if (ask) return { price: Number(ask.ask_price), source: 'lowest_ask' };
  const sale = db.prepare(`SELECT price_stonk FROM badge_trades ORDER BY id DESC LIMIT 1`).get();
  return sale ? { price: Number(sale.price_stonk), source: 'last_sale' } : null;
}
function mispricingWarning(price, reference) {
  const p = assertPrice(price);
  const ref = reference && Number(reference.price ?? reference);
  if (!(ref > 0)) return { warn: false, reason: 'no_reference', price: p, referencePrice: null, gapPct: null };
  const gapPct = Math.abs(p - ref) / ref;
  const outsideBand = p < BADGE_FLOOR_STONK || p > MINT_PRICE_STONK;
  const warn = gapPct > MISPRICING_THRESHOLD && outsideBand;
  return {
    warn,
    reason: warn ? (p < ref ? 'well_below_market' : 'well_above_market') : 'within_guardrail',
    price: p,
    referencePrice: ref,
    gapPct,
    threshold: MISPRICING_THRESHOLD,
    floor: BADGE_FLOOR_STONK,
    mintCeiling: MINT_PRICE_STONK,
  };
}
function book(db, myAccountId = null) {
  ensureSchema(db);
  const listings = db.prepare(`SELECT l.*, u.display_name seller_display_name,
      CASE WHEN l.seller_account_id=? THEN 1 ELSE 0 END is_mine
    FROM badge_listings l JOIN accounts a ON a.id=l.seller_account_id JOIN users u ON u.id=a.user_id
    WHERE l.status='active' ORDER BY l.ask_price ASC, l.id ASC`).all(myAccountId);
  const bids = db.prepare(`SELECT b.*, u.display_name buyer_display_name,
      CASE WHEN b.buyer_account_id=? THEN 1 ELSE 0 END is_mine
    FROM badge_bids b JOIN accounts a ON a.id=b.buyer_account_id JOIN users u ON u.id=a.user_id
    WHERE b.status='active' ORDER BY b.bid_price DESC, b.id ASC`).all(myAccountId);
  const recent = db.prepare(`SELECT * FROM badge_trades ORDER BY id DESC LIMIT 20`).all();
  const holding = myAccountId ? getHolding(db, myAccountId) : { quantity: 0n, quantity_listed: 0n };
  return {
    assetType: BADGE_ASSET_TYPE,
    lowestAsk: listings[0] ? Number(listings[0].ask_price) : null,
    highestBid: bids[0] ? Number(bids[0].bid_price) : null,
    listings: listings.map(x => ({ id:Number(x.id), askPrice:Number(x.ask_price), sellerDisplayName:x.seller_display_name, isMine:x.is_mine===1 || x.is_mine===1n, createdAt:x.created_at })),
    bids: bids.map(x => ({ id:Number(x.id), bidPrice:Number(x.bid_price), buyerDisplayName:x.buyer_display_name, isMine:x.is_mine===1 || x.is_mine===1n, createdAt:x.created_at })),
    recentTrades: recent.map(x => ({ id:Number(x.id), price:Number(x.price_stonk), fee:Number(x.platform_fee_stonk), createdAt:x.created_at })),
    owned: Number(holding.quantity),
    listed: Number(holding.quantity_listed),
    available: Number(holding.quantity - holding.quantity_listed),
    exchangeFeePct: EXCHANGE_FEE_PCT,
    mintPrice: MINT_PRICE_STONK,
    floor: BADGE_FLOOR_STONK,
    warningThreshold: MISPRICING_THRESHOLD,
  };
}
function createListing(db, { accountId, askPrice }) {
  ensureSchema(db); assertAccountId(accountId); const price = assertPrice(askPrice, 'askPrice');
  db.exec('BEGIN IMMEDIATE');
  try {
    reserveListedQuantityInTransaction(db, { accountId, assetType: BADGE_ASSET_TYPE, quantity: 1n });
    const info = db.prepare(`INSERT INTO badge_listings(seller_account_id, ask_price) VALUES (?,?)`).run(accountId, price);
    db.exec('COMMIT');
    const id = Number(info.lastInsertRowid);
    return { id, askPrice:price, reservation:getHolding(db, accountId), warning:mispricingWarning(price, currentReferencePriceExcluding(db, id)) };
  } catch (err) { try { db.exec('ROLLBACK'); } catch (_) {} throw err; }
}
function cancelListing(db, { accountId, listingId }) {
  ensureSchema(db); assertAccountId(accountId);
  db.exec('BEGIN IMMEDIATE');
  try {
    const listing = db.prepare(`SELECT * FROM badge_listings WHERE id=?`).get(listingId);
    if (!listing || Number(listing.seller_account_id) !== accountId) throw Object.assign(new Error('Badge listing not found'), { code:'NOT_FOUND' });
    if (listing.status !== 'active') throw new Error('Only active Badge listings can be cancelled');
    releaseListedQuantityInTransaction(db, { accountId, assetType: BADGE_ASSET_TYPE, quantity:1n });
    db.prepare(`UPDATE badge_listings SET status='cancelled', cancelled_at=? WHERE id=?`).run(new Date().toISOString(), listing.id);
    db.exec('COMMIT');
    return { ok:true, reservation:getHolding(db, accountId) };
  } catch (err) { try { db.exec('ROLLBACK'); } catch (_) {} throw err; }
}
function createBid(db, custodian, { accountId, bidPrice }) {
  ensureSchema(db); assertAccountId(accountId); const price = assertPrice(bidPrice, 'bidPrice');
  if (custodian.getBalance(accountId) < price) throw new Error('Not enough STONK to fund this Badge bid');
  db.exec('BEGIN IMMEDIATE');
  try {
    const info = db.prepare(`INSERT INTO badge_bids(buyer_account_id,bid_price) VALUES (?,?)`).run(accountId, price);
    const id = Number(info.lastInsertRowid);
    custodian.debit(accountId, price, 'badge_bid_hold', { referenceType:'badge_bid', referenceId:id });
    db.exec('COMMIT');
    return { id, bidPrice:price, warning:mispricingWarning(price, currentReferencePrice(db)) };
  } catch (err) { try { db.exec('ROLLBACK'); } catch (_) {} throw err; }
}
function cancelBid(db, custodian, { accountId, bidId }) {
  ensureSchema(db); assertAccountId(accountId);
  db.exec('BEGIN IMMEDIATE');
  try {
    const bid = db.prepare(`SELECT * FROM badge_bids WHERE id=?`).get(bidId);
    if (!bid || Number(bid.buyer_account_id) !== accountId) throw Object.assign(new Error('Badge bid not found'), { code:'NOT_FOUND' });
    if (bid.status !== 'active') throw new Error('Only active Badge bids can be cancelled');
    const bidPrice = assertPrice(bid.bid_price, 'bidPrice');
    db.prepare(`UPDATE badge_bids SET status='cancelled', cancelled_at=? WHERE id=?`).run(new Date().toISOString(), bid.id);
    custodian.credit(accountId, bidPrice, 'badge_bid_release', { referenceType:'badge_bid', referenceId:Number(bid.id) });
    db.exec('COMMIT');
    return { ok:true, released:bidPrice };
  } catch (err) { try { db.exec('ROLLBACK'); } catch (_) {} throw err; }
}
function buyListing(db, custodian, { accountId, listingId }) {
  ensureSchema(db); assertAccountId(accountId);
  db.exec('BEGIN IMMEDIATE');
  try {
    const listing = db.prepare(`SELECT * FROM badge_listings WHERE id=?`).get(listingId);
    if (!listing || listing.status !== 'active') throw Object.assign(new Error('Badge listing not available'), { code:'NOT_FOUND' });
    const sellerAccountId = Number(listing.seller_account_id);
    const askPrice = assertPrice(listing.ask_price, 'askPrice');
    if (sellerAccountId === accountId) throw new Error("You can't buy your own Badge listing");
    if (custodian.getBalance(accountId) < askPrice) throw new Error('Not enough STONK');
    const fee = feeFor(askPrice), sellerProceeds = askPrice - fee;
    custodian.debit(accountId, askPrice, 'badge_purchase', { referenceType:'badge_listing', referenceId:Number(listing.id) });
    custodian.credit(sellerAccountId, sellerProceeds, 'badge_sale', { referenceType:'badge_listing', referenceId:Number(listing.id) });
    recordPlatformFee(db, fee, 'badge_listing', Number(listing.id));
    consumeReservedBadgeInTransaction(db, sellerAccountId);
    addBadgeInTransaction(db, accountId);
    db.prepare(`UPDATE badge_listings SET status='sold', buyer_account_id=?, platform_fee_stonk=?, sold_at=? WHERE id=?`)
      .run(accountId, fee, new Date().toISOString(), listing.id);
    const trade = db.prepare(`INSERT INTO badge_trades(listing_id,buyer_account_id,seller_account_id,price_stonk,platform_fee_stonk) VALUES (?,?,?,?,?)`)
      .run(listing.id, accountId, sellerAccountId, askPrice, fee);
    db.exec('COMMIT');
    return { ok:true, tradeId:Number(trade.lastInsertRowid), paid:askPrice, sellerReceived:sellerProceeds, platformFee:fee };
  } catch (err) { try { db.exec('ROLLBACK'); } catch (_) {} throw err; }
}
function sellToBid(db, custodian, { accountId, bidId }) {
  ensureSchema(db); assertAccountId(accountId);
  db.exec('BEGIN IMMEDIATE');
  try {
    const bid = db.prepare(`SELECT * FROM badge_bids WHERE id=?`).get(bidId);
    if (!bid || bid.status !== 'active') throw Object.assign(new Error('Badge bid not available'), { code:'NOT_FOUND' });
    const buyerAccountId = Number(bid.buyer_account_id);
    const bidPrice = assertPrice(bid.bid_price, 'bidPrice');
    if (buyerAccountId === accountId) throw new Error("You can't sell a Badge to your own bid");
    const holding = getHolding(db, accountId);
    if (holding.quantity - holding.quantity_listed >= 1n) {
      consumeUnlistedBadgeInTransaction(db, accountId);
    } else if (holding.quantity_listed >= 1n) {
      const listing = db.prepare(`SELECT * FROM badge_listings WHERE seller_account_id=? AND status='active' ORDER BY id ASC LIMIT 1`).get(accountId);
      if (!listing) throw new Error('Badge reservation has no active listing');
      db.prepare(`UPDATE badge_listings SET status='cancelled', cancelled_at=? WHERE id=?`).run(new Date().toISOString(), listing.id);
      consumeReservedBadgeInTransaction(db, accountId);
    } else {
      throw Object.assign(new Error('You do not have a Badge available to sell'), { code:'INSUFFICIENT_UNLISTED_QUANTITY' });
    }
    const fee = feeFor(bidPrice), sellerProceeds = bidPrice - fee;
    custodian.credit(accountId, sellerProceeds, 'badge_sale_to_bid', { referenceType:'badge_bid', referenceId:Number(bid.id) });
    recordPlatformFee(db, fee, 'badge_bid', Number(bid.id));
    addBadgeInTransaction(db, buyerAccountId);
    db.prepare(`UPDATE badge_bids SET status='filled', seller_account_id=?, platform_fee_stonk=?, filled_at=? WHERE id=?`)
      .run(accountId, fee, new Date().toISOString(), bid.id);
    const trade = db.prepare(`INSERT INTO badge_trades(bid_id,buyer_account_id,seller_account_id,price_stonk,platform_fee_stonk) VALUES (?,?,?,?,?)`)
      .run(bid.id, buyerAccountId, accountId, bidPrice, fee);
    db.exec('COMMIT');
    return { ok:true, tradeId:Number(trade.lastInsertRowid), soldFor:bidPrice, sellerReceived:sellerProceeds, platformFee:fee };
  } catch (err) { try { db.exec('ROLLBACK'); } catch (_) {} throw err; }
}
function mintBadge(db, custodian, { accountId, issuanceId = `player-mint:${accountId}:${crypto.randomUUID()}` }) {
  ensureSchema(db); assertAccountId(accountId);
  if (custodian.getBalance(accountId) < MINT_PRICE_STONK) throw new Error('Not enough STONK to mint a Jr. Broker Badge');
  const split = splitForSource(SOURCE_MINTED);
  db.exec('BEGIN IMMEDIATE');
  try {
    custodian.debit(accountId, MINT_PRICE_STONK, 'junior_broker_badge_mint', { referenceType:'junior_broker_badge', referenceId:null });
    creditIssuanceInTransaction(db, { issuanceId, brokerSubunits:split.brokerSubunits, overflowSubunits:split.overflowSubunits, reason:'junior_broker_share_minted' });
    recordJuniorIssuanceInTransaction(db, { issuanceId, accountId, source:SOURCE_MINTED, split });
    db.exec('COMMIT');
  } catch (err) { try { db.exec('ROLLBACK'); } catch (_) {} throw err; }
  return { ok:true, issuanceId, paid:MINT_PRICE_STONK, brokerSubunits:split.brokerSubunits, overflowSubunits:split.overflowSubunits, balances:getBalances(db), holding:getHolding(db, accountId) };
}

module.exports = {
  BADGE_ASSET_TYPE, MINT_PRICE_STONK, BADGE_FLOOR_STONK, MISPRICING_THRESHOLD, EXCHANGE_FEE_PCT,
  ensureSchema, feeFor, currentReferencePrice, mispricingWarning, book, getHolding,
  createListing, cancelListing, createBid, cancelBid, buyListing, sellToBid, mintBadge,
};
