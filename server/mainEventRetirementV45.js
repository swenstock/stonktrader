
'use strict';

const db = require('./db');
const custodian = require('./custodian');

function retireOpenMainEvents() {
  const open = db.prepare("SELECT * FROM contests WHERE status='open' ORDER BY id").all();
  let cashRefunds = 0;
  let ticketsRestored = 0;
  let entriesRetired = 0;

  for (const contest of open) {
    const entries = db.prepare('SELECT * FROM contest_entries WHERE contest_id=? ORDER BY id').all(contest.id);
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const entry of entries) {
        entriesRetired += 1;
        if (entry.paid_with_ticket_id) {
          const info = db.prepare(`UPDATE tickets
            SET status='unredeemed', applied_to_contest_id=NULL, applied_at=NULL
            WHERE id=? AND status='applied' AND applied_to_contest_id=?`).run(entry.paid_with_ticket_id, contest.id);
          ticketsRestored += Number(info.changes || 0);
        } else if (entry.entry_fee_paid > 0) {
          custodian.credit(entry.account_id, entry.entry_fee_paid, 'main_event_retirement_refund', {
            referenceType: 'contest', referenceId: contest.id,
          });
          cashRefunds += entry.entry_fee_paid;
        }
      }
      db.prepare("UPDATE contests SET status='retired', resolved_at=? WHERE id=? AND status='open'").run(new Date().toISOString(), contest.id);
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw err;
    }
  }

  const stale = db.prepare(`UPDATE pending_allocations
    SET status='failed', fail_reason='Main Event retired'
    WHERE target_type='contest' AND target_tier_id='main_event' AND status='pending'`).run();

  return {
    contestsRetired: open.length,
    entriesRetired,
    cashRefundedStonk: cashRefunds,
    ticketsRestored,
    pendingAllocationsFailed: Number(stale.changes || 0),
  };
}

module.exports = { retireOpenMainEvents };
