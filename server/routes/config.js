const express = require('express');
const router = express.Router();
const { CATEGORIES, TIERS, PRICE_LEVEL_NAMES } = require('../tierConfig');
const { TIER_RULES, MAIN_EVENT_TICKET_BACKING, RAKE_RATE } = require('../payoutEngineV2');
const { currentStonkUsdPriceMicros } = require('../contestScheduler');
const dataProvider = require('../dataProvider');

router.get('/', (req, res) => {
  const stonkUsdPrice = currentStonkUsdPriceMicros() / 1e6;
  const byLevel = {};
  for (const tier of TIERS) {
    if (!byLevel[tier.priceLevel]) {
      byLevel[tier.priceLevel] = {
        key: tier.priceLevel,
        name: tier.priceLevelName,
        playerPrice: tier.entryFee,
        playerPriceUsd: Number((tier.entryFee * stonkUsdPrice).toFixed(2)),
        contestPortion: tier.poolFee,
        freerollContribution: tier.surcharge,
      };
    }
  }

  res.json({
    product: 'Stonk Broker Challenge',
    marketDataSource: dataProvider.source || 'unknown',
    startingPaperCash: 100000,
    maxStandardPositionPct: 10,
    maxEntriesPerContest: 10,
    rakeRate: RAKE_RATE,
    stonkUsdPrice,
    mainEventTicketBacking: MAIN_EVENT_TICKET_BACKING,
    mainEventReserveTarget: 733332,
    tiers: {
      freeroll: { name: PRICE_LEVEL_NAMES.free, playerPrice: 0, playerPriceUsd: 0 },
      runner: byLevel.runner,
      clerk: byLevel.low,
      trader: byLevel.mid,
      junior: byLevel.high,
    },
    baselinePayouts: {
      freeroll: { ticketType: 'runner', quantity: 2 },
      runner: TIER_RULES.runner.baseline,
      clerk: TIER_RULES.clerk.baseline,
      trader: TIER_RULES.trader.baseline,
      junior: TIER_RULES.junior.baseline,
    },
    ticketTypes: ['main_event','junior','trader','clerk','runner'],
    categories: CATEGORIES,
  });
});

module.exports = router;
