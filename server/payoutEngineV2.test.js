const assert = require('assert');
const {
  TIER_RULES,
  economicsForEntry,
  computePaidContest,
  computeCascadingContest,
  computeFreerollRequirement,
} = require('./payoutEngineV2');

function approxEqual(a, b) { return Math.abs(a - b) < 1e-9; }

const expected = {
  runner: { price: 100, contest: 100, freeroll: 0, rake: 15, contestPrize: 85 },
  clerk: { price: 200, contest: 150, freeroll: 50, rake: 22.5, contestPrize: 127.5 },
  trader: { price: 400, contest: 350, freeroll: 50, rake: 52.5, contestPrize: 297.5 },
  junior: { price: 1050, contest: 1000, freeroll: 50, rake: 150, contestPrize: 850 },
};

for (const [tier, e] of Object.entries(expected)) {
  const x = economicsForEntry(tier);
  assert.equal(x.playerPrice, e.price, `${tier} price`);
  assert.equal(x.contestPortion, e.contest, `${tier} contest portion`);
  assert.equal(x.freerollContribution, e.freeroll, `${tier} freeroll contribution`);
  assert.equal(x.rake, e.rake, `${tier} rake`);
  assert.equal(x.contestPrize, e.contestPrize, `${tier} contest prize`);
  assert(approxEqual(x.rake + x.contestPrize, x.contestPortion), `${tier} contest portion reconciles`);
  assert(approxEqual(x.rake + x.contestPrize + x.freerollContribution, x.playerPrice), `${tier} full entry reconciles`);
}

for (const tier of Object.keys(TIER_RULES)) {
  for (const fieldSize of [1,2,3,5,10,11,25,50,100,250,1000,5000,10000]) {
    const r = computePaidContest({ tierKey: tier, fieldSize });
    assert(r.reconciliation, `${tier}/${fieldSize} has reconciliation info`);
    if (r.status === 'OK') {
      assert.equal(r.reconciliation.entry, true, `${tier}/${fieldSize} entry reconciliation`);
      assert.equal(r.reconciliation.prize, true, `${tier}/${fieldSize} prize reconciliation`);
      assert.equal(r.payouts.length, r.paidPlaces, `${tier}/${fieldSize} pays every prize place`);
      assert(r.mainEventTickets <= r.paidPlaces, `${tier}/${fieldSize} no excess ME upgrades`);
    } else {
      assert.equal(r.status, 'UNDERFUNDED_BASELINE');
      assert(r.shortfall > 0, `${tier}/${fieldSize} real baseline shortfall`);
    }
  }
}

assert.deepEqual(
  computeFreerollRequirement({ fieldSize: 1000 }),
  { fieldSize: 1000, paidPlaces: 100, ticketTier: 'runner', ticketsPerWinner: 2, ticketsRequired: 200, liabilityRequired: 20000 }
);

// The cascading planner must resolve every live tier/field-size combination
// while reconciling every STONK exactly.
for (const tier of Object.keys(TIER_RULES)) {
  for (let fieldSize = 1; fieldSize <= 1000; fieldSize++) {
    const r = computeCascadingContest({ tierKey: tier, fieldSize });
    assert.equal(r.status, 'OK', `${tier}/${fieldSize} cascade resolves`);
    assert.equal(r.reconciliation.entry, true, `${tier}/${fieldSize} cascade entry reconciliation`);
    assert.equal(r.reconciliation.prize, true, `${tier}/${fieldSize} cascade prize reconciliation`);
    assert.equal(r.payouts.length, r.paidPlaces, `${tier}/${fieldSize} pays every prize place`);
    for (const p of r.payouts) {
      assert(p.stonkBonus >= 0, `${tier}/${fieldSize} nonnegative payout`);
      if (p.quantity === 0) assert.equal(p.isCashPrize, true, `${tier}/${fieldSize} no-ticket payout labeled cash prize`);
    }
  }
}

const healthyDirect = computePaidContest({ tierKey: 'trader', fieldSize: 100 });
const healthyCascade = computeCascadingContest({ tierKey: 'trader', fieldSize: 100 });
assert.deepEqual(healthyCascade, healthyDirect, 'healthy rooms are byte-for-byte equivalent at object level');

const tinyRunner = computeCascadingContest({ tierKey: 'runner', fieldSize: 2 });
assert.equal(tinyRunner.degraded, true);
assert.equal(tinyRunner.payouts.length, 1);
assert.equal(tinyRunner.payouts[0].quantity, 0);
assert.equal(tinyRunner.payouts[0].isCashPrize, true);
assert.equal(tinyRunner.payouts[0].stonkBonus, 170);

const soloTrader = computeCascadingContest({ tierKey: 'trader', fieldSize: 1 });
assert.equal(soloTrader.degraded, true);
assert.equal(soloTrader.payouts[0].ticketTier, 'runner');
assert.equal(soloTrader.payouts[0].quantity, 2);
assert.equal(soloTrader.payouts[0].liabilityBacking, 200);
assert.equal(soloTrader.payouts[0].stonkBonus, 97.5);
assert.equal(soloTrader.payouts[0].isCashPrize, false);

console.log('payoutEngineV2 tests passed');
