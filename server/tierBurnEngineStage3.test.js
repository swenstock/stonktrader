'use strict';

const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const {
  BROKER_RESERVE_BUCKET,
  OVERFLOW_RESERVE_BUCKET,
  getBalances,
  creditIssuance,
} = require('./prizeReserveLedger');
const {
  ensureSchema: ensureTierBurnSchema,
  getHoldingCount,
  burnTierForNextUnit,
} = require('./tierBurnEngine');
const {
  SOURCE_WON,
  ACTIVATED_BROKER_COST,
  ACTIVATED_BROKER_ASSET_TYPE,
  ASSET_TYPE: JUNIOR_ASSET_TYPE,
  ensureSchema: ensureStage2Schema,
  issueFundedJuniorBrokerShare,
  redeemJuniorsForActivatedBroker,
} = require('./juniorBrokerStage2');

function makeDb() {
  const db = new DatabaseSync(':memory:', { readBigInts: true });
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE accounts (id INTEGER PRIMARY KEY);
    INSERT INTO accounts(id) VALUES (1),(2),(3),(4),(5);
  `);
  ensureTierBurnSchema(db);
  return db;
}

function seedHolding(db, accountId, assetType, quantity) {
  db.prepare(`
    INSERT INTO sbc_prize_holdings (account_id, asset_type, quantity)
    VALUES (?, ?, ?)
    ON CONFLICT(account_id, asset_type) DO UPDATE SET quantity = excluded.quantity
  `).run(accountId, assetType, quantity);
}

// Migration: Stage 3 must widen the Stage 2 holdings table without losing Junior data.
{
  const db = new DatabaseSync(':memory:', { readBigInts: true });
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE accounts (id INTEGER PRIMARY KEY);
    INSERT INTO accounts(id) VALUES (1);
    CREATE TABLE sbc_prize_holdings (
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      asset_type TEXT NOT NULL CHECK(asset_type = 'junior_broker_share'),
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(typeof(quantity) = 'integer' AND quantity >= 0),
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(account_id, asset_type)
    );
    INSERT INTO sbc_prize_holdings(account_id, asset_type, quantity)
    VALUES (1, 'junior_broker_share', 9);
  `);
  ensureTierBurnSchema(db);
  assert.strictEqual(getHoldingCount(db, 1, 'junior_broker_share'), 9n, 'existing Junior holdings must survive schema widening');
  db.prepare(`INSERT INTO sbc_prize_holdings(account_id, asset_type, quantity) VALUES (1, 'config_only_new_tier', 2)`).run();
  assert.strictEqual(getHoldingCount(db, 1, 'config_only_new_tier'), 2n, 'generic holdings schema must accept future tier identifiers');
  db.close();
}

// Generic configured burn: four source units fund exactly one target unit and debit exact reserve amount.
{
  const db = makeDb();
  const config = Object.freeze({
    sourceAssetType: 'test_trader_share',
    targetAssetType: 'test_clerk_share',
    burnCount: 4n,
    reserveBucket: BROKER_RESERVE_BUCKET,
    reserveDebitSubunits: 123456789n,
    reason: 'stage3_configured_burn',
  });

  creditIssuance(db, {
    issuanceId: 'stage3-seed-broker-reserve',
    brokerSubunits: config.reserveDebitSubunits,
    overflowSubunits: 0n,
    reason: 'stage3_test_seed',
  });
  seedHolding(db, 1, config.sourceAssetType, 4n);

  const result = burnTierForNextUnit(db, { burnId: 'burn-trader-to-clerk-1', accountId: 1, config });
  assert.strictEqual(result.sourceQuantityBurned, 4n);
  assert.strictEqual(result.targetQuantityFunded, 1n);
  assert.strictEqual(result.remainingSourceUnits, 0n);
  assert.strictEqual(result.reserveDebitSubunits, 123456789n);
  assert.strictEqual(result.balances[BROKER_RESERVE_BUCKET].balanceSubunits, 0n);
  assert.strictEqual(result.balances[BROKER_RESERVE_BUCKET].debitedLifetimeSubunits, 123456789n);

  const burnRow = db.prepare(`
    SELECT source_asset_type, target_asset_type,
           source_quantity_burned, target_quantity_funded,
           reserve_bucket, reserve_debit_subunits,
           typeof(source_quantity_burned) AS source_type,
           typeof(target_quantity_funded) AS target_type,
           typeof(reserve_debit_subunits) AS reserve_type
    FROM sbc_prize_tier_burns WHERE burn_id = ?
  `).get('burn-trader-to-clerk-1');
  assert.strictEqual(burnRow.source_asset_type, 'test_trader_share');
  assert.strictEqual(burnRow.target_asset_type, 'test_clerk_share');
  assert.strictEqual(burnRow.source_quantity_burned, 4n);
  assert.strictEqual(burnRow.target_quantity_funded, 1n);
  assert.strictEqual(burnRow.reserve_debit_subunits, 123456789n);
  assert.deepStrictEqual([burnRow.source_type, burnRow.target_type, burnRow.reserve_type], ['integer','integer','integer']);
  db.close();
}

