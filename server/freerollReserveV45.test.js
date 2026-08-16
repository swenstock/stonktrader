const fs = require('fs');
const path = '/tmp/sbc-freeroll-v45-test.db';
try { fs.unlinkSync(path); } catch (_) {}
process.env.DB_PATH = path;

const db = require('./db');
require('./schemaV45').run();
const reserve = require('./freerollReserveV45');

function legacy(category) {
  return db.prepare('SELECT * FROM freeroll_fund WHERE category_id = ?').get(category);
}

assertZero(reserve.get('morning')?.balance_stonk);
db.prepare('UPDATE freeroll_fund SET accumulated_stonk = accumulated_stonk + 50 WHERE category_id = ?').run('morning');
if (Number(reserve.get('morning').balance_stonk) !== 50) throw new Error('Morning +50 was not mirrored exactly');

// Legacy threshold-style deduction must NOT reduce the new actual-STONK bank.
db.prepare('UPDATE freeroll_fund SET accumulated_stonk = accumulated_stonk - 50 WHERE category_id = ?').run('morning');
if (Number(reserve.get('morning').balance_stonk) !== 50) throw new Error('Legacy deduction incorrectly reduced V45 reserve');

if (!legacy('race_to_close')) throw new Error('Race legacy compatibility row missing');
db.prepare('UPDATE freeroll_fund SET accumulated_stonk = accumulated_stonk + 50 WHERE category_id = ?').run('race_to_close');
if (Number(reserve.get('degen').balance_stonk) !== 50) throw new Error('Race contribution did not route to Degen V45 pool');

db.prepare('UPDATE freeroll_fund SET accumulated_stonk = accumulated_stonk + 50 WHERE category_id = ?').run('hourly');
if (Number(reserve.get('degen').balance_stonk) !== 100) throw new Error('Hourly contribution did not share Degen V45 pool');

const ledger = db.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM sbc_reserve_ledger WHERE bucket='freeroll_reserve'").get();
if (Number(ledger.n) !== 150) throw new Error(`Expected 150 mirrored into reserve ledger, got ${ledger.n}`);

console.log('freerollReserveV45 tests passed');

function assertZero(n) {
  if (Number(n || 0) !== 0) throw new Error(`Expected zero, got ${n}`);
}
