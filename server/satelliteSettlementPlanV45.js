// Converts ranked satellite finishers into concrete V45 award instructions.
// PURE PLANNING ONLY: no DB writes, custody, tickets, or reserve mutation.

const { computePaidContest, computeFreerollRequirement } = require('./payoutEngineV2');

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

function minimumFieldForTier(tierKey) {
  for (let n = 1; n <= 100; n++) {
    if (computePaidContest({ tierKey, fieldSize: n }).status === 'OK') return n;
  }
  throw new Error(`Could not find funded minimum for ${tierKey}`);
}

function planPaidSatellite({ priceLevel, ranked }) {
  const tierKey = PRICE_LEVEL_TO_TIER[priceLevel];
  if (!tierKey) throw new Error(`Unsupported paid price level: ${priceLevel}`);
  const rows = rankedIds(ranked);
  const math = computePaidContest({ tierKey, fieldSize: rows.length });

  if (math.status !== 'OK') {
    return {
      status: math.status,
      action: 'DO_NOT_SETTLE_UNFUNDED',
      tierKey,
      fieldSize: rows.length,
      minimumFundedField: minimumFieldForTier(tierKey),
      shortfall: math.shortfall,
      math,
      awards: [],
    };
  }

  const awards = math.payouts.map(p => {
    const finisher = rows[p.rank - 1];
    return {
      accountId: finisher.accountId,
      entryId: finisher.entryId ?? null,
      rank: p.rank,
      ticketType: p.ticketTier,
      ticketQuantity: p.quantity,
      backingPerTicket: p.liabilityBacking / p.quantity,
      totalTicketBacking: p.liabilityBacking,
      stonkBonus: p.stonkBonus,
      mainEventUpgrade: p.award === 'main_event_ticket',
    };
  });

  return {
    status: 'OK',
    action: 'SETTLE',
    tierKey,
    fieldSize: rows.length,
    math,
    awards,
    accounting: {
      rake: math.rake,
      freerollReserveContribution: math.freerollReserveContribution,
      mainEventReserve: math.mainEventReserve,
      lowerTierTicketLiability: math.lowerTierTicketLiability,
      residualBonuses: math.residualBonuses,
      contestPrizePool: math.contestPrizePool,
    },
  };
}

function planFreeroll({ ranked, reserveBalance, runnerTicketBacking = 100 }) {
  const rows = rankedIds(ranked);
  const requirement = computeFreerollRequirement({ fieldSize: rows.length, runnerTicketBacking });
  const available = Number(reserveBalance || 0);
  if (available + 1e-9 < requirement.liabilityRequired) {
    return {
      status: 'FREEROLL_RESERVE_UNDERFUNDED',
      action: 'DO_NOT_PROMISE_OR_SETTLE_UNFUNDED',
      fieldSize: rows.length,
      reserveBalance: available,
      required: requirement.liabilityRequired,
      shortfall: requirement.liabilityRequired - available,
      requirement,
      awards: [],
    };
  }

  const awards = rows.slice(0, requirement.paidPlaces).map(r => ({
    accountId: r.accountId,
    entryId: r.entryId ?? null,
    rank: r.rank,
    ticketType: 'runner',
    ticketQuantity: 2,
    backingPerTicket: runnerTicketBacking,
    totalTicketBacking: runnerTicketBacking * 2,
    stonkBonus: 0,
    mainEventUpgrade: false,
  }));

  return {
    status: 'OK',
    action: 'SETTLE',
    fieldSize: rows.length,
    reserveBalance: available,
    reserveSpend: requirement.liabilityRequired,
    requirement,
    awards,
  };
}

module.exports = {
  PRICE_LEVEL_TO_TIER,
  minimumFieldForTier,
  planPaidSatellite,
  planFreeroll,
};
