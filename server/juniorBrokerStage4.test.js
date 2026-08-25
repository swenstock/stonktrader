'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DatabaseSync } = require('node:sqlite');
const {
  SOURCE_WON,
  SOURCE_MINTED,
  issueFundedJuniorBrokerShare,
} = require('./juniorBrokerStage2');
const {
  getPlayerJuniorSnapshot,
  redeemPlayerJuniors,
} = require('./juniorBrokerStage4');

function makeDb() {
  const db = new DatabaseSync(':memory:', { readBigInts: true });
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE accounts (id INTEGER PRIMARY KEY);
    INSERT INTO accounts(id) VALUES (1),(2);
  `);
  return db;
}

const db = makeDb();
for (let i = 1; i <= 13; i += 1) {
  issueFundedJuniorBrokerShare(db, { issuanceId: `stage4-won-${i}`, accountId: 1, source: SOURCE_WON });
}
issueFundedJuniorBrokerShare(db, { issuanceId: 'stage4-minted-1', accountId: 1, source: SOURCE_MINTED });

let snapshot = getPlayerJuniorSnapshot(db, 1);
assert.strictEqual(snapshot.assetType, 'junior_broker_share');
assert.strictEqual(snapshot.count, 14);
assert.strictEqual(snapshot.redeemCount, 20);
assert.strictEqual(snapshot.progress, 14);
assert.strictEqual(snapshot.progressLabel, '14 / 20');
assert.strictEqual(snapshot.redeemable, false);
assert.strictEqual(snapshot.fullRedemptionsAvailable, 0);
assert.strictEqual(snapshot.history.length, 14);
assert.strictEqual(snapshot.history.filter(x => x.source === 'minted').length, 1);
assert.ok(snapshot.history.every(x => typeof x.stonkSubunits === 'string'), 'JSON-facing STONK values must be exact strings, not floats');

for (let i = 14; i <= 19; i += 1) {
  issueFundedJuniorBrokerShare(db, { issuanceId: `stage4-won-${i}`, accountId: 1, source: SOURCE_WON });
}

snapshot = getPlayerJuniorSnapshot(db, 1);
assert.strictEqual(snapshot.count, 20);
assert.strictEqual(snapshot.progress, 20);
assert.strictEqual(snapshot.remainder, 0);
assert.strictEqual(snapshot.progressLabel, '20 / 20');
assert.strictEqual(snapshot.redeemable, true);
assert.strictEqual(snapshot.fullRedemptionsAvailable, 1);

const redeemed = redeemPlayerJuniors(db, { accountId: 1, redemptionId: 'stage4-ui-redemption-1' });
assert.strictEqual(redeemed.status, 'funded_pending_delivery');
assert.strictEqual(redeemed.brokerReserveDebitSubunits, '733332000000');
assert.strictEqual(redeemed.snapshot.count, 0);
assert.strictEqual(redeemed.snapshot.progress, 0);
assert.strictEqual(redeemed.snapshot.redeemable, false);
const redemptionHistory = redeemed.snapshot.history.find(x => x.type === 'redemption');
assert.ok(redemptionHistory, 'transaction history must include the actual redemption');
assert.strictEqual(redemptionHistory.quantity, -20);
assert.strictEqual(redemptionHistory.status, 'funded_pending_delivery');
assert.strictEqual(redemptionHistory.stonkSubunits, '733332000000');

const empty = getPlayerJuniorSnapshot(db, 2);
assert.strictEqual(empty.count, 0);
assert.strictEqual(empty.history.length, 0);
assert.strictEqual(empty.redeemable, false);

const uiSource = fs.readFileSync(path.join(__dirname, '../public/v45-stage4-junior-ui.js'), 'utf8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(uiSource, sandbox, { filename: 'v45-stage4-junior-ui.js' });
const ui = sandbox.window.__SBC_STAGE4_JUNIOR_UI_TEST;
assert.ok(ui && typeof ui.buildViewModel === 'function');

const vm14 = ui.buildViewModel({ count: 14, redeemCount: 20, progress: 14, redeemable: false, history: [] });
assert.strictEqual(vm14.progressLabel, '14 / 20');
assert.strictEqual(vm14.progressPercent, 70);
assert.strictEqual(vm14.redeemable, false);

const vm20 = ui.buildViewModel({ count: 20, redeemCount: 20, progress: 20, redeemable: true, fullRedemptionsAvailable: 1, history: [] });
assert.strictEqual(vm20.progressLabel, '20 / 20');
assert.strictEqual(vm20.progressPercent, 100);
assert.strictEqual(vm20.redeemable, true);
assert.strictEqual(vm20.fullRedemptionsAvailable, 1);
assert.strictEqual(ui.historyLabel({ type: 'issuance', source: 'won' }), 'WON 1 JUNIOR');
assert.strictEqual(ui.historyLabel({ type: 'issuance', source: 'minted' }), 'MINTED 1 JUNIOR');
assert.strictEqual(ui.historyLabel({ type: 'redemption', status: 'funded_pending_delivery' }), 'REDEEMED 20 JUNIORS • ACTIVATED BROKER FUNDED PENDING DELIVERY');

console.log('Stage 4 Junior collection UI/service: PASS');
console.log('Progress:', '14 Juniors -> 14 / 20 -> 70% and redeem disabled');
console.log('Threshold:', '20 Juniors -> 20 / 20 -> 100% and redeem enabled; funded redemption leaves 0');
console.log('History:', 'won, minted, and funded_pending_delivery redemption events returned from real ledger tables');
console.log('UI behavior:', 'browser view-model code executed; progress and transaction labels verified');

db.close();
