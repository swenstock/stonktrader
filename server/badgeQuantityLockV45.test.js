'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const { DatabaseSync } = require('node:sqlite');
const {
  ensureSchema,
  getHoldingReservation,
  reserveListedQuantity,
  releaseListedQuantity,
} = require('./badgeQuantityLockV45');
const { ensureSchema: ensureReserveSchema, getBalances } = require('./prizeReserveLedger');

const ASSET = 'junior_broker_share';

function makeDb(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id)
    );
  `);
  ensureSchema(db);
  return db;
}

function createHolding(db, quantity, listed = 0) {
  db.prepare("INSERT INTO users (display_name) VALUES ('badge-lock-test')").run();
  const accountId = Number(db.prepare('INSERT INTO accounts (user_id) VALUES (1)').run().lastInsertRowid);
  const stmt = db.prepare(`
    INSERT INTO sbc_prize_holdings (account_id, asset_type, quantity, quantity_listed)
    VALUES (?, ?, ?, ?)
  `);
  stmt.setReadBigInts(true);
  stmt.run(accountId, ASSET, BigInt(quantity), BigInt(listed));
  return accountId;
}

async function concurrentReservationTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbc-badge-lock-'));
  const file = path.join(dir, 'race.sqlite');
  const db = makeDb(file);
  const accountId = createHolding(db, 1, 0);
  db.close();

  const gate = new SharedArrayBuffer(4);
  const view = new Int32Array(gate);
  const modulePath = require.resolve('./badgeQuantityLockV45');
  const workerSource = `
    const { parentPort, workerData } = require('worker_threads');
    const { DatabaseSync } = require('node:sqlite');
    const { reserveListedQuantity } = require(workerData.modulePath);
    const gate = new Int32Array(workerData.gate);
    Atomics.add(gate, 0, 1);
    Atomics.notify(gate, 0);
    while (Atomics.load(gate, 0) < 3) Atomics.wait(gate, 0, Atomics.load(gate, 0));
    const db = new DatabaseSync(workerData.file);
    db.exec('PRAGMA busy_timeout = 5000;');
    try {
      reserveListedQuantity(db, { accountId: workerData.accountId, assetType: workerData.assetType, quantity: 1n });
      parentPort.postMessage({ ok: true });
    } catch (err) {
      parentPort.postMessage({ ok: false, code: err.code, message: err.message });
    } finally {
      db.close();
    }
  `;

  const runWorker = () => new Promise((resolve, reject) => {
    const w = new Worker(workerSource, { eval: true, workerData: { file, accountId, assetType: ASSET, modulePath, gate } });
    w.once('message', resolve);
    w.once('error', reject);
  });

  const p1 = runWorker();
  const p2 = runWorker();
  while (Atomics.load(view, 0) < 2) Atomics.wait(view, 0, Atomics.load(view, 0), 10);
  Atomics.store(view, 0, 3);
  Atomics.notify(view, 0, 2);
  const results = await Promise.all([p1, p2]);

  const verify = makeDb(file);
  const state = getHoldingReservation(verify, accountId, ASSET);
  verify.close();
  fs.rmSync(dir, { recursive: true, force: true });

  assert.strictEqual(results.filter(r => r.ok).length, 1, JSON.stringify(results));
  assert.strictEqual(results.filter(r => !r.ok && r.code === 'INSUFFICIENT_UNLISTED_QUANTITY').length, 1, JSON.stringify(results));
  assert.strictEqual(state.quantity, 1n);
  assert.strictEqual(state.quantity_listed, 1n);
  return results;
}

(async () => {
  const db = makeDb();
  const accountId = createHolding(db, 14, 0);
  ensureReserveSchema(db);
  db.prepare("UPDATE sbc_prize_reserve_accounts SET balance_subunits = CASE bucket WHEN 'broker_reserve' THEN 733332000000 ELSE 123456000000 END").run();
  const reserveBefore = getBalances(db);

  for (let i = 0; i < 14; i += 1) {
    reserveListedQuantity(db, { accountId, assetType: ASSET, quantity: 1n });
  }
  let state = getHoldingReservation(db, accountId, ASSET);
  assert.strictEqual(state.quantity, 14n);
  assert.strictEqual(state.quantity_listed, 14n);

  assert.throws(
    () => reserveListedQuantity(db, { accountId, assetType: ASSET, quantity: 1n }),
    err => err && err.code === 'INSUFFICIENT_UNLISTED_QUANTITY'
  );
  state = getHoldingReservation(db, accountId, ASSET);
  assert.strictEqual(state.quantity_listed, 14n);

  releaseListedQuantity(db, { accountId, assetType: ASSET, quantity: 1n });
  state = getHoldingReservation(db, accountId, ASSET);
  assert.strictEqual(state.quantity_listed, 13n);
  reserveListedQuantity(db, { accountId, assetType: ASSET, quantity: 1n });
  state = getHoldingReservation(db, accountId, ASSET);
  assert.strictEqual(state.quantity_listed, 14n);

  const reserveAfter = getBalances(db);
  assert.deepStrictEqual(reserveAfter, reserveBefore);
  db.close();

  const race = await concurrentReservationTest();
  console.log('Badge Quantity Lock V45: PASS');
  console.log('14/14 reservations succeed; 15th rejected unchanged; release restores capacity');
  console.log(`Concurrent 1-slot race: successes=${race.filter(r => r.ok).length}, rejected=${race.filter(r => !r.ok).length}`);
  console.log('Broker/Overflow reserve balances unchanged by reserve/release operations');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
