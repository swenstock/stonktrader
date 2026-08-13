const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const { currentStonkUsdPriceMicros } = require("../contestScheduler");

router.get("/", requireAuth, (req, res) => {
  res.json({ stonkBalance: Number(req.account.stonk_balance.toFixed(2)) });
});

// Public — no auth needed, just the current STONK/USD reference price for the nav ticker.
router.get("/price", (req, res) => {
  res.json({ usdPrice: Number((currentStonkUsdPriceMicros() / 1e6).toFixed(4)) });
});

module.exports = router;
