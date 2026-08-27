const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const db = require("../db");
const { currentStonkUsdPriceMicros } = require("../contestScheduler");
const { getPlayerJuniorSnapshot, redeemPlayerJuniors } = require("../juniorBrokerStage4");

router.get("/", requireAuth, (req, res) => {
  res.json({ stonkBalance: Number(req.account.stonk_balance.toFixed(2)) });
});

router.get("/junior-broker", requireAuth, (req, res) => {
  try {
    res.json(getPlayerJuniorSnapshot(db, req.account.id));
  } catch (err) {
    console.error("Junior collection snapshot failed", err);
    res.status(500).json({ error: "Unable to load Junior collection" });
  }
});

router.post("/junior-broker/redeem", requireAuth, (req, res) => {
  try {
    const redemptionId = `player-ui:${req.account.id}:${crypto.randomUUID()}`;
    res.json(redeemPlayerJuniors(db, { accountId: req.account.id, redemptionId }));
  } catch (err) {
    if (err && err.code === "JUNIORS_LISTED") {
      const listed = Number(err.listedUnits || 0n);
      return res.status(409).json({
        code: "JUNIORS_LISTED",
        error: `${listed} Jr. Broker Badge${listed === 1 ? " is" : "s are"} currently listed. Cancel the listing${listed === 1 ? "" : "s"} or collect another Badge before promotion.`
      });
    }
    if (err && err.code === "INSUFFICIENT_JUNIORS") {
      return res.status(409).json({ error: "20 Juniors are required to redeem an Activated Stonk Broker" });
    }
    if (err && err.code === "INSUFFICIENT_RESERVE") {
      return res.status(503).json({ error: "Broker Reserve is temporarily unable to complete this redemption" });
    }
    console.error("Junior redemption failed", err);
    res.status(500).json({ error: "Unable to complete Junior redemption" });
  }
});

// Public — no auth needed, just the current STONK/USD reference price for the nav ticker.
router.get("/price", (req, res) => {
  res.json({ usdPrice: Number((currentStonkUsdPriceMicros() / 1e6).toFixed(4)) });
});

module.exports = router;
