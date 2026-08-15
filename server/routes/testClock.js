const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const clock = require("../testClock");

// GET /api/test-clock — current status: is TEST_MODE even on, is there an
// active override, and what time is the server currently treating as "now".
// Always safe to call, even in real production — just reports the (always
// non-overridden) real time in that case.
router.get("/", requireAuth, (req, res) => {
  res.json(clock.getStatus());
});

// POST /api/test-clock  { datetime: "2026-08-17T14:30:00" }
// Jumps the server's scheduling clock to that exact moment. Only has any
// effect when TEST_MODE=true — testClock.js itself refuses otherwise,
// regardless of what's posted here or who's authenticated.
router.post("/", requireAuth, (req, res) => {
  try {
    const result = clock.setOverride(req.body.datetime);
    res.json({ ok: true, now: result.toISOString() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/test-clock — back to real wall-clock time.
router.delete("/", requireAuth, (req, res) => {
  clock.clearOverride();
  res.json({ ok: true });
});

module.exports = router;
