const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const TYPES = ['main_event','junior','trader','clerk','runner'];

router.get('/', requireAuth, (req, res) => {
  const tickets = db.prepare('SELECT * FROM tickets WHERE account_id = ? ORDER BY created_at DESC').all(req.account.id);
  const inventory = Object.fromEntries(TYPES.map(type => [type, { owned: 0, available: 0, listed: 0 }]));

  for (const ticket of tickets) {
    const type = ticket.ticket_type || 'main_event';
    if (!inventory[type]) inventory[type] = { owned: 0, available: 0, listed: 0 };
    if (!['applied','consumed'].includes(ticket.status)) inventory[type].owned += 1;
    if (ticket.status === 'unredeemed') inventory[type].available += 1;
    if (ticket.status === 'listed') inventory[type].listed += 1;
  }

  res.json({
    unredeemedCount: tickets.filter(t => t.status === 'unredeemed').length,
    inventory,
    tickets: tickets.map(t => ({
      ...t,
      ticket_type: t.ticket_type || 'main_event',
      backing_stonk: t.backing_stonk ?? t.value_stonk,
    })),
  });
});

module.exports = router;
