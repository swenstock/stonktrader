'use strict';

const PROTOTYPE_EMAIL = 'prototype@sbc.test';
const PROTOTYPE_PASSWORD = 'SbcPrototype!2026';
const PROTOTYPE_DISPLAY_NAME = 'Prototype Trader';

async function jsonRequest(fetchImpl, url, options = {}) {
  const res = await fetchImpl(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function seedPrototypeAccount({ baseUrl, fetchImpl = fetch } = {}) {
  if (!baseUrl) throw new Error('seedPrototypeAccount requires baseUrl');

  let token = null;
  let createdUser = false;
  const signup = await jsonRequest(fetchImpl, `${baseUrl}/api/auth/signup`, {
    method: 'POST',
    body: JSON.stringify({ email: PROTOTYPE_EMAIL, password: PROTOTYPE_PASSWORD, displayName: PROTOTYPE_DISPLAY_NAME }),
  });

  if (signup.res.ok) {
    token = signup.body.token;
    createdUser = true;
  } else if (signup.res.status === 409) {
    const login = await jsonRequest(fetchImpl, `${baseUrl}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email: PROTOTYPE_EMAIL, password: PROTOTYPE_PASSWORD }),
    });
    if (!login.res.ok) throw new Error(login.body.error || `Prototype login failed (${login.res.status})`);
    token = login.body.token;
  } else {
    throw new Error(signup.body.error || `Prototype signup failed (${signup.res.status})`);
  }

  const auth = { Authorization: `Bearer ${token}` };
  const portfolios = await jsonRequest(fetchImpl, `${baseUrl}/api/portfolios`, { headers: auth });
  if (!portfolios.res.ok) throw new Error(portfolios.body.error || `Prototype portfolio lookup failed (${portfolios.res.status})`);
  const existingWeeklyFree = (Array.isArray(portfolios.body) ? portfolios.body : []).find(
    p => p?.context?.type === 'satellite' && p?.context?.tierId === 'weekly_qualifier' && p?.context?.priceLevel === 'free'
  );
  if (existingWeeklyFree) {
    console.log(`Prototype seed: already existed (portfolio #${existingWeeklyFree.id})`);
    return { createdUser, createdEntry: false, portfolioId: Number(existingWeeklyFree.id), email: PROTOTYPE_EMAIL };
  }

  const satellites = await jsonRequest(fetchImpl, `${baseUrl}/api/satellites`, { headers: auth });
  if (!satellites.res.ok) throw new Error(satellites.body.error || `Prototype satellite lookup failed (${satellites.res.status})`);
  const categories = Array.isArray(satellites.body?.categories) ? satellites.body.categories : [];
  const weekly = categories.find(c => c?.id === 'weekly_qualifier');
  const free = (Array.isArray(weekly?.levels) ? weekly.levels : []).find(l => l?.priceLevel === 'free' && l?.status === 'open' && l?.id);
  if (!free) throw new Error('Prototype seed could not find an open Weekly Qualifier free satellite');

  const entry = await jsonRequest(fetchImpl, `${baseUrl}/api/satellites/${free.id}/enter`, {
    method: 'POST', headers: auth, body: '{}',
  });
  if (!entry.res.ok) throw new Error(entry.body.error || `Prototype satellite entry failed (${entry.res.status})`);
  const portfolioId = Number(entry.body.portfolioId);
  if (!portfolioId) throw new Error('Prototype satellite entry did not return a real portfolio id');

  console.log(`Prototype seed: created (portfolio #${portfolioId})`);
  return { createdUser, createdEntry: true, portfolioId, email: PROTOTYPE_EMAIL };
}

module.exports = { seedPrototypeAccount, PROTOTYPE_EMAIL, PROTOTYPE_PASSWORD, PROTOTYPE_DISPLAY_NAME };
