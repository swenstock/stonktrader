'use strict';

const fs = require('fs');
const express = require('express');

const dbPath = '/tmp/sbc-freeroll-route-funding-v45.db';
try { fs.unlinkSync(dbPath); } catch (_) {}
process.env.DB_PATH = dbPath;
process.env.PAYOUT_ENGINE_V45 = 'true';
process.env.SESSION_SECRET = 'freeroll-route-funding-test-secret';

const db = require('./db');
require('./schemaV45').run();
const { sign } = require('./auth');
const satellitesRouter = require('./routes/satellites');
const freerollReserve = require('./freerollReserveV45');
const { creditEntryContributionInTransaction } = require('./freerollFundingV45');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const email = 'route-funding@test';
  const userId = Number(db.prepare(
    "INSERT INTO users(email,password_hash,display_name,referral_code) VALUES('route-funding@test','x:y','Route Funding','ROUTE50')"
  ).run().lastInsertRowid);
  const accountId = Number(db.prepare('INSERT INTO accounts(user_id,stonk_balance) VALUES(?,1000)').run(userId).lastInsertRowid);

  const now = new Date();
  const satellite = db.prepare(`INSERT INTO satellites
    (tier_id,price_level,name,entry_fee,ticket_cost,opens_at,locks_at,status,settlement_version)
    VALUES('hourly','low','Degen Hours — Clerk',150,0,?,?, 'open','v45') RETURNING *`)
    .get(new Date(now.getTime() - 60_000).toISOString(), new Date(now.getTime() + 30 * 60_000).toISOString());

  const app = express();
  app.use(express.json());
  app.use('/api/satellites', satellitesRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    const token = sign({ userId, email });
    const before = Number(freerollReserve.get('hourly')?.balance_stonk || 0);
    assert(before === 0, `expected fresh Free Roll V45 reserve 0, got ${before}`);

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/satellites/${satellite.id}/enter`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
    });
    const body = await response.json();
    assert(response.status === 200 && body.ok === true, `real route entry failed: ${response.status} ${JSON.stringify(body)}`);

    const entry = db.prepare('SELECT * FROM satellite_entries WHERE satellite_id=? AND account_id=? ORDER BY id DESC LIMIT 1')
      .get(satellite.id, accountId);
    assert(entry, 'real route did not create satellite entry');

    const afterRoute = Number(freerollReserve.get('hourly')?.balance_stonk || 0);
    assert(afterRoute === 50, `real route must increase spendable Free Roll reserve by exactly 50, got ${afterRoute}`);

    const contribution = db.prepare('SELECT * FROM freeroll_entry_contributions_v45 WHERE entry_id=?').get(entry.id);
    assert(contribution && Number(contribution.amount_stonk) === 50, 'route entry must record exactly one 50 STONK contribution');

    const retry = creditEntryContributionInTransaction({
      entryId: Number(entry.id),
      categoryId: 'hourly',
      amountStonk: 50,
    });
    assert(retry.credited === false, 'same entry ID must return credited:false on duplicate processing');

    const afterRetry = Number(freerollReserve.get('hourly')?.balance_stonk || 0);
    assert(afterRetry === 50, `duplicate processing must not double-credit spendable reserve; got ${afterRetry}`);

    const rows = db.prepare('SELECT COUNT(*) AS n FROM freeroll_entry_contributions_v45 WHERE entry_id=?').get(entry.id).n;
    assert(Number(rows) === 1, `same entry must have exactly one contribution row, got ${rows}`);

    console.log('Free Roll route funding + trigger idempotency: PASS');
    console.log('real Clerk route entry: reserve 0 -> 50; duplicate same entry: reserve remains 50');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
