const db = require('./db');
const reserveLedger = require('./reserveLedger');

function get(categoryId) {
  return db.prepare('SELECT * FROM freeroll_reserve_v45 WHERE category_id = ?').get(categoryId) || null;
}

function ensure(categoryId) {
  db.prepare('INSERT OR IGNORE INTO freeroll_reserve_v45 (category_id) VALUES (?)').run(categoryId);
  return get(categoryId);
}

function deposit(categoryId, amount, { referenceType = null, referenceId = null } = {}) {
  const n = Number(amount);
  if (!(n > 0)) throw new Error('Freeroll reserve deposit must be positive');
  ensure(categoryId);
  db.prepare(`UPDATE freeroll_reserve_v45
    SET balance_stonk = balance_stonk + ?, contributed_lifetime = contributed_lifetime + ?, updated_at = ?
    WHERE category_id = ?`)
    .run(n, n, new Date().toISOString(), categoryId);
  reserveLedger.record('freeroll_reserve', n, 'freeroll_contribution', { referenceType, referenceId });
  return get(categoryId);
}

function canSpend(categoryId, amount) {
  return Number(get(categoryId)?.balance_stonk || 0) >= Number(amount || 0);
}

function spend(categoryId, amount, reason = 'freeroll_prize_backing', { referenceType = null, referenceId = null } = {}) {
  const n = Number(amount);
  if (!(n > 0)) throw new Error('Freeroll reserve spend must be positive');
  ensure(categoryId);
  const row = get(categoryId);
  if (Number(row.balance_stonk) + 1e-9 < n) {
    const err = new Error(`Freeroll reserve underfunded: ${categoryId} has ${row.balance_stonk}, needs ${n}`);
    err.code = 'FREEROLL_RESERVE_UNDERFUNDED';
    throw err;
  }
  db.prepare(`UPDATE freeroll_reserve_v45
    SET balance_stonk = balance_stonk - ?, spent_lifetime = spent_lifetime + ?, updated_at = ?
    WHERE category_id = ?`)
    .run(n, n, new Date().toISOString(), categoryId);
  reserveLedger.record('freeroll_reserve', -n, reason, { referenceType, referenceId });
  return get(categoryId);
}

function all() {
  return db.prepare('SELECT * FROM freeroll_reserve_v45 ORDER BY category_id').all();
}

module.exports = { get, ensure, deposit, canSpend, spend, all };
