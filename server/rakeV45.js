const db = require('./db');
const custodian = require('./custodian');
const reserveLedger = require('./reserveLedger');

const PLATFORM_RATE = 0.10;
const AFFILIATE_RATE = 0.05;

function money(n) {
  return Math.round((Number(n) + Number.EPSILON) * 2) / 2;
}

function referralForAccount(accountId) {
  const account = db.prepare('SELECT user_id FROM accounts WHERE id = ?').get(accountId);
  if (!account) return null;
  const user = db.prepare('SELECT referred_by_user_id FROM users WHERE id = ?').get(account.user_id);
  if (!user?.referred_by_user_id) return null;
  const referrerAccount = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(user.referred_by_user_id);
  if (!referrerAccount) return null;
  return { referredUserId: account.user_id, referrerUserId: user.referred_by_user_id, referrerAccountId: referrerAccount.id };
}

// Must run inside caller's DB transaction if it is part of contest settlement.
function settleEntryRake(entries, { entryType = 'satellite', referenceId = null } = {}) {
  let platformTake = 0;
  let affiliatePaid = 0;

  for (const entry of entries) {
    const contestPortion = Number(entry.entry_fee_paid || 0);
    const platformBase = money(contestPortion * PLATFORM_RATE);
    const affiliateSlice = money(contestPortion * AFFILIATE_RATE);
    platformTake = money(platformTake + platformBase);

    const referral = referralForAccount(entry.account_id);
    if (referral && affiliateSlice > 0) {
      affiliatePaid = money(affiliatePaid + affiliateSlice);
      custodian.credit(referral.referrerAccountId, affiliateSlice, 'referral_earning', {
        referenceType: entryType,
        referenceId: entry.id,
      });
      if (entryType === 'satellite') {
        db.prepare(`INSERT INTO referral_earnings
          (referrer_user_id, referred_user_id, satellite_entry_id, amount)
          VALUES (?, ?, ?, ?)`)
          .run(referral.referrerUserId, referral.referredUserId, entry.id, affiliateSlice);
      } else {
        db.prepare(`INSERT INTO referral_earnings
          (referrer_user_id, referred_user_id, contest_entry_id, amount)
          VALUES (?, ?, ?, ?)`)
          .run(referral.referrerUserId, referral.referredUserId, entry.id, affiliateSlice);
      }
    } else {
      platformTake = money(platformTake + affiliateSlice);
    }
  }

  if (platformTake > 0) {
    reserveLedger.record('platform_revenue', platformTake, `${entryType}_rake`, {
      referenceType: entryType,
      referenceId,
    });
  }

  return { platformTake, affiliatePaid, totalRake: money(platformTake + affiliatePaid) };
}

module.exports = { PLATFORM_RATE, AFFILIATE_RATE, money, settleEntryRake };
