'use strict';

const { ASSET_TYPE, REDEEM_COUNT } = require('./juniorBrokerStage2');

function assertLimit(limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('limit must be an integer from 1 through 100');
  }
}

function prepareBigInt(db, sql) {
  const stmt = db.prepare(sql);
  stmt.setReadBigInts(true);
  return stmt;
}

function getBrokerRaceStats(db, { limit = 50 } = {}) {
  assertLimit(limit);

  const lifetime = prepareBigInt(db, `
    SELECT
      (SELECT COUNT(*) FROM sbc_activated_broker_redemptions) AS brokers_earned,
      (SELECT COUNT(*) FROM sbc_junior_broker_issuances) AS juniors_awarded,
      (SELECT COALESCE(SUM(quantity), 0)
         FROM sbc_prize_holdings
        WHERE asset_type = ?) AS juniors_stacked
  `).get(ASSET_TYPE);

  const redeemCount = Number(REDEEM_COUNT);
  const rows = prepareBigInt(db, `
    SELECT h.account_id AS accountId,
           u.display_name AS displayName,
           h.quantity AS juniorCount
      FROM sbc_prize_holdings h
      JOIN accounts a ON a.id = h.account_id
      JOIN users u ON u.id = a.user_id
     WHERE h.asset_type = ? AND h.quantity > 0
     ORDER BY CASE
                WHEN h.quantity >= ${redeemCount} AND h.quantity % ${redeemCount} = 0 THEN ${redeemCount}
                ELSE h.quantity % ${redeemCount}
              END DESC,
              LOWER(u.display_name) ASC,
              h.account_id ASC
     LIMIT ?
  `).all(ASSET_TYPE, BigInt(limit));

  const stackers = rows.map((row, index) => {
    const count = Number(row.juniorCount);
    const remainder = count % redeemCount;
    const progress = count >= redeemCount && remainder === 0 ? redeemCount : remainder;
    return {
      rank: index + 1,
      accountId: Number(row.accountId),
      displayName: row.displayName,
      juniorCount: count,
      redeemCount,
      progress,
      progressLabel: `${progress} / ${redeemCount}`,
      fullRedemptionsAvailable: Math.floor(count / redeemCount),
      juniorsToNextBroker: progress === redeemCount ? 0 : redeemCount - progress,
    };
  });

  return {
    brokersEarned: Number(lifetime.brokers_earned),
    juniorsAwarded: Number(lifetime.juniors_awarded),
    juniorsStacked: Number(lifetime.juniors_stacked),
    redeemCount,
    topStackers: stackers,
  };
}

module.exports = { getBrokerRaceStats };
