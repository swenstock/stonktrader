const db = require('./db');
const reserveLedger = require('./reserveLedger');

const TICKET_TYPES = new Set(['runner','clerk','trader','junior']);

function normalizeType(type) {
  const t = String(type || '').toLowerCase();
  if (!TICKET_TYPES.has(t)) throw new Error(`Unknown ticket type: ${type}`);
  return t;
}

function issueTicket({ accountId, ticketType, backingStonk, sourceSatelliteId = null, fundMainEventReserve = false }) {
  if (fundMainEventReserve) { const err = new Error('Main Event ticket funding is retired'); err.code='MAIN_EVENT_RETIRED'; throw err; }
  const type = normalizeType(ticketType);
  const backing = Number(backingStonk);
  if (!(backing > 0)) throw new Error('Ticket backing must be positive');
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(accountId);
  if (!account) throw new Error(`Unknown account: ${accountId}`);

  const info = db.prepare(`INSERT INTO tickets
    (account_id, source_satellite_id, value_stonk, backing_stonk, ticket_type, status)
    VALUES (?, ?, ?, ?, ?, 'unredeemed')`)
    .run(accountId, sourceSatelliteId, backing, backing, type);

  reserveLedger.record('ticket_liability', backing, 'ticket_issued', {
    referenceType: 'ticket', referenceId: info.lastInsertRowid,
  });

  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(info.lastInsertRowid);
}

function getOwnedTicket(ticketId, accountId) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket || ticket.account_id !== accountId) return null;
  return ticket;
}

function consumeTicket({ ticketId, accountId, appliedToContestId = null, appliedToSatelliteId = null }) {
  const ticket = getOwnedTicket(ticketId, accountId);
  if (!ticket) throw new Error('Ticket not found');
  if (ticket.status !== 'unredeemed') throw new Error('Ticket is not available to redeem');
  if (appliedToContestId != null) { const err = new Error('Main Event ticket redemption is retired'); err.code='MAIN_EVENT_RETIRED'; throw err; }
  if (!appliedToSatelliteId) {
    throw new Error('Specify a satellite redemption target');
  }

  db.prepare(`UPDATE tickets SET status='applied', applied_to_contest_id=?, applied_to_satellite_id=?, applied_at=? WHERE id=?`)
    .run(appliedToContestId, appliedToSatelliteId, new Date().toISOString(), ticket.id);

  const backing = Number(ticket.backing_stonk ?? ticket.value_stonk ?? 0);
  if (backing > 0) {
    reserveLedger.record('ticket_liability', -backing, 'ticket_redeemed', {
      referenceType: 'ticket', referenceId: ticket.id,
    });
  }
  return { ...ticket, status: 'applied', applied_to_contest_id: appliedToContestId, applied_to_satellite_id: appliedToSatelliteId };
}

function transferTicket({ ticketId, fromAccountId, toAccountId }) {
  const ticket = getOwnedTicket(ticketId, fromAccountId);
  if (!ticket) throw new Error('Ticket not found');
  if (!['unredeemed','listed'].includes(ticket.status)) throw new Error('Ticket is not transferable');
  if (!db.prepare('SELECT id FROM accounts WHERE id = ?').get(toAccountId)) throw new Error('Destination account not found');
  db.prepare("UPDATE tickets SET account_id=?, status='unredeemed' WHERE id=?").run(toAccountId, ticket.id);
  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id);
}

module.exports = { TICKET_TYPES, issueTicket, consumeTicket, transferTicket, getOwnedTicket };
