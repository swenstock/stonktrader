const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { TICKET_BURN_CONFIG, burnTicketsForUpgrade } = require('../ticketBurnV45');

const TYPES = ['junior','trader','clerk','runner'];

router.get('/', requireAuth, (req, res) => {
  const tickets = db.prepare('SELECT * FROM tickets WHERE account_id = ? ORDER BY created_at DESC').all(req.account.id);
  const inventory = Object.fromEntries(TYPES.map(type => [type, { owned: 0, available: 0, listed: 0 }]));

  for (const ticket of tickets) {
    const type = ticket.ticket_type;
    if (!type) continue;
    // Historical Main Event tickets remain in storage but are intentionally
    // omitted from the active corporate-ladder inventory.
    if (!inventory[type]) continue;
    if (!['applied','consumed'].includes(ticket.status)) inventory[type].owned += 1;
    if (ticket.status === 'unredeemed') inventory[type].available += 1;
    if (ticket.status === 'listed') inventory[type].listed += 1;
  }

  res.json({
    unredeemedCount: tickets.filter(t => t.status === 'unredeemed' && TYPES.includes(t.ticket_type)).length,
    inventory,
    burnUpgrades: TICKET_BURN_CONFIG,
    tickets: tickets.filter(t=>TYPES.includes(t.ticket_type)).map(t => ({
      ...t,
      backing_stonk: t.backing_stonk ?? t.value_stonk,
    })),
  });
});

router.post('/burn-upgrade', requireAuth, (req, res) => {
  const sourceType = String(req.body?.sourceType || '').toLowerCase();
  const burnId = String(req.body?.burnId || '').trim();
  if (!burnId) return res.status(400).json({ error:'burnId required' });
  try {
    const result = burnTicketsForUpgrade({ burnId, accountId:req.account.id, sourceType });
    res.json({ ok:true, ...result });
  } catch (err) {
    const code = err?.code || 'TICKET_BURN_FAILED';
    const status = ['INSUFFICIENT_TICKETS','DUPLICATE_TICKET_BURN'].includes(code) ? 409 : 400;
    res.status(status).json({ error:err.message, code });
  }
});

module.exports = router;
