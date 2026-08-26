const express = require('express');
const router = express.Router();
const { CATEGORIES, TIERS, PRICE_LEVEL_NAMES } = require('../tierConfig');
const { TIER_RULES, BADGE_FUNDING_UNIT, RAKE_RATE } = require('../payoutEngineV2');
const { TICKET_BURN_CONFIG } = require('../ticketBurnV45');
const { currentStonkUsdPriceMicros } = require('../contestScheduler');
const dataProvider = require('../dataProvider');

router.get('/', (req, res) => {
  const stonkUsdPrice = currentStonkUsdPriceMicros() / 1e6;
  const byLevel = {};
  for (const tier of TIERS) {
    if (!byLevel[tier.priceLevel]) byLevel[tier.priceLevel] = {
      key:tier.priceLevel,name:tier.priceLevelName,playerPrice:tier.entryFee,
      playerPriceUsd:Number((tier.entryFee*stonkUsdPrice).toFixed(2)),contestPortion:tier.poolFee,freerollContribution:tier.surcharge,
    };
  }
  res.json({
    product:'Stonk Broker Challenge',marketDataSource:dataProvider.source||'unknown',startingPaperCash:100000,
    maxStandardPositionPct:10,maxEntriesPerContest:10,rakeRate:RAKE_RATE,stonkUsdPrice,
    badgeFundingUnit:BADGE_FUNDING_UNIT,badgesPerActivatedBroker:20,
    tiers:{freeroll:{name:PRICE_LEVEL_NAMES.free,playerPrice:0,playerPriceUsd:0},runner:byLevel.runner,clerk:byLevel.low,trader:byLevel.mid,junior:byLevel.high},
    fallbackPayouts:{
      freeroll:{type:'local_stonk_after_badges',topTenGuaranteed:false},
      runner:{type:'stonk'},
      clerk:TIER_RULES.clerk.fallback,
      trader:TIER_RULES.trader.fallback,
      junior:TIER_RULES.junior.fallback,
    },
    ticketTypes:['junior','trader','clerk','runner'],ticketBurnUpgrades:TICKET_BURN_CONFIG,categories:CATEGORIES,
  });
});
module.exports=router;
