const express = require('express');
const router = express.Router();
const db = require('../db');
const reserveLedger = require('../reserveLedger');

const MAIN_EVENT_TARGET = 733332;

router.get('/', (req, res) => {
  const reserves = reserveLedger.balances();
  const freerollByCategory = db.prepare(`
    SELECT category_id, accumulated_stonk, prizes_available, total_prizes_funded_lifetime
    FROM freeroll_fund ORDER BY category_id
  `).all();

  const ticketRows = db.prepare(`
    SELECT COALESCE(ticket_type,'main_event') AS ticket_type,
      COUNT(*) AS owned_count,
      COALESCE(SUM(COALESCE(backing_stonk,value_stonk)),0) AS backing
    FROM tickets
    WHERE status IN ('unredeemed','listed')
    GROUP BY COALESCE(ticket_type,'main_event')
  `).all();
  const outstandingTickets = Object.fromEntries(ticketRows.map(r => [r.ticket_type, {
    count: Number(r.owned_count), backingStonk: Number(r.backing),
  }]));

  const committed = Math.max(0, Number(reserves.main_event_reserve || 0));
  res.json({
    mainEvent: {
      committedStonk: committed,
      targetStonk: MAIN_EVENT_TARGET,
      percentFunded: Math.max(0, Math.min(100, Number(((committed / MAIN_EVENT_TARGET) * 100).toFixed(2)))),
      secured: committed >= MAIN_EVENT_TARGET,
      note: 'Funding meter reflects reserve-ledger commitments, never ticket resale prices.',
    },
    reserves,
    freerollByCategory,
    outstandingTickets,
  });
});

module.exports = router;
