const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const clock = require("../testClock");
const satelliteSchedulerV45 = require("../satelliteSchedulerV45"); // V45, not legacy

// GET /api/test-clock — current status: is TEST_MODE even on, is there an
// active override, and what time is the server currently treating as "now".
// Always safe to call, even in real production — just reports the (always
// non-overridden) real time in that case.
router.get("/", requireAuth, (req, res) => {
  res.json(clock.getStatus());
});

// Runs immediate satellite reconciliation after a deliberate clock
// discontinuity (a test-clock jump or a clear-back-to-real-time), instead of
// waiting on the scheduler's normal 15-second interval. If a populated
// out-of-window satellite is found, that specific tier/price is left alone
// (not duplicated, not silently invalidated) and reported as 409 -- the
// clock change itself has already committed by the time this runs.
function reconcileOrReport(res, now) {
  try {
    satelliteSchedulerV45.reconcileNow(now);
    return null;
  } catch (err) {
    if (err.code === 'TEST_MODE_CLEANUP_REQUIRED') {
      res.status(409).json({ code: err.code, error: err.message, satellites: err.satellites });
      return err;
    }
    throw err;
  }
}

// POST /api/test-clock  { datetime: "2026-08-17T14:30:00" }
// Jumps the server's scheduling clock to that exact moment. Only has any
// effect when TEST_MODE=true — testClock.js itself refuses otherwise,
// regardless of what's posted here or who's authenticated.
router.post("/", requireAuth, (req, res) => {
  try {
    const result = clock.setOverride(req.body.datetime);
    if (reconcileOrReport(res, result)) return;
    res.json({ ok: true, now: result.toISOString() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/test-clock — back to real wall-clock time.
router.delete("/", requireAuth, (req, res) => {
  clock.clearOverride();
  const now = clock.getNow();
  if (reconcileOrReport(res, now)) return;
  res.json({ ok: true });
});

module.exports = router;
