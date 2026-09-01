'use strict';

function assertDb(db) {
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') {
    throw new TypeError('db must be a sqlite database');
  }
}

function assertRedemptionId(redemptionId) {
  if (typeof redemptionId !== 'string' || !redemptionId.trim()) {
    throw new TypeError('redemptionId must be a non-empty string');
  }
}

function tableExists(db, table) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
}

function columns(db, table) {
  if (!tableExists(db, table)) return new Set();
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name));
}

function migrateActivatedBrokerDeliverySchema({ db }) {
  assertDb(db);
  if (!tableExists(db, 'sbc_activated_broker_redemptions')) {
    throw new Error('sbc_activated_broker_redemptions table must exist before delivery migration');
  }

  const before = columns(db, 'sbc_activated_broker_redemptions');
  if (before.has('delivered_at')) return { deliveredAtAdded: false };

  db.exec('BEGIN IMMEDIATE');
  try {
    const current = columns(db, 'sbc_activated_broker_redemptions');
    if (!current.has('delivered_at')) {
      db.exec('ALTER TABLE sbc_activated_broker_redemptions ADD COLUMN delivered_at TEXT');
    }
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }

  return { deliveredAtAdded: true };
}

function markActivatedBrokerDelivered(db, { redemptionId }) {
  assertDb(db);
  assertRedemptionId(redemptionId);
  migrateActivatedBrokerDeliverySchema({ db });

  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare(`
      SELECT redemption_id, account_id, status, created_at, delivered_at
      FROM sbc_activated_broker_redemptions
      WHERE redemption_id = ?
    `).get(redemptionId);

    if (!existing) {
      const err = new Error(`redemption not found: ${redemptionId}`);
      err.code = 'REDEMPTION_NOT_FOUND';
      throw err;
    }

    if (existing.status === 'delivered') {
      if (!existing.delivered_at) {
        const err = new Error(`delivered redemption missing delivered_at: ${redemptionId}`);
        err.code = 'DELIVERY_TIMESTAMP_MISSING';
        throw err;
      }
      db.exec('COMMIT');
      return {
        redemptionId: existing.redemption_id,
        accountId: existing.account_id,
        status: existing.status,
        createdAt: existing.created_at,
        deliveredAt: existing.delivered_at,
        alreadyDelivered: true,
      };
    }

    if (existing.status !== 'funded_pending_delivery') {
      const err = new Error(`unsupported redemption status: ${existing.status}`);
      err.code = 'INVALID_REDEMPTION_STATUS';
      throw err;
    }

    const result = db.prepare(`
      UPDATE sbc_activated_broker_redemptions
      SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
      WHERE redemption_id = ? AND status = 'funded_pending_delivery' AND delivered_at IS NULL
    `).run(redemptionId);

    if (Number(result.changes) !== 1) {
      const err = new Error(`redemption delivery transition failed: ${redemptionId}`);
      err.code = 'DELIVERY_TRANSITION_FAILED';
      throw err;
    }

    const delivered = db.prepare(`
      SELECT redemption_id, account_id, status, created_at, delivered_at
      FROM sbc_activated_broker_redemptions
      WHERE redemption_id = ?
    `).get(redemptionId);

    db.exec('COMMIT');
    return {
      redemptionId: delivered.redemption_id,
      accountId: delivered.account_id,
      status: delivered.status,
      createdAt: delivered.created_at,
      deliveredAt: delivered.delivered_at,
      alreadyDelivered: false,
    };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
}

module.exports = {
  migrateActivatedBrokerDeliverySchema,
  markActivatedBrokerDelivered,
};
