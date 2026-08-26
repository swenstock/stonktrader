// Converts ranked satellite finishers into concrete V45 corporate-ladder awards.
// PURE PLANNING ONLY: no DB writes, custody, tickets, Badges, or reserve mutation.

const { computeCascadingContest, computeFreerollPlan } = require('./payoutEngineV2');

const PRICE_LEVEL_TO_TIER = Object.freeze({
  runner: 'runner',
  low: 'clerk',
  mid: 'trader',
  high: 'junior',
});

function rankedIds(ranked) {
  if (!Array.isArray(ranked) || ranked.length < 1) throw new Error('ranked finishers required');
  return ranked.map((r, i) => ({ ...r, rank: i + 1 }));
}

function planPaidSatellite({ priceLevel, ranked, poolUnallocatedStonk = 0 }) {
  const tierKey = PRICE_LEVEL_TO_TIER[priceLevel];
  if (!tierKey) throw new Error(`Unsupported paid price level: ${priceLevel}`);
  const rows = rankedIds(ranked);
  const math = computeCascadingContest({ tierKey, fieldSize: rows.length, poolUnallocatedStonk });

  const awards = math.payouts.map(p => {
    const finisher = rows[p.rank - 1];
    return {
      accountId: finisher.accountId,
      entryId: finisher.entryId ?? null,
      rank: p.rank,
      award: p.award,
      badgeQuantity: p.badgeQuantity || 0,
      badgeFundingContribution: p.badgeFundingContribution || 0,
      ticketType: p.ticketTier,
      ticketQuantity: p.quantity,
      backingPerTicket: p.quantity > 0 ? p.liabilityBacking / p.quantity : 0,
      totalTicketBacking: p.liabilityBacking,
      stonkBonus: p.stonkBonus,
      isCashPrize: p.isCashPrize === true,
    };
  });

  return {
    status: 'OK', action: 'SETTLE', tierKey, fieldSize: rows.length, math, awards,
    accounting: {
      rake: math.rake,
      freerollReserveContribution: math.freerollReserveContribution,
      badgeFundingContribution: math.badgeFundingContribution,
      carryContribution: math.carryContribution,
      lowerTierTicketLiability: math.lowerTierTicketLiability,
      stonkFallback: math.stonkFallback,
      contestPrizePool: math.contestPrizePool,
    },
  };
}

function planFreeroll({ ranked, reserveBalance }) {
  const rows = rankedIds(ranked);
  const math = computeFreerollPlan({ fieldSize: rows.length, reserveBalance });
  const awards = math.payouts.map(p => {
    const finisher = rows[p.rank - 1];
    return {
      accountId: finisher.accountId,
      entryId: finisher.entryId ?? null,
      rank: p.rank,
      award: p.award,
      badgeQuantity: p.badgeQuantity || 0,
      badgeFundingContribution: p.badgeFundingContribution || 0,
      ticketType: null,
      ticketQuantity: 0,
      backingPerTicket: 0,
      totalTicketBacking: 0,
      stonkBonus: p.stonkBonus || 0,
      isCashPrize: p.isCashPrize === true,
    };
  });
  return { status:'OK', action:'SETTLE', fieldSize:rows.length, reserveBalance:Number(reserveBalance||0), math, awards };
}

module.exports = { PRICE_LEVEL_TO_TIER, planPaidSatellite, planFreeroll };
