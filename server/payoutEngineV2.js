// SBC V45 corporate-ladder prize planner.
// Pure deterministic math. No DB writes or custody side effects.
//
// Product model:
//   * No Main Event upgrade destination.
//   * Paid contests target the top 10% (rounded up).
//   * Fully funded Jr. Broker Badges are awarded from the top down whenever
//     existing global carry plus the current contest can cover the 40,000
//     STONK funding unit without breaking the remaining fallback promise.
//   * Runner fallback is STONK. Clerk -> 2 Runner tickets. Trader -> 2 Clerk
//     tickets. Jr. StonkBroker -> 2 Trader tickets.
//   * Any true residual in fixed-ticket tiers becomes global Badge-pool carry.
//   * Free Roll is planned separately; it has no guaranteed top-10% liability.

const RAKE_RATE = 0.15;
const BADGE_FUNDING_UNIT = 40000;

const TIER_RULES = Object.freeze({
  runner: {
    name: 'Runner',
    playerPrice: 100,
    contestPortion: 100,
    freerollContribution: 0,
    fallback: { kind: 'stonk' },
  },
  clerk: {
    name: 'Clerk',
    playerPrice: 200,
    contestPortion: 150,
    freerollContribution: 50,
    fallback: { kind: 'tickets', ticketTier: 'runner', quantity: 2, unitBacking: 100 },
  },
  trader: {
    name: 'Trader',
    playerPrice: 400,
    contestPortion: 350,
    freerollContribution: 50,
    fallback: { kind: 'tickets', ticketTier: 'clerk', quantity: 2, unitBacking: 200 },
  },
  junior: {
    name: 'Jr. StonkBroker',
    playerPrice: 1050,
    contestPortion: 1000,
    freerollContribution: 50,
    fallback: { kind: 'tickets', ticketTier: 'trader', quantity: 2, unitBacking: 400 },
  },
});

const FALLBACK_LEVELS = Object.freeze({
  junior: [
    { ticketTier: 'trader', quantity: 2, unitBacking: 400 },
    { ticketTier: 'clerk', quantity: 2, unitBacking: 200 },
    { ticketTier: 'runner', quantity: 2, unitBacking: 100 },
  ],
  trader: [
    { ticketTier: 'clerk', quantity: 2, unitBacking: 200 },
    { ticketTier: 'runner', quantity: 2, unitBacking: 100 },
  ],
  clerk: [
    { ticketTier: 'runner', quantity: 2, unitBacking: 100 },
  ],
  runner: [],
});

function money(n) {
  return Math.round((Number(n) + Number.EPSILON) * 2) / 2;
}

function paidPlacesFor(fieldSize) {
  if (!Number.isInteger(fieldSize) || fieldSize < 1) throw new Error('fieldSize must be a positive integer');
  return Math.max(1, Math.ceil(fieldSize * 0.10));
}

function economicsForEntry(tierKey) {
  const rule = TIER_RULES[tierKey];
  if (!rule) throw new Error(`Unknown tier: ${tierKey}`);
  const rake = money(rule.contestPortion * RAKE_RATE);
  const contestPrize = money(rule.contestPortion - rake);
  return { ...rule, rake, contestPrize, totalPrizeDirected: money(contestPrize + rule.freerollContribution) };
}

function splitResidualTopDown(totalResidual, paidPlaces) {
  totalResidual = money(totalResidual);
  if (totalResidual <= 0 || paidPlaces <= 0) return Array(Math.max(0, paidPlaces)).fill(0);
  const weights = Array.from({ length: paidPlaces }, (_, i) => paidPlaces - i);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let remaining = totalResidual;
  return weights.map((w, i) => {
    if (i === paidPlaces - 1) return money(Math.max(0, remaining));
    const roundedShare = money((totalResidual * w) / totalWeight);
    const share = money(Math.min(Math.max(0, remaining), Math.max(0, roundedShare)));
    remaining = money(Math.max(0, remaining - share));
    return share;
  });
}

function fallbackCost(f) {
  return f && f.kind === 'tickets' ? money(f.quantity * f.unitBacking) : 0;
}

