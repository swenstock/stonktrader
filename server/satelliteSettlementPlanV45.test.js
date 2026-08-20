const assert = require('assert');
const { minimumFieldForTier, planPaidSatellite, planFreeroll } = require('./satelliteSettlementPlanV45');

function ranked(n) {
  return Array.from({length:n},(_,i)=>({accountId:i+1,entryId:1000+i,pl:100-i}));
}

assert.equal(minimumFieldForTier('runner'), 3);
assert.equal(minimumFieldForTier('clerk'), 2);
assert.equal(minimumFieldForTier('trader'), 2);
assert.equal(minimumFieldForTier('junior'), 1);

const tinyRunner = planPaidSatellite({priceLevel:'runner',ranked:ranked(2)});
assert.equal(tinyRunner.status,'OK');
assert.equal(tinyRunner.math.degraded,true);
assert.equal(tinyRunner.awards.length,1);
assert.equal(tinyRunner.awards[0].ticketQuantity,0);
assert.equal(tinyRunner.awards[0].isCashPrize,true);
assert.equal(tinyRunner.awards[0].stonkBonus,170);

const soloTrader = planPaidSatellite({priceLevel:'mid',ranked:ranked(1)});
assert.equal(soloTrader.status,'OK');
assert.equal(soloTrader.math.degraded,true);
assert.equal(soloTrader.awards.length,1);
assert.equal(soloTrader.awards[0].ticketType,'runner');
assert.equal(soloTrader.awards[0].ticketQuantity,2);
assert.equal(soloTrader.awards[0].isCashPrize,false);
assert.equal(soloTrader.awards[0].stonkBonus,97.5);
assert.equal(soloTrader.math.reconciliation.prize,true);

const trader100 = planPaidSatellite({priceLevel:'mid',ranked:ranked(100)});
assert.equal(trader100.status,'OK');
assert.equal(trader100.math.paidPlaces,10);
assert.equal(trader100.awards.length,10);
assert.equal(trader100.math.reconciliation.entry,true);
assert.equal(trader100.math.reconciliation.prize,true);
for (const a of trader100.awards) {
  assert(a.ticketQuantity >= 1);
  assert(a.totalTicketBacking > 0);
  assert(a.stonkBonus >= 0);
}

const free1000Low = planFreeroll({ranked:ranked(1000),reserveBalance:19999});
assert.equal(free1000Low.status,'FREEROLL_RESERVE_UNDERFUNDED');
assert.equal(free1000Low.required,20000);
assert.equal(free1000Low.awards.length,0);

const free1000 = planFreeroll({ranked:ranked(1000),reserveBalance:25000});
assert.equal(free1000.status,'OK');
assert.equal(free1000.requirement.paidPlaces,100);
assert.equal(free1000.awards.length,100);
assert.equal(free1000.reserveSpend,20000);
assert(free1000.awards.every(a=>a.ticketType==='runner' && a.ticketQuantity===2));

console.log('satelliteSettlementPlanV45 tests passed');
