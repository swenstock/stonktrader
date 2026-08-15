// ============================================================================
// TEST CLOCK — dev/test-only. Lets a developer manually jump the server's
// notion of "now" to an arbitrary moment, so contest scheduling behavior
// (opens, locks, resolves, freeroll windows, everything) can be checked at
// any time of day or day of week without waiting for real time to pass.
//
// SAFETY: this is a hard no-op unless TEST_MODE=true, checked in every
// function here, not just at the API route level — even if the route guard
// were ever bypassed or miswired, setOverride() itself refuses to do
// anything in a real deployment. There is no path by which this can affect
// real production scheduling.
//
// The override FLOWS FORWARD IN REAL TIME from the moment it's set — jump
// to "Monday 9:29am" and the clock then behaves exactly like production
// would, just anchored to that moment instead of today: countdowns
// actually tick down, a contest set to resolve in 60 seconds actually
// resolves 60 real seconds later. Jumping again is still instant — this
// only affects what happens while you're NOT actively jumping. A frozen
// clock was tried first and rejected: sitting at a motionless timestamp
// made every countdown on the page look permanently stuck, which is
// indistinguishable from broken to anyone watching it.
// ============================================================================

const TEST_MODE = process.env.TEST_MODE === "true";

let overrideAnchorMs = null; // the moment jumped to, or null = no override
let overrideSetAtRealMs = null; // real wall-clock time when that jump happened

function getNow() {
  if (!TEST_MODE || overrideAnchorMs === null) return new Date();
  const elapsedSinceJump = Date.now() - overrideSetAtRealMs;
  return new Date(overrideAnchorMs + elapsedSinceJump);
}

function setOverride(dateInput) {
  if (!TEST_MODE) throw new Error("Time override only works with TEST_MODE=true — this is a dev/test-only tool.");
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) throw new Error("Invalid date/time");
  overrideAnchorMs = d.getTime();
  overrideSetAtRealMs = Date.now();
  return getNow();
}

function clearOverride() {
  overrideAnchorMs = null;
  overrideSetAtRealMs = null;
}

function getStatus() {
  return {
    testModeActive: TEST_MODE,
    overridden: TEST_MODE && overrideAnchorMs !== null,
    currentNow: getNow().toISOString(),
  };
}

module.exports = { getNow, setOverride, clearOverride, getStatus, TEST_MODE };
