const assert = require('assert');
const {
  TIER_RULES,
  economicsForEntry,
  computePaidContest,
  computeFreerollRequirement,
} = require('./payoutEngineV2');

function approxEqual(a, b) {
  return Math.abs(a - b) < 1e-9;
}

// Exact per-entry economics
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

// Wide stress test. A tiny field may legitimately be marked UNDERFUNDED_BASELINE;
// whenever status=OK every STONK must reconcile exactly.
for (const tier of Object.keys(TIER_RULES)) {
  for (const fieldSize of [1,2,3,5,10,11,25,50,100,250,1000,5000,10000]) {
    const r = computePaidContest({ tierKey: tier, fieldSize });
    assert(r.reconciliation, `${tier}/${fieldSize} has reconciliation info`);
    if (r.status === 'OK') {
      assert.equal(r.reconciliation.entry, true, `${tier}/${fieldSize} entry reconciliation`);
      assert.equal(r.reconciliation.prize, true, `${tier}/${fieldSize} prize reconciliation`);
      assert.equal(r.payouts.length, r.paidPlaces, `${tier}/${fieldSize} pays every prize place`);
      assert(r.mainEventTickets <= r.paidPlaces, `${tier}/${fieldSize} no excess ME upgrades`);
      for (const p of r.payouts) {
        assert(p.rank >= 1 && p.rank <= r.paidPlaces, `${tier}/${fieldSize} valid rank`);
        if (p.award === 'main_event_ticket') {
          assert.equal(p.quantity, 1);
          assert.equal(p.liabilityBacking, 3000);
        } else {
          assert.equal(p.award, 'baseline_tickets');
          assert.equal(p.quantity, 2);
        }
        assert(p.stonkBonus >= 0, `${tier}/${fieldSize} nonnegative residual bonus`);
      }
    } else {
      assert.equal(r.status, 'UNDERFUNDED_BASELINE');
      assert(r.shortfall > 0, `${tier}/${fieldSize} real baseline shortfall`);
    }
  }
}

// Freeroll liability: top 10%, two Runner tickets each.
assert.deepEqual(
  computeFreerollRequirement({ fieldSize: 1000 }),
  {
    fieldSize: 1000,
    paidPlaces: 100,
    ticketTier: 'runner',
    ticketsPerWinner: 2,
    ticketsRequired: 200,
    liabilityRequired: 20000,
  }
);

console.log('payoutEngineV2 tests passed');