function badgeAward(rank, fundingContribution) {
  return {
    rank,
    award: 'jr_broker_badge',
    badgeQuantity: 1,
    ticketTier: null,
    quantity: 0,
    liabilityBacking: 0,
    stonkBonus: 0,
    badgeFundingContribution: money(fundingContribution),
    isCashPrize: false,
  };
}

function ticketAward(rank, level) {
  return {
    rank,
    award: 'fallback_tickets',
    badgeQuantity: 0,
    ticketTier: level.ticketTier,
    quantity: level.quantity,
    liabilityBacking: money(level.quantity * level.unitBacking),
    stonkBonus: 0,
    badgeFundingContribution: 0,
    isCashPrize: false,
  };
}

function cashAward(rank, amount) {
  return {
    rank,
    award: 'stonk_fallback',
    badgeQuantity: 0,
    ticketTier: null,
    quantity: 0,
    liabilityBacking: 0,
    stonkBonus: money(amount),
    badgeFundingContribution: 0,
    isCashPrize: true,
  };
}

function allocateFallbacks(tierKey, startRank, paidPlaces, availableStonk) {
  let rank = startRank;
  let pool = money(availableStonk);
  const payouts = [];
  const levels = FALLBACK_LEVELS[tierKey] || [];

  // Preserve the existing graceful-degradation idea: fund as many full pairs
  // as possible at the intended fallback, then step down the ticket ladder.
  for (const level of levels) {
    if (rank > paidPlaces) break;
    const cost = money(level.quantity * level.unitBacking);
    const placesLeft = paidPlaces - rank + 1;
    const funded = Math.min(placesLeft, Math.floor((pool + 1e-9) / cost));
    for (let i = 0; i < funded; i++) payouts.push(ticketAward(rank + i, level));
    rank += funded;
    pool = money(pool - funded * cost);
  }

  // If even the Runner pair floor cannot cover everyone, the remaining
  // protected finishers get the remaining STONK instead of an unfunded promise.
  if (rank <= paidPlaces) {
    const remainingPlaces = paidPlaces - rank + 1;
    const shares = splitResidualTopDown(pool, remainingPlaces);
    for (let i = 0; i < remainingPlaces; i++) payouts.push(cashAward(rank + i, shares[i]));
    pool = 0;
  }

  return { payouts, carryContribution: money(pool) };
}

