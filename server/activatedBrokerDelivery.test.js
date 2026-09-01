'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const {
  migrateActivatedBrokerDeliverySchema,
  markActivatedBrokerDelivered,
} = require('./activatedBrokerDelivery');

function createRedemptionTable(db) {
  db.exec(`
    CREATE TABLE sbc_activated_broker_redemptions (
      redemption_id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      source_asset_type TEXT NOT NULL CHECK(source_asset_type = 'junior_broker_share'),
      shares_burned INTEGER NOT NULL CHECK(shares_burned = 20),
      broker_reserve_debit_subunits INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'funded_pending_delivery' CHECK(status IN ('funded_pending_delivery','delivered')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

const db = new DatabaseSync(':memory:');
createRedemptionTable(db);

const firstMigration = migrateActivatedBrokerDeliverySchema({ db });
assert.deepStrictEqual(firstMigration, { deliveredAtAdded: true });
assert(db.prepare('PRAGMA table_info(sbc_activated_broker_redemptions)').all().some(row => row.name === 'delivered_at'));

const secondMigration = migrateActivatedBrokerDeliverySchema({ db });
assert.deepStrictEqual(secondMigration, { deliveredAtAdded: false });
assert.strictEqual(
  db.prepare('PRAGMA table_info(sbc_activated_broker_redemptions)').all().filter(row => row.name === 'delivered_at').length,
  1,
  'running delivery migration twice must leave exactly one delivered_at column'
);

db.prepare(`
  INSERT INTO sbc_activated_broker_redemptions
    (redemption_id, account_id, source_asset_type, shares_burned, broker_reserve_debit_subunits, status, created_at)
  VALUES (?, ?, 'junior_broker_share', 20, 733332000000, 'funded_pending_delivery', ?)
`).run('redemption-pending', 17, '2026-09-01 12:00:00');

const delivered = markActivatedBrokerDelivered(db, { redemptionId: 'redemption-pending' });
assert.strictEqual(delivered.status, 'delivered');
assert.strictEqual(delivered.alreadyDelivered, false);
assert(delivered.deliveredAt, 'first delivery must stamp delivered_at');
const firstDeliveredAt = delivered.deliveredAt;

const persisted = db.prepare(`SELECT status, delivered_at FROM sbc_activated_broker_redemptions WHERE redemption_id=?`).get('redemption-pending');
assert.strictEqual(persisted.status, 'delivered');
assert.strictEqual(persisted.delivered_at, firstDeliveredAt);

const deliveredAgain = markActivatedBrokerDelivered(db, { redemptionId: 'redemption-pending' });
assert.strictEqual(deliveredAgain.status, 'delivered');
assert.strictEqual(deliveredAgain.alreadyDelivered, true);
assert.strictEqual(deliveredAgain.deliveredAt, firstDeliveredAt, 'second delivery must preserve the original delivered_at');

assert.throws(
  () => markActivatedBrokerDelivered(db, { redemptionId: 'missing-redemption' }),
  err => err && err.code === 'REDEMPTION_NOT_FOUND'
);

db.close();

// Verify the real admin route reuses the existing requireAuth + requireAdmin chain,
// and exercise requireAdmin itself rather than reimplementing its allowlist logic.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbc-delivery-admin-'));
process.env.DB_PATH = path.join(tempDir, 'app.db');
process.env.ADMIN_EMAILS = 'admin@example.com';
const requireAuth = require('./middleware/requireAuth');
const adminRouter = require('./routes/admin');
const { requireAdmin } = adminRouter;
const deliveryRoute = adminRouter.stack.find(layer => layer.route && layer.route.path === '/junior-broker-redemptions/:redemptionId/deliver');
assert(deliveryRoute, 'delivery admin route must be registered');
assert.strictEqual(deliveryRoute.route.methods.post, true, 'delivery route must be POST');
assert.strictEqual(deliveryRoute.route.stack[0].handle, requireAuth, 'delivery route must reuse existing requireAuth');
assert.strictEqual(deliveryRoute.route.stack[1].handle, requireAdmin, 'delivery route must reuse existing requireAdmin');

let deniedStatus = null;
let deniedBody = null;
let deniedNext = false;
const deniedRes = {
  status(code) { deniedStatus = code; return this; },
  json(body) { deniedBody = body; return this; },
};
requireAdmin({ user: { email: 'player@example.com' } }, deniedRes, () => { deniedNext = true; });
assert.strictEqual(deniedStatus, 403);
assert.deepStrictEqual(deniedBody, { error: 'Not authorized' });
assert.strictEqual(deniedNext, false, 'non-admin must not advance to delivery handler');

let adminNext = false;
requireAdmin({ user: { email: 'ADMIN@example.com' } }, deniedRes, () => { adminNext = true; });
assert.strictEqual(adminNext, true, 'allowlisted admin must advance');

process.env.ADMIN_EMAILS = '';
let closedStatus = null;
requireAdmin(
  { user: { email: 'admin@example.com' } },
  { status(code) { closedStatus = code; return this; }, json() { return this; } },
  () => assert.fail('empty ADMIN_EMAILS must remain closed')
);
assert.strictEqual(closedStatus, 403, 'empty admin allowlist must default closed');

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('Activated Broker Delivery Completion V1: PASS');
