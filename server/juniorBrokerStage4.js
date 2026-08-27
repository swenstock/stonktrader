'use strict';

const {
  REDEEM_COUNT,
  ensureSchema: ensureJuniorSchema,
  getJuniorCount,
  redeemJuniorsForActivatedBroker,
} = require('./juniorBrokerStage2');

function assertAccountId(accountId) {
  if (!Number.isSafeInteger(accountId) || accountId <= 0) throw new TypeError('accountId must be a positive safe integer');
}

function safeCount(value, label) {
  if (typeof value !== 'bigint' || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} is outside safe UI count range`);
  }
  return Number(value);
}

function prepareBigInt(db, sql) {
  const stmt = db.prepare(sql);
  stmt.setReadBigInts(true);
  return stmt;
}

function getPlayerJuniorSnapshot(db, accountId) {
  ensureJuniorSchema(db);
  assertAccountId(accountId);

  const countBig = getJuniorCount(db, accountId);
  const holding = prepareBigInt(db, `SELECT quantity, quantity_listed FROM sbc_prize_holdings WHERE account_id=? AND asset_type='junior_broker_share'`).get(accountId);
  const listedBig = holding ? holding.quantity_listed : 0n;
  const availableBig = countBig - listedBig;
  const count = safeCount(countBig, 'Junior count');
  const listed = safeCount(listedBig, 'listed Junior count');
  const available = safeCount(availableBig, 'available Junior count');
  const redeemCount = safeCount(REDEEM_COUNT, 'redeem count');
  const remainder = available % redeemCount;
  const redeemable = available >= redeemCount;
  const progress = redeemable && remainder === 0 ? redeemCount : remainder;

  const rows = prepareBigInt(db, `
    SELECT event_type, event_id, source, quantity, stonk_subunits, status, created_at
    FROM (
      SELECT
        'issuance' AS event_type,
        issuance_id AS event_id,
        source,
        1 AS quantity,
        gross_subunits AS stonk_subunits,
        'funded' AS status,
        created_at
      FROM sbc_junior_broker_issuances
      WHERE account_id = ?

      UNION ALL

      SELECT
        'redemption' AS event_type,
        redemption_id AS event_id,
        'activated_broker' AS source,
        -20 AS quantity,
        broker_reserve_debit_subunits AS stonk_subunits,
        status,
        created_at
      FROM sbc_activated_broker_redemptions
      WHERE account_id = ?
    )
    ORDER BY created_at DESC, event_id DESC
    LIMIT 100
  `).all(accountId, accountId);

  return {
    assetType: 'junior_broker_share',
    displayName: 'Junior Stonk Broker',
    count,
    listed,
    available,
    redeemCount,
    progress,
    remainder,
    progressLabel: `${progress} / ${redeemCount}`,
    redeemable,
    fullRedemptionsAvailable: Math.floor(available / redeemCount),
    history: rows.map(row => ({
      type: row.event_type,
      id: row.event_id,
      source: row.source,
      quantity: Number(row.quantity),
      stonkSubunits: row.stonk_subunits.toString(),
      status: row.status,
      createdAt: row.created_at,
    })),
  };
}

function redeemPlayerJuniors(db, { accountId, redemptionId }) {
  assertAccountId(accountId);
  if (typeof redemptionId !== 'string' || !redemptionId.trim()) {
    throw new TypeError('redemptionId must be a non-empty string');
  }
  const redemption = redeemJuniorsForActivatedBroker(db, { accountId, redemptionId });
  return {
    redemptionId: redemption.redemptionId,
    status: redemption.status,
    brokerReserveDebitSubunits: redemption.brokerReserveDebitSubunits.toString(),
    snapshot: getPlayerJuniorSnapshot(db, accountId),
  };
}

module.exports = {
  getPlayerJuniorSnapshot,
  redeemPlayerJuniors,
};
