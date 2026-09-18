const assert = require('assert');
const { sessionUIFromBackend, findLevel, fetchSatelliteLevels } = require('../../public/session-ui-truth-v1.js');

// BEFORE a session opens
{
  const before = sessionUIFromBackend({ status: 'pending', opensAt: '2026-09-19T13:30:00Z' });
  assert.strictEqual(before.mode, 'reserve');
  assert.strictEqual(before.button, 'RESERVE NOW');
}

// DURING an open session
{
  const during = sessionUIFromBackend({ status: 'open', locksAt: '2026-09-19T17:00:00Z' });
  assert.strictEqual(during.mode, 'play');
  assert.strictEqual(during.button, 'PLAY NOW');
}

// Unknown/null level (fetch failed, or session genuinely not represented) --
// must degrade to the safe reserve default, not any other state
{
  const unknown = sessionUIFromBackend(null);
  assert.strictEqual(unknown.mode, 'reserve');
}

// findLevel wiring, with a fake authority (no window.* dependency)
{
  const fakeAuthority = {
    categoryForSession: name => name === 'MORNING MARKET' ? 'morning' : null,
    priceForTier: tier => tier === 'runner' ? 'runner' : null,
  };
  const categories = [{ id: 'morning', levels: [{ priceLevel: 'runner', status: 'open' }] }];
  const level = findLevel(categories, 'MORNING MARKET', 'runner', fakeAuthority);
  assert.strictEqual(level.status, 'open');
  // priceForTier('clerk') returns falsy from this fake authority -> findLevel's
  // own early-exit returns null (not undefined) by design.
  const noMatch = findLevel(categories, 'MORNING MARKET', 'clerk', fakeAuthority);
  assert.strictEqual(noMatch, null);
}

// fetchSatelliteLevels degrades to null (not a throw) on API failure
(async () => {
  const failingAuthority = { api: async () => { throw new Error('network down'); } };
  const result = await fetchSatelliteLevels(failingAuthority);
  assert.strictEqual(result, null);
  console.log('session-ui-truth-v1: all before/during/unknown states + wiring verified');
})();
