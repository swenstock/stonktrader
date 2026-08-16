// Tier configuration — shared by schedulers, allocation and payout code.
// V45 rebuild economics:
//   Runner          100 STONK total
//   Clerk           200 total = 150 contest portion + 50 freeroll reserve
//   Trader          400 total = 350 contest portion + 50 freeroll reserve
//   Jr. Stonkbroker 1050 total = 1000 contest portion + 50 freeroll reserve
//
// The 50 STONK contribution is NOT rake and does NOT belong to the current
// paid contest. It funds freeroll acquisition economics. Runner is exempt.

const FREEROLL_SURCHARGE = 50;

const CATEGORIES = [
  { id: "weekly_qualifier", name: "Weekly Qualifier", icon: "🎟️", cadence: "weekly" },
  { id: "full_day", name: "Full Day", icon: "🔔", cadence: "daily", openHour: 9.5, lockHour: 16 },
  { id: "morning", name: "Morning", icon: "☀️", cadence: "daily", openHour: 9.5, lockHour: 13 },
  { id: "afternoon", name: "Afternoon", icon: "🔥", cadence: "daily", openHour: 13, lockHour: 16 },
  { id: "hourly", name: "Degen Hours", icon: "⚡", cadence: "hourly" },
  { id: "race_to_close", name: "Degen Race to the Close", icon: "🏁", cadence: "daily", openHour: 15.5, lockHour: 16, levels: ["runner", "low", "mid", "high"] },
];

const BASE_PRICE_LEVELS = { low: 150, mid: 350, high: 1000 };
const RUNNER_PRICE = 100;

// Legacy threshold config remains only so pre-V45 code paths do not crash
// while the new resolver is being introduced behind a flag. V45 itself
// treats freeroll funding as actual STONK, not a count of prize units.
const FREEROLL_PRIZE_CONFIG = {
  weekly_qualifier: { prizeType: "main_event_ticket", threshold: 3000 },
  full_day: { prizeType: "runner_entry", threshold: RUNNER_PRICE },
  morning: { prizeType: "runner_entry", threshold: RUNNER_PRICE },
  afternoon: { prizeType: "runner_entry", threshold: RUNNER_PRICE },
  hourly: { prizeType: "runner_entry", threshold: RUNNER_PRICE },
  // Race has no freeroll of its own, but paid Race tiers still carry the
  // protected 50 under the universal tier price ladder. This legacy entry
  // prevents the old accumulator path from crashing; V45 groups Race with
  // the Degen acquisition pool when it actually spends freeroll reserves.
  race_to_close: { prizeType: "runner_entry", threshold: RUNNER_PRICE },
};

// V45 reserve-pool grouping. Degen Hours + Race to Close are one acquisition
// ecosystem; Race has no free room, so its protected contributions support
// the Degen freeroll pool rather than becoming stranded money.
const FREEROLL_RESERVE_POOL = Object.freeze({
  weekly_qualifier: "weekly_qualifier",
  full_day: "full_day",
  morning: "morning",
  afternoon: "afternoon",
  hourly: "degen",
  race_to_close: "degen",
});

const PRICE_LEVEL_NAMES = {
  free: "Freeroll",
  runner: "Runner",
  low: "Clerk",
  mid: "Trader",
  high: "Jr. Stonkbroker",
};

const TIERS = CATEGORIES.flatMap((cat) => {
  const levels = cat.levels || ["free", "runner", "low", "mid", "high"];
  return levels.map((level) => {
    const poolFee = level === "free" ? 0 : level === "runner" ? RUNNER_PRICE : BASE_PRICE_LEVELS[level];
    const surcharge = level === "free" || level === "runner" ? 0 : FREEROLL_SURCHARGE;
    return {
      id: `${cat.id}_${level}`,
      categoryId: cat.id,
      categoryName: cat.name,
      icon: cat.icon,
      priceLevel: level,
      priceLevelName: PRICE_LEVEL_NAMES[level],
      name: `${cat.name} — ${PRICE_LEVEL_NAMES[level]}`,
      entryFee: poolFee + surcharge,
      poolFee,
      surcharge,
      freerollReservePool: FREEROLL_RESERVE_POOL[cat.id],
      maxEntriesPerAccount: level === "free" ? 1 : cat.id === "hourly" ? null : 10,
      cadence: cat.cadence,
      openHour: cat.openHour,
      lockHour: cat.lockHour,
    };
  });
});

module.exports = {
  CATEGORIES,
  BASE_PRICE_LEVELS,
  RUNNER_PRICE,
  PRICE_LEVEL_NAMES,
  TIERS,
  FREEROLL_SURCHARGE,
  FREEROLL_PRIZE_CONFIG,
  FREEROLL_RESERVE_POOL,
};
