'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'v45-lobby-install-v1.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'v45-lobby-install-v1.css'), 'utf8');

assert(js.includes("const HERO_SRC='/approved-lobby-hero-reference.png'"), 'approved Lobby hero must remain owned by the installer');
assert(js.includes('normalizeJrBrokerLabels'), 'Jr. Broker label normalization must remain');
assert(js.includes('retireLegacyRiseWidget'), 'installer must actively remove any stale Rise node encountered in the current DOM');
assert(!js.includes('MutationObserver'), 'retired Lobby installer must not keep the document-wide MutationObserver');
assert(!js.includes('setInterval'), 'retired Rise polling timer must be deleted');
assert(!js.includes('/api/leaderboard-v45/broker-race'), 'retired Rise leaderboard endpoint must not be polled by the Lobby installer');
assert(!js.includes('rise-of-turtles-approved-final.png.png'), 'retired Rise artwork must not be injected by the Lobby installer');
assert(!js.includes('raceRows('), 'retired Rise row renderer must be deleted');
assert(!js.includes('renderRace('), 'retired Rise renderer must be deleted');
assert(!js.includes('refreshRace('), 'retired Rise refresh runtime must be deleted');
assert(!js.includes('class="rise-of-turtles-live"'), 'Lobby hero markup must not recreate the Rise widget');

assert(!css.includes('.rise-of-turtles-live'), 'retired Rise container styles must be deleted');
assert(!css.includes('.rot-row'), 'retired Rise row styles must be deleted');
assert(!css.includes('.rot-approved-art'), 'retired Rise artwork styles must be deleted');
assert(!css.includes('#riseOfTurtlesViewAll'), 'retired Rise controls must be deleted');
assert(css.includes('.approved-lobby-hero-image'), 'approved Lobby hero image styling must remain');
assert(css.includes('#cleanCard-junior h3 br'), 'Jr. Broker label styling must remain');

console.log('Lobby Rise Widget Retirement V1: PASS');
