const express = require("express");
const router = express.Router();
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");

router.get("/", requireAuth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.userId);

  const referredCount = db
    .prepare("SELECT COUNT(*) as n FROM users WHERE referred_by_user_id = ?")
    .get(user.id).n;

  const earnings = db
    .prepare(
      `SELECT referral_earnings.amount, referral_earnings.created_at, users.display_name as referred_name
       FROM referral_earnings
       JOIN users ON users.id = referral_earnings.referred_user_id
       WHERE referrer_user_id = ?
       ORDER BY referral_earnings.created_at DESC
       LIMIT 50`
    )
    .all(user.id);

  const totalEarned = db
    .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM referral_earnings WHERE referrer_user_id = ?")
    .get(user.id).total;

  res.json({
    code: user.referral_code,
    referredCount,
    totalEarned,
    recentEarnings: earnings,
  });
});

module.exports = router;
