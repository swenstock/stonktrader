// Tier configuration — shared by schedulers, allocation and payout code.
// V45 rebuild economics:
//   Runner          100 STONK total
//   Clerk           200 total = 150 contest portion + 50 freeroll reserve
//   Trader          400 total = 350 contest portion + 50 freeroll reserve
//   Jr. Stonkbroker 1050 total = 1000 contest portion + 50 freeroll reserve
//
// The 50 STONK contribution is NOT rake and does NOT belong to the current
// paid contest. It funds that category's Freeroll Prize Reserve. Runner is
// deliberately exempt from the +50 contribution.

const FREEROLL_SURCHARGE = 50;

const CATEGORIES = [
  { id: "weekly_qualifier", name: "Weekly Qualifier", icon: "🎟️", cadence: "weekly" },
  { id: "full_day", name: "Full Day", icon: "🔔", cadence: "daily", openHour: 9.5, lockHour: 16 },
  { id: "morning", name: "Morning", icon: "☀️", cadence: "daily", openHour: 9.5, lockHour: 13 },
  { id: "afternoon", name: "Afternoon", icon: "🔥", cadence: "daily", openHour: 13, lockHour: 16 },
  { id: "hourly", name: "Degen Hours", icon: "⚡", cadence: "hourly" },
  { id: "race_to_close", name: "Degen Race to the Close", icon: "🏁", cadence: "daily", openHour: 15.5, lockHour: 16, levels: ["runner", "low", "mid", "high"] },
];

// These are the portions that enter the paid contest's own economics BEFORE
// rake. Clerk/Trader/Jr then add the protected 50-STONK freeroll contribution.
const BASE_PRICE_LEVELS = { low: 150, mid: 350, high: 1000 };
const RUNNER_PRICE = 100;

// Freerolls are reserve-backed acquisition contests. The existing database
// keeps reserves by category. The V45 payout resolver will calculate the full
// top-10% liability before opening/guaranteeing a freeroll; these thresholds
// remain useful as the backing unit for one prize entitlement.
const FREEROLL_PRIZE_CONFIG = {
  weekly_qualifier: { prizeType: "main_event_ticket", threshold: 3000 },
  full_day: { prizeType: "runner_entry", threshold: RUNNER_PRICE },
  morning: { prizeType: "runner_entry", threshold: RUNNER_PRICE },
  afternoon: { prizeType: "runner_entry", threshold: RUNNER_PRICE },
  hourly: { prizeType: "runner_entry", threshold: RUNNER_PRICE },
};

const PRICE_LEVEL_NAMES = {
  free: "Freeroll",
  runner: "Runner",
  low: "Clerk",
  mid: "Trader",
  high: "Jr. Stonkbroker",
};

// entryFee = total amount charged to a paid player.
// poolFee  = amount entering that contest before rake.
// surcharge = protected freeroll-reserve contribution; never raked.
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
};
