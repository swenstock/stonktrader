// Tier configuration — extracted to its own module so both
// satelliteScheduler.js and allocationEngine.js can read it without a
// circular require (satelliteScheduler already depends on allocationEngine
// for auto-fill hooks).

const FREEROLL_SURCHARGE = 50; // added to every paid room's entry fee, funds THAT CATEGORY's own freeroll prize pool 100% (not touched by rake)

const CATEGORIES = [
  { id: "weekly_qualifier", name: "Weekly Qualifier", icon: "🎟️", cadence: "weekly" },
  { id: "full_day", name: "Full Day", icon: "🔔", cadence: "daily", openHour: 9.5, lockHour: 16 },
  { id: "morning", name: "Morning", icon: "☀️", cadence: "daily", openHour: 9.5, lockHour: 13 },
  { id: "afternoon", name: "Afternoon", icon: "🔥", cadence: "daily", openHour: 13, lockHour: 16 },
  { id: "hourly", name: "Degen Hours", icon: "⚡", cadence: "hourly" }, // internal id stays "hourly" — it's a foreign key across satellites/pending_allocations/freeroll_fund, renaming it would mean migrating real data for zero user-facing benefit
  // Once a day, the last 30 minutes of the trading session — deliberately
  // NOT a 7th Degen Hours slot (see satelliteScheduler.js degenHoursWindow).
  // No freeroll level of its own — see levels: below. Every entry here is
  // either a direct paid buy-in, or a free ticket won from a Degen Hours
  // freeroll earlier that same day (see FREEROLL_PRIZE_CONFIG.hourly's
  // redirect, in satelliteScheduler.js resolveSatellite).
  { id: "race_to_close", name: "Degen Race to the Close", icon: "🏁", cadence: "daily", openHour: 15.5, lockHour: 16, levels: ["runner", "low", "mid", "high"] },
];

// Base tier price is 100/300/750, then every paid room gets the flat +50
// freeroll surcharge on top — that surcharge funds THAT CATEGORY's own
// freeroll prize pool 100%, completely separate from the normal rake split
// (see satelliteScheduler.js resolveSatellite).
const BASE_PRICE_LEVELS = { low: 100, mid: 300, high: 750 };

// Runner sits below Clerk — genuine old Wall Street term for the entry-level
// job running orders around a trading floor. ~$1 USD at current STONK
// price. No freeroll surcharge here (unlike low/mid/high) — the surcharge
// alone already exceeds a $1 entry, so Runner is a standalone cheap tier
// that doesn't feed any freeroll fund itself (though it's the PRIZE every
// non-weekly freeroll pays out — see FREEROLL_PRIZE_CONFIG below).
const RUNNER_PRICE = 30;

// Every category's freeroll pays out a different prize, funded from a
// separate pool per category (not one shared pool — see db.js
// freeroll_fund, now keyed by category instead of a single row):
//   weekly_qualifier -> a Main Event ticket (3,000 STONK equivalent)
//   everything else  -> a free Runner-tier entry in THAT SAME category
// The threshold is set to match what the prize actually costs, so the
// funding rate scales sensibly with each category's own cadence and prize
// size instead of one-size-fits-all.
const FREEROLL_PRIZE_CONFIG = {
  weekly_qualifier: { prizeType: "main_event_ticket", threshold: 3000 },
  full_day: { prizeType: "runner_entry", threshold: RUNNER_PRICE },
  morning: { prizeType: "runner_entry", threshold: RUNNER_PRICE },
  afternoon: { prizeType: "runner_entry", threshold: RUNNER_PRICE },
  hourly: { prizeType: "runner_entry", threshold: RUNNER_PRICE },
};

// Named tiers instead of bare Low/Mid/High — reads as a career progression
// (Runner -> Clerk -> Trader -> Jr. Stonkbroker -> ... -> Stonk Broker)
// matching the site's broader "earn your way up" story.
const PRICE_LEVEL_NAMES = { free: "Freeroll", runner: "Runner", low: "Clerk", mid: "Trader", high: "Jr. Stonkbroker" };

// Flatten into concrete tiers — EVERY category now gets a free level (not
// just Weekly). Two fee fields matter here:
//   entryFee    = TOTAL charged to the user (base + surcharge) — what's shown/charged
//   poolFee     = BASE only — what's recorded as this room's own pool contribution,
//                 keeping the already-tested ladder math untouched. The surcharge
//                 never touches this room's own prize pool; it's siphoned
//                 entirely to that category's own freeroll fund.
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
      maxEntriesPerAccount: level === "free" ? 1 : cat.id === "hourly" ? null : 10, // null = genuinely unlimited — Degen Hours paid levels only, per its own no-holds-barred rules
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
