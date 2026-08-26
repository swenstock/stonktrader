'use strict';
const assert = require('assert');
const {
  computePaidContest,
  computeFreerollPlan,
  TIER_RULES,
  BADGE_FUNDING_UNIT,
} = require('./payoutEngineV2');

assert.strictEqual(BADGE_FUNDING_UNIT,40000);
assert.strictEqual(TIER_RULES.runner.fallback.kind,'stonk');
assert.strictEqual(TIER_RULES.clerk.fallback.ticketTier,'runner');
assert.strictEqual(TIER_RULES.trader.fallback.ticketTier,'clerk');
assert.strictEqual(TIER_RULES.junior.fallback.ticketTier,'trader');

// Claude's audit target: 39K carry + 20 Runner entries => exactly 1K from
// this contest completes rank 1's Badge, leaving exactly 700 STONK for rank 2.
const runner = computePaidContest({tierKey:'runner',fieldSize:20,poolUnallocatedStonk:39000});
assert.strictEqual(runner.contestPrizePool,1700);
assert.strictEqual(runner.paidPlaces,2);
assert.strictEqual(runner.badgesAwarded,1);
assert.strictEqual(runner.payouts[0].award,'jr_broker_badge');
assert.strictEqual(runner.payouts[0].badgeFundingContribution,1000);
assert.strictEqual(runner.payouts[1].award,'stonk_fallback');
assert.strictEqual(runner.payouts[1].stonkBonus,700);
assert.deepStrictEqual(runner.reconciliation,{entry:true,prize:true});
assert.strictEqual(runner.payouts.some(p=>String(p.award).includes('main_event')||p.ticketTier==='main_event'),false);

const clerk = computePaidContest({tierKey:'clerk',fieldSize:20,poolUnallocatedStonk:39900});
assert.strictEqual(clerk.badgesAwarded,1);
assert.strictEqual(clerk.payouts[0].badgeFundingContribution,100);
assert.strictEqual(clerk.payouts[1].ticketTier,'runner');
assert.strictEqual(clerk.payouts[1].quantity,2);
assert.strictEqual(clerk.payouts[1].stonkBonus,0);
assert.strictEqual(clerk.reconciliation.prize,true);

const trader = computePaidContest({tierKey:'trader',fieldSize:20,poolUnallocatedStonk:0});
assert.strictEqual(trader.badgesAwarded,0);
assert.strictEqual(trader.payouts.every(p=>p.ticketTier==='clerk'&&p.quantity===2),true);
assert.strictEqual(trader.stonkFallback,0);
assert.strictEqual(trader.reconciliation.prize,true);

const junior = computePaidContest({tierKey:'junior',fieldSize:100,poolUnallocatedStonk:39000});
assert(junior.badgesAwarded>=1);
const firstFallback=junior.payouts.find(p=>p.award==='fallback_tickets');
assert(firstFallback && firstFallback.ticketTier==='trader' && firstFallback.quantity===2);
assert.strictEqual(junior.reconciliation.prize,true);

const free = computeFreerollPlan({fieldSize:100,reserveBalance:45500});
assert.strictEqual(free.badgesAwarded,1);
assert.strictEqual(free.badgeSpend,40000);
assert.strictEqual(free.cashDistributed,5500);
assert.strictEqual(free.reserveRemainder,0);
assert.strictEqual(free.payouts.some(p=>p.ticketTier),false);

console.log('Corporate Ladder Prize Consolidation math: PASS');
console.log('Runner carry:', '39,000 carry + 1,000 contest -> Badge; 700 STONK fallback');
console.log('Free Roll:', '45,500 local reserve -> 1 Badge + 5,500 STONK; zero tickets');
console.log('Main Event:', 'zero award target in corporate-ladder planner');