// Fewer than the configured ratio must reject with no holdings, reserve, debit, or burn mutation.
{
  const db = makeDb();
  const config = Object.freeze({
    sourceAssetType: 'test_trader_share',
    targetAssetType: 'test_clerk_share',
    burnCount: 4n,
    reserveBucket: BROKER_RESERVE_BUCKET,
    reserveDebitSubunits: 123456789n,
    reason: 'stage3_configured_burn',
  });
  creditIssuance(db, {
    issuanceId: 'stage3-short-seed',
    brokerSubunits: config.reserveDebitSubunits,
    overflowSubunits: 0n,
    reason: 'stage3_test_seed',
  });
  seedHolding(db, 2, config.sourceAssetType, 3n);
  const before = getBalances(db);
  assert.throws(
    () => burnTierForNextUnit(db, { burnId: 'burn-too-short', accountId: 2, config }),
    err => err && err.code === 'INSUFFICIENT_TIER_UNITS'
  );
  assert.strictEqual(getHoldingCount(db, 2, config.sourceAssetType), 3n);
  assert.deepStrictEqual(getBalances(db), before);
  assert.strictEqual(db.prepare(`SELECT COUNT(*) AS n FROM sbc_prize_tier_burns`).get().n, 0n);
  assert.strictEqual(db.prepare(`SELECT COUNT(*) AS n FROM sbc_prize_reserve_debits`).get().n, 0n);
  db.close();
}

// A completely different tier works through configuration alone: no new burn logic.
{
  const db = makeDb();
  const secondConfig = Object.freeze({
    sourceAssetType: 'future_clerk_share',
    targetAssetType: 'future_runner_share',
    burnCount: 7n,
    reserveBucket: OVERFLOW_RESERVE_BUCKET,
    reserveDebitSubunits: 987654321n,
    reason: 'stage3_second_config_only_tier',
  });
  creditIssuance(db, {
    issuanceId: 'stage3-seed-overflow-reserve',
    brokerSubunits: 0n,
    overflowSubunits: secondConfig.reserveDebitSubunits,
    reason: 'stage3_test_seed',
  });
  seedHolding(db, 3, secondConfig.sourceAssetType, 9n);
  const result = burnTierForNextUnit(db, { burnId: 'burn-clerk-to-runner-1', accountId: 3, config: secondConfig });
  assert.strictEqual(result.sourceQuantityBurned, 7n);
  assert.strictEqual(result.targetQuantityFunded, 1n);
  assert.strictEqual(result.remainingSourceUnits, 2n);
  assert.strictEqual(result.balances[OVERFLOW_RESERVE_BUCKET].balanceSubunits, 0n);
  assert.strictEqual(result.balances[OVERFLOW_RESERVE_BUCKET].debitedLifetimeSubunits, 987654321n);
  db.close();
}

// Stage 2 must actually use the generic Stage 3 burn path, not keep a parallel implementation.
{
  const db = new DatabaseSync(':memory:', { readBigInts: true });
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE accounts (id INTEGER PRIMARY KEY);
    INSERT INTO accounts(id) VALUES (4);
  `);
  ensureStage2Schema(db);
  for (let i = 1; i <= 20; i += 1) {
    issueFundedJuniorBrokerShare(db, { issuanceId: `stage3-junior-${i}`, accountId: 4, source: SOURCE_WON });
  }
  redeemJuniorsForActivatedBroker(db, { redemptionId: 'stage3-stage2-reuse', accountId: 4 });
  const row = db.prepare(`
    SELECT source_asset_type, target_asset_type, source_quantity_burned,
           target_quantity_funded, reserve_debit_subunits
    FROM sbc_prize_tier_burns
    WHERE burn_id = ?
  `).get('junior-to-broker:stage3-stage2-reuse');
  assert.strictEqual(row.source_asset_type, JUNIOR_ASSET_TYPE);
  assert.strictEqual(row.target_asset_type, ACTIVATED_BROKER_ASSET_TYPE);
  assert.strictEqual(row.source_quantity_burned, 20n);
  assert.strictEqual(row.target_quantity_funded, 1n);
  assert.strictEqual(row.reserve_debit_subunits, ACTIVATED_BROKER_COST);
  db.close();
}

console.log('Stage 3 general tier burn engine: PASS');
console.log('Configured burn:', '4 test_trader_share -> 1 test_clerk_share; exact 123456789-subunit reserve transfer');
console.log('Insufficient ratio:', '3 of required 4 rejected with zero mutations');
console.log('Config-only extension:', '7 future_clerk_share -> 1 future_runner_share; no new burn logic');
console.log('Stage 2 reuse:', '20 junior_broker_share -> 1 activated_stonk_broker through the same generic burn engine');
console.log('Holdings migration:', 'existing Junior holdings preserved while future tier identifiers become data-driven');
