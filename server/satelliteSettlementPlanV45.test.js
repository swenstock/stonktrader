const assert=require('assert');
const {planPaidSatellite,planFreeroll}=require('./satelliteSettlementPlanV45');
const ranked=n=>Array.from({length:n},(_,i)=>({accountId:i+1,entryId:1000+i,pl:100-i}));

const runner=planPaidSatellite({priceLevel:'runner',ranked:ranked(20),poolUnallocatedStonk:39000});
assert.equal(runner.math.paidPlaces,2);
assert.equal(runner.awards[0].award,'jr_broker_badge');
assert.equal(runner.awards[0].badgeFundingContribution,1000);
assert.equal(runner.awards[1].isCashPrize,true);
assert.equal(runner.awards[1].stonkBonus,700);
assert.equal(runner.math.reconciliation.prize,true);

const clerk=planPaidSatellite({priceLevel:'low',ranked:ranked(20),poolUnallocatedStonk:39900});
assert.equal(clerk.awards[0].badgeQuantity,1);
assert.equal(clerk.awards[1].ticketType,'runner');
assert.equal(clerk.awards[1].ticketQuantity,2);

const trader=planPaidSatellite({priceLevel:'mid',ranked:ranked(20)});
assert.equal(trader.awards.every(a=>a.ticketType==='clerk'&&a.ticketQuantity===2),true);
assert.equal(trader.math.reconciliation.prize,true);

const free=planFreeroll({ranked:ranked(100),reserveBalance:45500});
assert.equal(free.math.badgesAwarded,1);
assert.equal(free.math.badgeSpend,40000);
assert.equal(free.math.cashDistributed,0);
assert.equal(free.math.reserveRemainder,5500);
assert.equal(free.awards.some(a=>a.ticketQuantity>0),false);

console.log('satelliteSettlementPlanV45 tests passed');
