'use strict';

const db = require('./db');
const reserveLedger = require('./reserveLedger');
const { issueTicket } = require('./ticketServiceV45');

const TICKET_BURN_CONFIG = Object.freeze({
  runner: Object.freeze({ burnCount: 10, targetType: 'clerk', targetBacking: 200 }),
  clerk: Object.freeze({ burnCount: 10, targetType: 'trader', targetBacking: 400 }),
  trader: Object.freeze({ burnCount: 10, targetType: 'junior', targetBacking: 1050 }),
});

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_burn_upgrades (
      burn_id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      source_ticket_type TEXT NOT NULL,
      source_ticket_ids_json TEXT NOT NULL,
      source_ticket_count INTEGER NOT NULL,
      target_ticket_type TEXT NOT NULL,
      target_ticket_id INTEGER NOT NULL REFERENCES tickets(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function burnTicketsForUpgrade({ burnId, accountId, sourceType }) {
  ensureSchema();
  if (typeof burnId !== 'string' || !burnId.trim()) throw new TypeError('burnId required');
  if (!Number.isSafeInteger(accountId) || accountId <= 0) throw new TypeError('accountId required');
  const config = TICKET_BURN_CONFIG[sourceType];
  if (!config) throw new Error(`Unsupported ticket burn source type: ${sourceType}`);

  const existing = db.prepare('SELECT * FROM ticket_burn_upgrades WHERE burn_id = ?').get(burnId);
  if (existing) {
    const err = new Error(`ticket burn already recorded: ${burnId}`);
    err.code = 'DUPLICATE_TICKET_BURN';
    throw err;
  }

  const tickets = db.prepare(`
    SELECT * FROM tickets
    WHERE account_id = ? AND ticket_type = ? AND status = 'unredeemed'
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).all(accountId, sourceType, config.burnCount);

  if (tickets.length !== config.burnCount) {
    const err = new Error(`${config.burnCount} ${sourceType} tickets required`);
    err.code = 'INSUFFICIENT_TICKETS';
    throw err;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const ticket of tickets) {
      const changed = db.prepare(`
        UPDATE tickets SET status='consumed', applied_at=?
        WHERE id=? AND account_id=? AND status='unredeemed'
      `).run(new Date().toISOString(), ticket.id, accountId);
      if (changed.changes !== 1) {
        const err = new Error(`ticket ${ticket.id} became unavailable during burn`);
        err.code = 'TICKET_BURN_CONFLICT';
        throw err;
      }
      const backing = Number(ticket.backing_stonk ?? ticket.value_stonk ?? 0);
      if (backing > 0) {
        reserveLedger.record('ticket_liability', -backing, 'ticket_burn_upgrade', {
          referenceType: 'ticket', referenceId: ticket.id,
        });
      }
    }

    const target = issueTicket({
      accountId,
      ticketType: config.targetType,
      backingStonk: config.targetBacking,
      sourceSatelliteId: null,
      fundMainEventReserve: false,
    });

    db.prepare(`
      INSERT INTO ticket_burn_upgrades
        (burn_id, account_id, source_ticket_type, source_ticket_ids_json,
         source_ticket_count, target_ticket_type, target_ticket_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      burnId,
      accountId,
      sourceType,
      JSON.stringify(tickets.map(t => t.id)),
      tickets.length,
      config.targetType,
      target.id,
    );

    db.exec('COMMIT');
    return { burnId, sourceType, sourceTicketIds: tickets.map(t => t.id), ...config, targetTicket: target };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
}

module.exports = { TICKET_BURN_CONFIG, ensureSchema, burnTicketsForUpgrade };
