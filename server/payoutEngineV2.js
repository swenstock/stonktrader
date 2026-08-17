// SBC V45 payout engine
// Pure deterministic math. No DB writes, no wallet/custody side effects.
//
// Locked working economics:
//   Runner          100 STONK total, no freeroll contribution
//   Clerk           200 total = 150 contest portion + 50 freeroll reserve
//   Trader          400 total = 350 contest portion + 50 freeroll reserve
//   Jr Stonkbroker 1050 total = 1000 contest portion + 50 freeroll reserve
//
// Rake applies ONLY to the contest portion. The 50 STONK freeroll contribution
// is never raked and is routed to the Freeroll Prize Reserve.
//
// Paid contest payout order:
//   1) Top 10% are prize-paying positions.
//   2) Reserve baseline ticket awards for every paid position.
//   3) Starting at rank 1, upgrade finishers to a 3,000-STONK Main Event ticket
//      whenever the remaining prize economics can support the incremental cost.
//      The ME ticket REPLACES the baseline pair.
//   4) Remaining top-10% finishers receive their baseline pair.
//   5) Any true residual is distributed as published deterministic STONK bonuses.
//
// Freerolls are funded from the separate Freeroll Prize Reserve and use the
// same top-10% principle. This module calculates their required liability but
// never silently spends platform revenue to cover a shortfall.

const RAKE_RATE = 0.15;
const MAIN_EVENT_TICKET_BACKING = 3000;

const TIER_RULES = Object.freeze({
  runner: {
    name: "Runner",
    playerPrice: 100,
    contestPortion: 100,
    freerollContribution: 0,
    baseline: { ticketTier: "runner", quantity: 2, unitBacking: 100 },
  },
  clerk: {
    name: "Clerk",
    playerPrice: 200,
    contestPortion: 150,
    freerollContribution: 50,
    baseline: { ticketTier: "runner", quantity: 2, unitBacking: 100 },
  },
  trader: {
    name: "Trader",
    playerPrice: 400,
    contestPortion: 350,
    freerollContribution: 50,
    baseline: { ticketTier: "clerk", quantity: 2, unitBacking: 200 },
  },
  junior: {
    name: "Jr. Stonkbroker",
    playerPrice: 1050,
    contestPortion: 1000,
    freerollContribution: 50,
    baseline: { ticketTier: "trader", quantity: 2, unitBacking: 400 },
  },
});

function money(n) {
  // Keep half-STONK precision because 15% of 50/150/350 can produce .5.
  return Math.round((Number(n) + Number.EPSILON) * 2) / 2;
}

function paidPlacesFor(fieldSize) {
  if (!Number.isInteger(fieldSize) || fieldSize < 1) throw new Error("fieldSize must be a positive integer");
  return Math.max(1, Math.ceil(fieldSize * 0.10));
}

function baselineCost(rule) {
  return rule.baseline.quantity * rule.baseline.unitBacking;
}

function economicsForEntry(tierKey) {
  const rule = TIER_RULES[tierKey];
  if (!rule) throw new Error(`Unknown tier: ${tierKey}`);
  const rake = money(rule.contestPortion * RAKE_RATE);
  const contestPrize = money(rule.contestPortion - rake);
  return {
    ...rule,
    rake,
    contestPrize,
    totalPrizeDirected: money(contestPrize + rule.freerollContribution),
  };
}

function splitResidualTopDown(totalResidual, paidPlaces) {
  // Published deterministic default: weighted top-down 1..N in reverse rank.
  // Rank 1 gets N shares, rank 2 gets N-1 ... last paid place gets 1 share.
  // This is deliberately isolated so the published bonus formula can be changed
  // later without touching any other contest math.
  totalResidual = money(totalResidual);
  if (totalResidual <= 0 || paidPlaces <= 0) return Array(paidPlaces).fill(0);

  const weights = Array.from({ length: paidPlaces }, (_, i) => paidPlaces - i);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let remaining = totalResidual;
  const bonuses = weights.map((w, i) => {
    if (i === paidPlaces - 1) return money(remaining);
    const share = money((totalResidual * w) / totalWeight);
    remaining = money(remaining - share);
    return share;
  });
  return bonuses;
}

