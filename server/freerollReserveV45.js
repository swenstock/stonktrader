const db = require('./db');
const reserveLedger = require('./reserveLedger');
const { FREEROLL_RESERVE_POOL } = require('./tierConfig');

function poolId(categoryOrPool) {
  if (categoryOrPool === 'degen') return 'degen';
  return FREEROLL_RESERVE_POOL[categoryOrPool] || categoryOrPool;
}

function get(categoryOrPool) {
  const id = poolId(categoryOrPool);
  return db.prepare('SELECT * FROM freeroll_reserve_v45 WHERE category_id = ?').get(id) || null;
}

function ensure(categoryOrPool) {
  const id = poolId(categoryOrPool);
  db.prepare('INSERT OR IGNORE INTO freeroll_reserve_v45 (category_id) VALUES (?)').run(id);
  return get(id);
}

function deposit(categoryOrPool, amount, { referenceType = null, referenceId = null } = {}) {
  const id = poolId(categoryOrPool);
  const n = Number(amount);
  if (!(n > 0)) throw new Error('Freeroll reserve deposit must be positive');
  ensure(id);
  db.prepare(`UPDATE freeroll_reserve_v45
    SET balance_stonk = balance_stonk + ?, contributed_lifetime = contributed_lifetime + ?, updated_at = ?
    WHERE category_id = ?`)
    .run(n, n, new Date().toISOString(), id);
  reserveLedger.record('freeroll_reserve', n, 'freeroll_contribution', { referenceType, referenceId });
  return get(id);
}

function canSpend(categoryOrPool, amount) {
  return Number(get(categoryOrPool)?.balance_stonk || 0) >= Number(amount || 0);
}

function spend(categoryOrPool, amount, reason = 'freeroll_prize_backing', { referenceType = null, referenceId = null } = {}) {
  const id = poolId(categoryOrPool);
  const n = Number(amount);
  if (!(n > 0)) throw new Error('Freeroll reserve spend must be positive');
  ensure(id);
  const row = get(id);
  if (Number(row.balance_stonk) + 1e-9 < n) {
    const err = new Error(`Freeroll reserve underfunded: ${id} has ${row.balance_stonk}, needs ${n}`);
    err.code = 'FREEROLL_RESERVE_UNDERFUNDED';
    throw err;
  }
  db.prepare(`UPDATE freeroll_reserve_v45
    SET balance_stonk = balance_stonk - ?, spent_lifetime = spent_lifetime + ?, updated_at = ?
    WHERE category_id = ?`)
    .run(n, n, new Date().toISOString(), id);
  reserveLedger.record('freeroll_reserve', -n, reason, { referenceType, referenceId });
  return get(id);
}

function all() {
  return db.prepare('SELECT * FROM freeroll_reserve_v45 ORDER BY category_id').all();
}

module.exports = { poolId, get, ensure, deposit, canSpend, spend, all };
