process.env.TEST_MODE = 'true';
process.env.PORT = process.env.PORT || '4173';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/sbc-test-clock-reconcile-${Date.now()}.db`;

const assert = require('assert');
const BASE = `http://localhost:${process.env.PORT}`;

const TEST_EMAIL = 'clock-reconcile@sbc.test';
const TEST_PASSWORD = 'ClockReconcile!2026';
const TEST_DISPLAY_NAME = 'Clock Reconcile Test';

async function jsonRequest(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function getTestToken() {
  const signup = await jsonRequest(`${BASE}/api/auth/signup`, {
    method: 'POST',
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, displayName: TEST_DISPLAY_NAME }),
  });
  if (signup.res.ok) return signup.body.token;
  if (signup.res.status === 409) {
    const login = await jsonRequest(`${BASE}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    if (!login.res.ok) throw new Error(login.body.error || `Test login failed (${login.res.status})`);
    return login.body.token;
  }
  throw new Error(signup.body.error || `Test signup failed (${signup.res.status})`);
}

async function waitForHealth(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch (_) { /* server not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Server did not become healthy in time');
}

async function setClock(iso, auth) {
  return jsonRequest(`${BASE}/api/test-clock`, {
    method: 'POST', headers: auth, body: JSON.stringify({ datetime: iso }),
  });
}
async function clearClock(auth) {
  return jsonRequest(`${BASE}/api/test-clock`, { method: 'DELETE', headers: auth });
}
async function getSatellites() {
  const { body } = await jsonRequest(`${BASE}/api/satellites`);
  return body;
}
function findMorningFreeLevel(data) {
  const morning = data.categories.find(c => c.id === 'morning');
  return morning.levels.find(l => l.priceLevel === 'free');
}

(async () => {
  require('../index.js');
  await waitForHealth();
  const token = await getTestToken();
  const auth = { Authorization: `Bearer ${token}` };

  await setClock('2026-09-21T08:00:00', auth);
  let data = await getSatellites();
  assert(findMorningFreeLevel(data).status !== 'open');

  await setClock('2026-09-21T10:00:00', auth);
  data = await getSatellites();
  let morningFree = findMorningFreeLevel(data);
  assert.strictEqual(morningFree.status, 'open');

  await setClock('2026-09-21T14:00:00', auth);
  data = await getSatellites();
  assert.notStrictEqual(findMorningFreeLevel(data).status, 'open');

  await setClock('2026-09-18T10:00:00', auth);
  data = await getSatellites();
  const morningLevelsBack = data.categories.find(c => c.id === 'morning').levels;
  const openOnes = morningLevelsBack.filter(l => l.status === 'open');
  assert.strictEqual(openOnes.length, 1);
  assert.strictEqual(new Date(openOnes[0].opensAt).getUTCDay(), 5);

  await setClock('2026-09-21T10:00:00', auth);
  const clearRes = await clearClock(auth);
  assert.strictEqual(clearRes.res.status, 200);
  data = await getSatellites();
  assert(data.categories.find(c => c.id === 'morning').levels
    .filter(l => l.status === 'open').length <= 1);

  await setClock('2026-09-22T10:00:00', auth);
  data = await getSatellites();
  morningFree = findMorningFreeLevel(data);
  assert.strictEqual(morningFree.status, 'open');
  const enter = await jsonRequest(`${BASE}/api/satellites/${morningFree.id}/enter`, {
    method: 'POST', headers: auth, body: '{}',
  });
  assert.strictEqual(enter.res.status, 200);

  const backward = await setClock('2026-09-14T10:00:00', auth);
  assert.strictEqual(backward.res.status, 409);
  assert.strictEqual(backward.body.code, 'TEST_MODE_CLEANUP_REQUIRED');

  data = await getSatellites();
  const stuckLevels = data.categories.find(c => c.id === 'morning').levels;
  assert.strictEqual(stuckLevels.filter(l => l.status === 'open').length, 1);

  console.log('testClockReconciliationV1: before/during/after/backward/clear/populated-block all verified against real auth, no sleep, no supertest');
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
