// Tier configuration — extracted to its own module so both
// satelliteScheduler.js and allocationEngine.js can read it without a
// circular require (satelliteScheduler already depends on allocationEngine
// for auto-fill hooks).

const FREEROLL_SURCHARGE = 50; // added to every paid room's entry fee, funds the freeroll pool 100% (not touched by rake)
const FREEROLL_FUND_THRESHOLD = 3000; // once the surcharge fund crosses this, one freeroll ticket becomes available

const CATEGORIES = [
  { id: "weekly_qualifier", name: "Weekly Qualifier", icon: "🎟️", cadence: "weekly" },
  { id: "full_day", name: "Full Day", icon: "🔔", cadence: "daily", openHour: 9.5, lockHour: 16 },
  { id: "morning", name: "Morning", icon: "☀️", cadence: "daily", openHour: 9.5, lockHour: 13 },
  { id: "afternoon", name: "Afternoon", icon: "🔥", cadence: "daily", openHour: 13, lockHour: 16 },
];

// Base tier price is 100/300/750, then every paid room gets the flat +50
// freeroll surcharge on top — that surcharge funds the freeroll pool 100%,
// completely separate from the normal rake split (see satelliteScheduler.js resolveSatellite).
const BASE_PRICE_LEVELS = { low: 100, mid: 300, high: 750 };

// Named tiers instead of bare Low/Mid/High — reads as a career progression
// (Clerk -> Trader -> Jr. Stonkbroker -> ... -> Stonk Broker) matching the
// site's broader "earn your way up" story.
const PRICE_LEVEL_NAMES = { free: "Freeroll", low: "Clerk", mid: "Trader", high: "Jr. Stonkbroker" };

// Flatten into concrete tiers — Weekly Qualifier gets a 4th free level,
// dailies stay at the standard 3. Two fee fields matter here:
//   entryFee    = TOTAL charged to the user (base + surcharge) — what's shown/charged
//   poolFee     = BASE only — what's recorded as this room's own pool contribution,
//                 keeping the already-tested ladder math untouched. The surcharge
//                 never touches this room's own prize pool; it's siphoned
//                 entirely to the freeroll fund.
const TIERS = CATEGORIES.flatMap((cat) => {
  const levels = cat.id === "weekly_qualifier" ? ["free", "low", "mid", "high"] : ["low", "mid", "high"];
  return levels.map((level) => {
    const poolFee = level === "free" ? 0 : BASE_PRICE_LEVELS[level];
    const surcharge = level === "free" ? 0 : FREEROLL_SURCHARGE;
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
      maxEntriesPerAccount: level === "free" ? 1 : 10,
      cadence: cat.cadence,
      openHour: cat.openHour,
      lockHour: cat.lockHour,
    };
  });
});

module.exports = { CATEGORIES, BASE_PRICE_LEVELS, PRICE_LEVEL_NAMES, TIERS, FREEROLL_SURCHARGE, FREEROLL_FUND_THRESHOLD };
