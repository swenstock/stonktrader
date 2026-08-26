'use strict';

const db = require('./db');

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS freeroll_entry_contributions_v45 (
      entry_id INTEGER PRIMARY KEY,
      category_id TEXT NOT NULL,
      amount_stonk REAL NOT NULL CHECK(amount_stonk > 0),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function creditEntryContributionInTransaction({ entryId, categoryId, amountStonk }) {
  ensureSchema();
  if (!Number.isSafeInteger(Number(entryId)) || Number(entryId) <= 0) throw new TypeError('entryId required');
  if (typeof categoryId !== 'string' || !categoryId) throw new TypeError('categoryId required');
  const amount = Number(amountStonk);
  if (!(amount > 0)) throw new TypeError('amountStonk must be positive');

  const existing = db.prepare('SELECT * FROM freeroll_entry_contributions_v45 WHERE entry_id=?').get(entryId);
  if (existing) return { credited: false, duplicate: true, ...existing };

  db.prepare(`INSERT INTO freeroll_entry_contributions_v45 (entry_id, category_id, amount_stonk)
              VALUES (?, ?, ?)`)
    .run(entryId, categoryId, amount);
  db.prepare('INSERT OR IGNORE INTO freeroll_fund (category_id) VALUES (?)').run(categoryId);
  db.prepare('UPDATE freeroll_fund SET accumulated_stonk = accumulated_stonk + ? WHERE category_id = ?')
    .run(amount, categoryId);
  return { credited: true, duplicate: false, entry_id: entryId, category_id: categoryId, amount_stonk: amount };
}

module.exports = { ensureSchema, creditEntryContributionInTransaction };
