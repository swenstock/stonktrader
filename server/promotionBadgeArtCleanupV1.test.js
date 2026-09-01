'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exactV45Shell } = require('./v45ExactShell');

const root = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'public', 'v45-lobby-install-v1.js'), 'utf8');
const stage4 = fs.readFileSync(path.join(root, 'public', 'v45-stage4-junior-ui.js'), 'utf8');
const art = fs.readFileSync(path.join(root, 'public', 'stonkbroker-reward-crop.png'));
const shell = exactV45Shell.toString('utf8');

assert.strictEqual(
  crypto.createHash('sha256').update(art).digest('hex'),
  'c750ef59c5da3f4cd68042911d18bc790916e11ef1e07eace3a17282352db077',
  'canonical Jr. Stonk Broker Badge human art must remain the approved top-of-ladder asset'
);
assert(ui.includes("const JR_STONK_BROKER_BADGE_ART='/stonkbroker-reward-crop.png?v=1'"), 'Lobby installer must use canonical human Badge art');
assert(ui.includes("$('header.top > img.avatar',root)"), 'header Badge avatar target missing');
assert(ui.includes("steps[3]?.querySelector(':scope > img')"), 'GET PROMOTED step Badge art target missing');
assert(ui.includes("$$('.tutorial-replay',root).forEach(el=>el.remove())"), 'top help/tutorial replay button must be removed');
assert(stage4.includes("const BADGE_ICON_SRC='/stonkbroker-reward-crop.png?v=1'"), 'private Badge collection must use the same canonical human art');

assert.strictEqual((shell.match(/class="tutorial-replay"/g)||[]).length, 1, 'exact shell should expose exactly one legacy tutorial replay button for cleanup');
assert(shell.includes('<img class="avatar" src="data:image/png;base64,'), 'exact shell legacy header avatar target missing');
const how = shell.indexOf('id="how"');
const step4 = shell.indexOf('<article class="step own">', how);
assert(how >= 0 && step4 > how, 'exact shell GET PROMOTED source step missing');
assert(shell.slice(step4, step4 + 5000).includes('<img src="data:image/png;base64,'), 'exact shell GET PROMOTED legacy image target missing');

assert(ui.includes("const JR_VISIBLE='JR. BROKER'"), 'JR. BROKER turtle terminology must remain distinct');
assert(!ui.includes("JR_STONK_BROKER_BADGE_ART='/server/turtle_art_v1/junior.png'"), 'human Badge art must never be replaced by Jr. Broker turtle art');

console.log('Promotion Badge Art Cleanup V1: PASS');
