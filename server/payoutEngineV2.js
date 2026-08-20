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

const { computeLadder } = require("./prizeLadder");

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
  totalResidual = money(totalResidual);
  if (totalResidual <= 0 || paidPlaces <= 0) return Array(paidPlaces).fill(0);
  const weights = Array.from({ length: paidPlaces }, (_, i) => paidPlaces - i);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let remaining = totalResidual;
  const bonuses = weights.map((w, i) => {
    if (i === paidPlaces - 1) return money(Math.max(0, remaining));
    const roundedShare = money((totalResidual * w) / totalWeight);
    const share = money(Math.min(Math.max(0, remaining), Math.max(0, roundedShare)));
    remaining = money(Math.max(0, remaining - share));
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
      return { rank, award: "main_event_ticket", ticketTier: "main_event", quantity: 1, liabilityBacking: MAIN_EVENT_TICKET_BACKING, stonkBonus: bonuses[i] };
    }
    return { rank, award: "baseline_tickets", ticketTier: econ.baseline.ticketTier, quantity: econ.baseline.quantity, liabilityBacking: baseEach, stonkBonus: bonuses[i] };
  });

  const mainEventReserve = money(mainEventTickets * MAIN_EVENT_TICKET_BACKING);
  const lowerTierTicketLiability = money((paidPlaces - mainEventTickets) * baseEach);
  const residualBonuses = money(bonuses.reduce((a, b) => a + b, 0));
  const totalPrizeAllocated = money(mainEventReserve + lowerTierTicketLiability + residualBonuses);

  return {
    status: "OK", tierKey, tierName: econ.name, fieldSize, paidPlaces, grossCharged, contestHandle,
    freerollReserveContribution, rake, contestPrizePool, baselineLiability, mainEventTickets,
    mainEventReserve, lowerTierTicketLiability, residualBonuses, totalPrizeAllocated, payouts,
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
  return { fieldSize, paidPlaces, ticketTier: "runner", ticketsPerWinner: 2, ticketsRequired, liabilityRequired };
}

// Graceful degradation for a paid room whose net prize pool cannot cover its
// normal baseline ticket promise. Healthy rooms pass through unchanged.
// Thin rooms cascade down the existing ticket ladder, funding only full,
// honestly-backed ticket pairs. If even the Runner floor cannot be funded,
// the remaining prize economics are paid as STONK cash prizes to the paid
// places using the same deterministic top-down residual weighting.
function computeCascadingContest({ tierKey, fieldSize }) {
  const direct = computePaidContest({ tierKey, fieldSize });
  if (direct.status !== "UNDERFUNDED_BASELINE") return direct;

  const econ = economicsForEntry(tierKey);
  const paidPlaces = direct.paidPlaces;
  const contestPrizePool = direct.contestPrizePool;
  const payouts = [];
  let pool = contestPrizePool;
  let rank = 1;
  let cascadeTierKey = tierKey;

  while (rank <= paidPlaces) {
    const level = TIER_RULES[cascadeTierKey].baseline;
    const unitCost = level.quantity * level.unitBacking;
    const placesLeft = paidPlaces - rank + 1;
    const { unitsFunded } = computeLadder(pool, unitCost);
    const funded = Math.min(unitsFunded, placesLeft);

    for (let i = 0; i < funded; i++) {
      payouts.push({
        rank: rank + i,
        award: "tier_ticket",
        ticketTier: level.ticketTier,
        quantity: level.quantity,
        liabilityBacking: unitCost,
        stonkBonus: 0,
      });
    }
    pool = money(pool - funded * unitCost);
    rank += funded;

    if (level.ticketTier === "runner") break;
    cascadeTierKey = level.ticketTier;
  }

  for (; rank <= paidPlaces; rank++) {
    payouts.push({ rank, award: "cash_prize", ticketTier: null, quantity: 0, liabilityBacking: 0, stonkBonus: 0 });
  }

  const totalTicketLiability = money(payouts.reduce((a, p) => a + p.liabilityBacking, 0));
  const finalLeftover = money(contestPrizePool - totalTicketLiability);
  const shares = splitResidualTopDown(finalLeftover, paidPlaces);
  payouts.forEach((p, i) => {
    p.stonkBonus = shares[i];
    p.isCashPrize = p.quantity === 0;
  });

  const totalStonkBonus = money(payouts.reduce((a, p) => a + p.stonkBonus, 0));

  return {
    status: "OK",
    degraded: true,
    tierKey,
    tierName: econ.name,
    fieldSize,
    paidPlaces,
    grossCharged: direct.grossCharged,
    contestHandle: direct.contestHandle,
    freerollReserveContribution: direct.freerollReserveContribution,
    rake: direct.rake,
    contestPrizePool,
    baselineLiability: direct.baselineLiability,
    mainEventTickets: 0,
    mainEventReserve: 0,
    lowerTierTicketLiability: totalTicketLiability,
    residualBonuses: totalStonkBonus,
    totalPrizeAllocated: money(totalTicketLiability + totalStonkBonus),
    ticketsFunded: payouts.filter((p) => p.quantity > 0).length,
    cashPrizePlaces: payouts.filter((p) => p.isCashPrize).length,
    payouts,
    reconciliation: {
      entry: money(direct.rake + contestPrizePool + direct.freerollReserveContribution) === direct.grossCharged,
      prize: money(totalTicketLiability + totalStonkBonus) === contestPrizePool,
    },
  };
}

module.exports = {
  RAKE_RATE,
  MAIN_EVENT_TICKET_BACKING,
  TIER_RULES,
  paidPlacesFor,
  economicsForEntry,
  computePaidContest,
  computeCascadingContest,
  computeFreerollRequirement,
  splitResidualTopDown,
};
