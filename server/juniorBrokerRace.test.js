'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DatabaseSync } = require('node:sqlite');
const {
  SOURCE_WON,
  issueFundedJuniorBrokerShare,
  redeemJuniorsForActivatedBroker,
} = require('./juniorBrokerStage2');
const { getBrokerRaceStats } = require('./juniorBrokerRace');

const db = new DatabaseSync(':memory:', { readBigInts: true });
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE users (id INTEGER PRIMARY KEY, display_name TEXT NOT NULL);
  CREATE TABLE accounts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id));
  INSERT INTO users(id, display_name) VALUES
    (1,'Alpha'),(2,'Bravo'),(3,'Charlie'),(4,'Delta'),(5,'Echo');
  INSERT INTO accounts(id, user_id) VALUES (1,1),(2,2),(3,3),(4,4),(5,5);
`);

function award(accountId, count, prefix) {
  for (let i = 1; i <= count; i += 1) {
    issueFundedJuniorBrokerShare(db, {
      issuanceId: `${prefix}-${i}`,
      accountId,
      source: SOURCE_WON,
    });
  }
}

award(1, 19, 'alpha');
award(2, 12, 'bravo');
award(3, 5, 'charlie');
award(4, 20, 'delta');
award(5, 20, 'echo');
redeemJuniorsForActivatedBroker(db, { redemptionId: 'echo-broker-1', accountId: 5 });

const stats = getBrokerRaceStats(db, { limit: 50 });
assert.strictEqual(stats.brokersEarned, 1, 'lifetime Broker redemptions must be counted platform-wide');
assert.strictEqual(stats.juniorsAwarded, 76, 'lifetime Junior issuances must include all players');
assert.strictEqual(stats.juniorsStacked, 56, 'current stacked total must exclude redeemed Juniors');
assert.strictEqual(stats.redeemCount, 20);
assert.deepStrictEqual(
  stats.topStackers.slice(0, 4).map(r => [r.rank, r.displayName, r.juniorCount]),
  [[1,'Delta',20],[2,'Alpha',19],[3,'Bravo',12],[4,'Charlie',5]],
  'stacker board must rank current holdings across players, not contest placement'
);
assert.strictEqual(stats.topStackers[0].progressLabel, '20 / 20');
assert.strictEqual(stats.topStackers[0].juniorsToNextBroker, 0);
assert.strictEqual(stats.topStackers[1].progressLabel, '19 / 20');
assert.strictEqual(stats.topStackers[1].juniorsToNextBroker, 1);
assert.strictEqual(stats.topStackers[2].juniorsToNextBroker, 8);
assert.strictEqual(stats.topStackers.some(r => r.displayName === 'Echo'), false, 'a player who redeemed down to zero must leave the current stacker ranking');
assert.throws(() => getBrokerRaceStats(db, { limit: 0 }), /1 through 100/);
assert.throws(() => getBrokerRaceStats(db, { limit: 101 }), /1 through 100/);

const uiSource = fs.readFileSync(path.join(__dirname, '../public/v45-broker-race-ui.js'), 'utf8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(uiSource, sandbox, { filename: 'v45-broker-race-ui.js' });
const ui = sandbox.window.__SBC_BROKER_RACE_UI_TEST;
assert.ok(ui && typeof ui.buildRaceModel === 'function');
const model = ui.buildRaceModel(stats);
assert.strictEqual(model.brokersEarned, 1);
assert.strictEqual(model.juniorsAwarded, 76);
assert.strictEqual(model.juniorsStacked, 56);
assert.strictEqual(model.topStackers[0].displayName, 'Delta');

console.log('Junior Broker Race GUI/data: PASS');
console.log('Homepage totals:', '1 StonkBroker earned; 76 Juniors awarded lifetime; 56 currently stacked');
console.log('Top stackers:', 'Delta 20, Alpha 19, Bravo 12, Charlie 5');
console.log('Redemption effect:', 'Echo redeemed 20 and drops out of current stacker board while lifetime totals remain');
console.log('Scope:', 'platform-wide progression only; no contest leaderboard dependency');

db.close();
