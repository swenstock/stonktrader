const fs = require('fs');
const path = '/tmp/sbc-rake-v45-test.db';
try { fs.unlinkSync(path); } catch (_) {}
process.env.DB_PATH = path;

const db = require('./db');
require('./schemaV45').run();
const { settleEntryRake } = require('./rakeV45');

function user(email, name, code, referredBy = null) {
  return db.prepare('INSERT INTO users (email,password_hash,display_name,referral_code,referred_by_user_id) VALUES (?,?,?,?,?)')
    .run(email,'x:y',name,code,referredBy).lastInsertRowid;
}
function account(userId) {
  return db.prepare('INSERT INTO accounts (user_id) VALUES (?)').run(userId).lastInsertRowid;
}

const refUser = user('ref@test.local','Ref','REF001');
const referredUser = user('referred@test.local','Referred','REF002',refUser);
const plainUser = user('plain@test.local','Plain','REF003');
const refAccount = account(refUser);
const referredAccount = account(referredUser);
const plainAccount = account(plainUser);

const satId = db.prepare("INSERT INTO satellites (tier_id,price_level,name,entry_fee,ticket_cost,opens_at,locks_at,status) VALUES ('morning','low','Morning Clerk',150,3000,?,?, 'open')")
  .run(new Date().toISOString(),new Date(Date.now()+60000).toISOString()).lastInsertRowid;
const p1 = db.prepare("INSERT INTO portfolios (account_id,label) VALUES (?,?)").run(referredAccount,'P1').lastInsertRowid;
const p2 = db.prepare("INSERT INTO portfolios (account_id,label) VALUES (?,?)").run(plainAccount,'P2').lastInsertRowid;
const e1 = db.prepare('INSERT INTO satellite_entries (satellite_id,account_id,portfolio_id,entry_fee_paid) VALUES (?,?,?,150)').run(satId,referredAccount,p1).lastInsertRowid;
const e2 = db.prepare('INSERT INTO satellite_entries (satellite_id,account_id,portfolio_id,entry_fee_paid) VALUES (?,?,?,350)').run(satId,plainAccount,p2).lastInsertRowid;

const out = settleEntryRake([
  {id:e1,account_id:referredAccount,entry_fee_paid:150},
  {id:e2,account_id:plainAccount,entry_fee_paid:350},
], {entryType:'satellite',referenceId:satId});

if (out.affiliatePaid !== 7.5) throw new Error(`Expected affiliate 7.5, got ${out.affiliatePaid}`);
if (out.platformTake !== 67.5) throw new Error(`Expected platform 67.5, got ${out.platformTake}`);
if (out.totalRake !== 75) throw new Error(`Expected total rake 75, got ${out.totalRake}`);

const refBalance = db.prepare('SELECT stonk_balance FROM accounts WHERE id=?').get(refAccount).stonk_balance;
if (Number(refBalance) !== 7.5) throw new Error(`Referrer should receive 7.5, got ${refBalance}`);
const earning = db.prepare('SELECT amount FROM referral_earnings WHERE satellite_entry_id=?').get(e1);
if (Number(earning.amount) !== 7.5) throw new Error('Referral earning row lost half-STONK precision');
const platformLedger = db.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM sbc_reserve_ledger WHERE bucket='platform_revenue'").get().n;
if (Number(platformLedger) !== 67.5) throw new Error(`Platform revenue ledger mismatch: ${platformLedger}`);

console.log('rakeV45 tests passed');