function computePaidContest({ tierKey, fieldSize }) {
  const econ = economicsForEntry(tierKey);
  const paidPlaces = paidPlacesFor(fieldSize);

  const grossCharged = money(econ.playerPrice * fieldSize);
  const contestHandle = money(econ.contestPortion * fieldSize);
  const freerollReserveContribution = money(econ.freerollContribution * fieldSize);
  const rake = money(econ.rake * fieldSize);
  const contestPrizePool = money(econ.contestPrize * fieldSize);

  const baseEach = baselineCost(econ);
  const baselineLiability = money(baseEach * paidPlaces);

  if (baselineLiability > contestPrizePool) {
    return {
      status: "UNDERFUNDED_BASELINE",
      tierKey,
      fieldSize,
      paidPlaces,
      grossCharged,
      contestHandle,
      freerollReserveContribution,
      rake,
      contestPrizePool,
      baselineLiability,
      shortfall: money(baselineLiability - contestPrizePool),
      payouts: [],
      reconciliation: money(rake + contestPrizePool + freerollReserveContribution) === grossCharged,
    };
  }

  // Everyone gets a baseline reservation first.
  let availableForUpgrades = money(contestPrizePool - baselineLiability);
  const upgradeIncrement = money(MAIN_EVENT_TICKET_BACKING - baseEach);
  const maxUpgradesByPlaces = paidPlaces;
  const mainEventTickets = upgradeIncrement <= 0
    ? maxUpgradesByPlaces
    : Math.min(maxUpgradesByPlaces, Math.floor(availableForUpgrades / upgradeIncrement));

  availableForUpgrades = money(availableForUpgrades - mainEventTickets * Math.max(0, upgradeIncrement));

  const bonuses = splitResidualTopDown(availableForUpgrades, paidPlaces);
  const payouts = Array.from({ length: paidPlaces }, (_, i) => {
    const rank = i + 1;
    if (rank <= mainEventTickets) {
      return {
        rank,
        award: "main_event_ticket",
        ticketTier: "main_event",
        quantity: 1,
        liabilityBacking: MAIN_EVENT_TICKET_BACKING,
        stonkBonus: bonuses[i],
      };
    }
    return {
      rank,
      award: "baseline_tickets",
      ticketTier: econ.baseline.ticketTier,
      quantity: econ.baseline.quantity,
      liabilityBacking: baseEach,
      stonkBonus: bonuses[i],
    };
  });

  const mainEventReserve = money(mainEventTickets * MAIN_EVENT_TICKET_BACKING);
  const lowerTierTicketLiability = money((paidPlaces - mainEventTickets) * baseEach);
  const residualBonuses = money(bonuses.reduce((a, b) => a + b, 0));
  const totalPrizeAllocated = money(mainEventReserve + lowerTierTicketLiability + residualBonuses);

  return {
    status: "OK",
    tierKey,
    tierName: econ.name,
    fieldSize,
    paidPlaces,
    grossCharged,
    contestHandle,
    freerollReserveContribution,
    rake,
    contestPrizePool,
    baselineLiability,
    mainEventTickets,
    mainEventReserve,
    lowerTierTicketLiability,
    residualBonuses,
    totalPrizeAllocated,
    payouts,
    reconciliation: {
      entry: money(rake + contestPrizePool + freerollReserveContribution) === grossCharged,
      prize: totalPrizeAllocated === contestPrizePool,
    },
  };
}

function computeFreerollRequirement({ fieldSize, runnerTicketBacking = 100 }) {
  const paidPlaces = paidPlacesFor(fieldSize);
  const ticketsRequired = paidPlaces * 2;
  const liabilityRequired = money(ticketsRequired * runnerTicketBacking);
  return {
    fieldSize,
    paidPlaces,
    ticketTier: "runner",
    ticketsPerWinner: 2,
    ticketsRequired,
    liabilityRequired,
  };
}

module.exports = {
  RAKE_RATE,
  MAIN_EVENT_TICKET_BACKING,
  TIER_RULES,
  paidPlacesFor,
  economicsForEntry,
  computePaidContest,
  computeFreerollRequirement,
  splitResidualTopDown,
};
