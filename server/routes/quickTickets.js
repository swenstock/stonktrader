const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { getQuotes, listSymbols } = require('../dataProvider');

const MIN_STOCKS = 10;
const MAX_STOCKS = 100;

function normalizeSymbols(input) {
  const symbols = (Array.isArray(input) ? input : [])
    .map(s => String(s || '').trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(symbols)];
}

function validateSymbols(symbols) {
  if (symbols.length < MIN_STOCKS) return `Create A Basket requires at least ${MIN_STOCKS} unique stocks.`;
  if (symbols.length > MAX_STOCKS) return `Create A Basket supports up to ${MAX_STOCKS} stocks.`;
  const known = new Set(listSymbols().map(s => String(s.symbol).toUpperCase()));
  const invalid = symbols.filter(s => !known.has(s));
  if (invalid.length) return `Not available in SBC: ${invalid.slice(0, 8).join(', ')}${invalid.length > 8 ? '…' : ''}`;
  return null;
}

// Public symbol directory used only for client-side basket validation.
router.get('/symbols', (req, res) => {
  res.json(listSymbols().map(s => ({ symbol: s.symbol, name: s.name })));
});

router.get('/lists', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT id, name, symbols_json, created_at, updated_at
    FROM quick_ticket_lists WHERE account_id = ? ORDER BY updated_at DESC, id DESC`).all(req.account.id);
  res.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    symbols: JSON.parse(r.symbols_json || '[]'),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })));
});

router.post('/lists', requireAuth, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 60);
  const symbols = normalizeSymbols(req.body?.symbols);
  if (!name) return res.status(400).json({ error: 'Give this saved basket a name.' });
  const error = validateSymbols(symbols);
  if (error) return res.status(400).json({ error });

  db.prepare(`INSERT INTO quick_ticket_lists (account_id, name, symbols_json, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(account_id, name) DO UPDATE SET
      symbols_json = excluded.symbols_json,
      updated_at = CURRENT_TIMESTAMP`).run(req.account.id, name, JSON.stringify(symbols));

  const row = db.prepare(`SELECT id, name, symbols_json, created_at, updated_at
    FROM quick_ticket_lists WHERE account_id = ? AND name = ?`).get(req.account.id, name);
  res.json({
    ok: true,
    list: { id: row.id, name: row.name, symbols: JSON.parse(row.symbols_json), createdAt: row.created_at, updatedAt: row.updated_at },
  });
});

router.delete('/lists/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM quick_ticket_lists WHERE id = ? AND account_id = ?').run(req.params.id, req.account.id);
  if (!result.changes) return res.status(404).json({ error: 'Saved basket not found.' });
  res.json({ ok: true });
});

// Preview does not mutate account state, so authentication is not required.
// That prevents a bad/expired UI token from masking a simple invalid-symbol error.
router.post('/preview', (req, res) => {
  const symbols = normalizeSymbols(req.body?.symbols);
  const error = validateSymbols(symbols);
  if (error) return res.status(400).json({ error });
  const quotes = getQuotes(symbols);
  const bySymbol = new Map(quotes.map(q => [String(q.symbol).toUpperCase(), q]));
  const missing = symbols.filter(s => !bySymbol.has(s));
  if (missing.length) return res.status(400).json({ error: `No current SBC quote for: ${missing.join(', ')}` });
  const weight = 100 / symbols.length;
  res.json({
    count: symbols.length,
    weight,
    rows: symbols.map(symbol => {
      const q = bySymbol.get(symbol);
      return { symbol, name: q.name || '', price: q.price, marketCap: q.marketCap ?? null, weight };
    }),
  });
});

module.exports = router;
