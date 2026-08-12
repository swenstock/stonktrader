const express = require("express");
const router = express.Router();
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");

router.get("/", requireAuth, (req, res) => {
  const tickets = db
    .prepare("SELECT * FROM tickets WHERE account_id = ? ORDER BY created_at DESC")
    .all(req.account.id);
  res.json({
    unredeemedCount: tickets.filter((t) => t.status === "unredeemed").length,
    tickets,
  });
});

module.exports = router;
