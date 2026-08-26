const assert=require('assert');
const {TIER_RULES,economicsForEntry,computePaidContest,computeCascadingContest,computeFreerollPlan}=require('./payoutEngineV2');
const expected={runner:{price:100,contest:100,free:0,rake:15,prize:85},clerk:{price:200,contest:150,free:50,rake:22.5,prize:127.5},trader:{price:400,contest:350,free:50,rake:52.5,prize:297.5},junior:{price:1050,contest:1000,free:50,rake:150,prize:850}};
for(const [tier,e] of Object.entries(expected)){const x=economicsForEntry(tier);assert.equal(x.playerPrice,e.price);assert.equal(x.contestPortion,e.contest);assert.equal(x.freerollContribution,e.free);assert.equal(x.rake,e.rake);assert.equal(x.contestPrize,e.prize);}
for(const tier of Object.keys(TIER_RULES))for(const n of [1,2,3,5,10,20,100,1000]){const r=computeCascadingContest({tierKey:tier,fieldSize:n,poolUnallocatedStonk:12345});assert.equal(r.status,'OK');assert.equal(r.reconciliation.entry,true);assert.equal(r.reconciliation.prize,true);assert.equal(r.payouts.length,r.paidPlaces);assert.equal(r.payouts.some(p=>p.ticketTier==='main_event'||p.award==='main_event_ticket'),false);}
const runner=computePaidContest({tierKey:'runner',fieldSize:20,poolUnallocatedStonk:39000});assert.equal(runner.badgesAwarded,1);assert.equal(runner.badgeFundingContribution,1000);assert.equal(runner.stonkFallback,700);
const free=computeFreerollPlan({fieldSize:100,reserveBalance:45500});assert.equal(free.badgesAwarded,1);assert.equal(free.cashDistributed,5500);assert.equal(free.payouts.some(p=>p.quantity>0),false);
console.log('payoutEngineV2 tests passed');