function computePaidContest({ tierKey, fieldSize, poolUnallocatedStonk = 0 }) {
  const econ = economicsForEntry(tierKey);
  const paidPlaces = paidPlacesFor(fieldSize);
  const grossCharged = money(econ.playerPrice * fieldSize);
  const contestHandle = money(econ.contestPortion * fieldSize);
  const freerollReserveContribution = money(econ.freerollContribution * fieldSize);
  const rake = money(econ.rake * fieldSize);
  const contestPrizePool = money(econ.contestPrize * fieldSize);

  let currentCarry = Math.max(0, money(poolUnallocatedStonk));
  let remainingContest = contestPrizePool;
  const payouts = [];
  let rank = 1;
  let badgeContributions = 0;

  if (tierKey === 'runner') {
    // Runner has no fixed ticket liability. A Badge may use old carry plus only
    // the amount actually needed from this contest. Once the next Badge cannot
    // be funded, every remaining protected place splits the contest remainder.
    for (; rank <= paidPlaces; rank++) {
      const needed = money(Math.max(0, BADGE_FUNDING_UNIT - currentCarry));
      if (needed <= remainingContest + 1e-9) {
        payouts.push(badgeAward(rank, needed));
        remainingContest = money(remainingContest - needed);
        badgeContributions = money(badgeContributions + needed);
        currentCarry = money(Math.max(0, currentCarry - BADGE_FUNDING_UNIT)); // consume exactly one 40K carry unit
      } else {
        break;
      }
    }
    if (rank <= paidPlaces) {
      const shares = splitResidualTopDown(remainingContest, paidPlaces - rank + 1);
      shares.forEach((amount, i) => payouts.push(cashAward(rank + i, amount)));
      remainingContest = 0;
    }
  } else {
    const baseEach = fallbackCost(econ.fallback);
    for (; rank <= paidPlaces; rank++) {
      const remainingRanks = paidPlaces - rank + 1;
      const fallbackNeededForOthers = money(baseEach * Math.max(0, remainingRanks - 1));
      const maxContributionForThisRank = money(Math.max(0, remainingContest - fallbackNeededForOthers));
      const needed = money(Math.max(0, BADGE_FUNDING_UNIT - currentCarry));
      if (needed <= maxContributionForThisRank + 1e-9) {
        payouts.push(badgeAward(rank, needed));
        remainingContest = money(remainingContest - needed);
        badgeContributions = money(badgeContributions + needed);
        currentCarry = money(Math.max(0, currentCarry - BADGE_FUNDING_UNIT));
      } else {
        break;
      }
    }

    if (rank <= paidPlaces) {
      const fallback = allocateFallbacks(tierKey, rank, paidPlaces, remainingContest);
      payouts.push(...fallback.payouts);
      const spent = fallback.payouts.reduce((n, p) => n + p.liabilityBacking + p.stonkBonus, 0);
      remainingContest = money(remainingContest - spent);
    }
  }

  // For fixed-ticket tiers, or when Runner managed to Badge every protected
  // finisher, any true remainder is not a bonus. It becomes global Badge carry.
  const carryContribution = money(Math.max(0, remainingContest));
  const ticketLiability = money(payouts.reduce((n, p) => n + p.liabilityBacking, 0));
  const stonkFallback = money(payouts.reduce((n, p) => n + p.stonkBonus, 0));
  const badgeFundingContribution = money(payouts.reduce((n, p) => n + p.badgeFundingContribution, 0));
  const totalPrizeAllocated = money(ticketLiability + stonkFallback + badgeFundingContribution + carryContribution);

  return {
    status: 'OK',
    tierKey,
    tierName: econ.name,
    fieldSize,
    paidPlaces,
    grossCharged,
    contestHandle,
    freerollReserveContribution,
    rake,
    contestPrizePool,
    badgeFundingUnit: BADGE_FUNDING_UNIT,
    poolUnallocatedAtStart: money(poolUnallocatedStonk),
    badgesAwarded: payouts.filter(p => p.award === 'jr_broker_badge').length,
    badgeFundingContribution,
    carryContribution,
    lowerTierTicketLiability: ticketLiability,
    stonkFallback,
    totalPrizeAllocated,
    payouts,
    reconciliation: {
      entry: money(rake + contestPrizePool + freerollReserveContribution) === grossCharged,
      prize: totalPrizeAllocated === contestPrizePool,
    },
  };
}

function computeCascadingContest(args) {
  return computePaidContest(args);
}

function computeFreerollPlan({ fieldSize, reserveBalance, badgeFundingUnit = BADGE_FUNDING_UNIT }) {
  if (!Number.isInteger(fieldSize) || fieldSize < 1) throw new Error('fieldSize must be a positive integer');
  let reserve = Math.max(0, money(reserveBalance));
  const badgesAwarded = Math.min(fieldSize, Math.floor((reserve + 1e-9) / badgeFundingUnit));
  const payouts = [];
  for (let i = 0; i < badgesAwarded; i++) payouts.push(badgeAward(i + 1, badgeFundingUnit));
  reserve = money(reserve - badgesAwarded * badgeFundingUnit);

  // Free Roll has no top-10% cash promise. It exists to accumulate funded
  // Badge units. Any amount below the next complete 40,000-STONK Badge stays
  // in the dedicated Free Roll reserve and rolls forward to future contests.
  // There is deliberately no residual STONK payout.
  const cashDistributed = 0;
  const badgeSpend = money(badgesAwarded * badgeFundingUnit);
  return {
    status: 'OK',
    fieldSize,
    badgesAwarded,
    badgeSpend,
    cashDistributed,
    reserveSpend: badgeSpend,
    reserveRemainder: reserve,
    payouts,
  };
}

module.exports = {
  RAKE_RATE,
  BADGE_FUNDING_UNIT,
  TIER_RULES,
  FALLBACK_LEVELS,
  paidPlacesFor,
  economicsForEntry,
  computePaidContest,
  computeCascadingContest,
  computeFreerollPlan,
  splitResidualTopDown,
};
