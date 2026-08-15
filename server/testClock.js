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
// The override is FROZEN (not "flowing forward in real time") — jump
// directly to "Monday 9:30:01am" to check the just-opened state, then jump
// again to "Monday 3:29pm" to check about-to-lock, without waiting hours
// of real time in between. The scheduler's own tick() logic (which runs
// automatically every 15s regardless) correctly catches up and resolves
// anything that "should have" already happened by the newly-set time, the
// same way it would if that much real time had actually elapsed.
// ============================================================================

const TEST_MODE = process.env.TEST_MODE === "true";

let overrideMs = null; // milliseconds since epoch, or null = use real time

function getNow() {
  if (!TEST_MODE || overrideMs === null) return new Date();
  return new Date(overrideMs);
}

function setOverride(dateInput) {
  if (!TEST_MODE) throw new Error("Time override only works with TEST_MODE=true — this is a dev/test-only tool.");
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) throw new Error("Invalid date/time");
  overrideMs = d.getTime();
  return getNow();
}

function clearOverride() {
  overrideMs = null;
}

function getStatus() {
  return {
    testModeActive: TEST_MODE,
    overridden: TEST_MODE && overrideMs !== null,
    currentNow: getNow().toISOString(),
  };
}

module.exports = { getNow, setOverride, clearOverride, getStatus, TEST_MODE };
