const db = require('./db');

const BUCKETS = new Set([
  'freeroll_reserve',
  'main_event_reserve',
  'ticket_liability',
  'platform_revenue',
]);

function record(bucket, amount, reason, { referenceType = null, referenceId = null } = {}) {
  if (!BUCKETS.has(bucket)) throw new Error(`Unknown SBC reserve bucket: ${bucket}`);
  if (!Number.isFinite(Number(amount)) || Number(amount) === 0) throw new Error('Reserve ledger amount must be non-zero');
  if (!reason) throw new Error('Reserve ledger reason is required');
  const info = db.prepare(`INSERT INTO sbc_reserve_ledger
    (bucket, amount, reason, reference_type, reference_id)
    VALUES (?, ?, ?, ?, ?)`)
    .run(bucket, Number(amount), reason, referenceType, referenceId);
  return info.lastInsertRowid;
}

function balance(bucket) {
  if (!BUCKETS.has(bucket)) throw new Error(`Unknown SBC reserve bucket: ${bucket}`);
  return Number(db.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM sbc_reserve_ledger WHERE bucket = ?').get(bucket).n || 0);
}

function balances() {
  return Object.fromEntries([...BUCKETS].map(bucket => [bucket, balance(bucket)]));
}

module.exports = { BUCKETS, record, balance, balances };
