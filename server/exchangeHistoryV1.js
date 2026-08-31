'use strict';

const MARKET_ALIASES = new Map([
  ['runner','runner'],
  ['clerk','clerk'],
  ['trader','trader'],
  ['junior','junior'],
  ['jr broker','junior'],
  ['jr. stonkbroker','junior'],
  ['badge','badge'],
  ['jr stonk broker badge','badge'],
]);

function normalizeMarket(value) {
  if (value == null || String(value).trim() === '') return null;
  return MARKET_ALIASES.get(String(value).trim().toLowerCase()) || undefined;
}

function parsePage({ limit, offset } = {}) {
  const parsedLimit = limit == null || limit === '' ? 25 : Number(limit);
  const parsedOffset = offset == null || offset === '' ? 0 : Number(offset);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw Object.assign(new Error('limit must be an integer from 1 to 100'), { code:'BAD_PAGINATION' });
  }
  if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
    throw Object.assign(new Error('offset must be a non-negative integer'), { code:'BAD_PAGINATION' });
  }
  return { limit:parsedLimit, offset:parsedOffset };
}

function queryHistory(db, { limit, offset, search = '', market = null } = {}) {
  const page = parsePage({ limit, offset });
  const normalizedMarket = normalizeMarket(market);
  if (normalizedMarket === undefined) {
    throw Object.assign(new Error('Unknown Exchange market'), { code:'BAD_MARKET' });
  }
  const needle = String(search || '').trim();
  const sql = `
    WITH history AS (
      SELECT
        l.sold_at AS time,
        t.ticket_type AS market,
        l.ask_price AS price,
        buyer.display_name AS buyer,
        seller.display_name AS seller,
        'Ticket #' || CAST(l.ticket_id AS TEXT) AS item,
        l.id AS sort_id
      FROM ticket_listings l
      JOIN tickets t ON t.id=l.ticket_id
      JOIN accounts buyer_account ON buyer_account.id=l.buyer_account_id
      JOIN users buyer ON buyer.id=buyer_account.user_id
      JOIN accounts seller_account ON seller_account.id=l.seller_account_id
      JOIN users seller ON seller.id=seller_account.user_id
      WHERE l.status='sold' AND l.sold_at IS NOT NULL

      UNION ALL

      SELECT
        b.filled_at AS time,
        b.ticket_type AS market,
        b.bid_price AS price,
        buyer.display_name AS buyer,
        seller.display_name AS seller,
        'Ticket #' || CAST(b.filled_ticket_id AS TEXT) AS item,
        b.id AS sort_id
      FROM ticket_bids b
      JOIN accounts buyer_account ON buyer_account.id=b.buyer_account_id
      JOIN users buyer ON buyer.id=buyer_account.user_id
      JOIN accounts seller_account ON seller_account.id=b.seller_account_id
      JOIN users seller ON seller.id=seller_account.user_id
      WHERE b.status='filled' AND b.filled_at IS NOT NULL

      UNION ALL

      SELECT
        bt.created_at AS time,
        'badge' AS market,
        bt.price_stonk AS price,
        buyer.display_name AS buyer,
        seller.display_name AS seller,
        'Jr Stonk Broker Badge' AS item,
        bt.id AS sort_id
      FROM badge_trades bt
      JOIN accounts buyer_account ON buyer_account.id=bt.buyer_account_id
      JOIN users buyer ON buyer.id=buyer_account.user_id
      JOIN accounts seller_account ON seller_account.id=bt.seller_account_id
      JOIN users seller ON seller.id=seller_account.user_id
    )
    SELECT time, market, price, buyer, seller, item
    FROM history
    WHERE (? IS NULL OR market=?)
      AND (?='' OR instr(lower(coalesce(buyer,'')), lower(?))>0 OR instr(lower(coalesce(seller,'')), lower(?))>0)
    ORDER BY julianday(time) DESC, sort_id DESC
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(sql).all(
    normalizedMarket, normalizedMarket,
    needle, needle, needle,
    page.limit + 1, page.offset
  );
  const hasMore = rows.length > page.limit;
  return {
    rows: rows.slice(0, page.limit).map(row => ({
      time:row.time,
      market:row.market,
      price:Number(row.price),
      buyer:row.buyer,
      seller:row.seller,
      item:row.item,
    })),
    limit:page.limit,
    offset:page.offset,
    nextOffset:hasMore ? page.offset + page.limit : null,
    hasMore,
    search:needle,
    market:normalizedMarket,
  };
}

module.exports = { normalizeMarket, parsePage, queryHistory };
