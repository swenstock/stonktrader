'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const uiPath = path.join(root, 'public', 'v45-lobby-install-v1.js');
const cssPath = path.join(root, 'public', 'v45-lobby-install-v1.css');
const artPath = path.join(root, 'public', 'approved-lobby-hero-widget-free.png');
const ui = fs.readFileSync(uiPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const art = fs.readFileSync(artPath);

assert.strictEqual(
  crypto.createHash('sha256').update(art).digest('hex'),
  '591290d43f43d5f67c92c265d6ad8237907aba2d8cdd72315b787956f7c2cac5',
  'Lobby must use the exact approved widget-free hero asset'
);
assert.strictEqual(art.toString('ascii', 1, 4), 'PNG', 'approved Lobby hero must remain PNG');
assert.strictEqual(art.readUInt32BE(16), 1536, 'approved Lobby hero width changed');
assert.strictEqual(art.readUInt32BE(20), 1024, 'approved Lobby hero height changed');

assert(ui.includes("const HERO_SRC='/approved-lobby-hero-widget-free.png'"), 'Lobby installer must point at approved widget-free hero');
assert(ui.includes('retireLobbyStatementStrip'), 'Lobby statement-strip retirement owner missing');
assert(css.includes('width:96%;aspect-ratio:16/9;margin:0 auto'), 'desktop Lobby hero must be slightly smaller and centered');
assert(css.includes('height:100%;object-fit:cover;object-position:center center'), 'approved hero must retain its compact 16:9 display framing');
assert(css.includes('header.top > img.avatar{object-position:center top}'), 'PR #279 header Badge crop fix must remain intact');

let removed = false;
const statement = { remove(){ removed = true; } };
const document = {
  readyState: 'loading',
  querySelector(selector){ return selector === '.statement' ? statement : null; },
  querySelectorAll(){ return []; },
  addEventListener(){},
};
const window = {};
vm.runInNewContext(ui, { window, document, setTimeout(){}, console }, { filename: 'v45-lobby-install-v1.js' });
const api = window.__SBC_LOBBY_INSTALL_V1_TEST;
assert(api && typeof api.retireLobbyStatementStrip === 'function', 'statement retirement must be exposed for behavioral verification');
api.retireLobbyStatementStrip(document);
assert.strictEqual(removed, true, 'redundant three-box Lobby statement strip must actually be removed');

console.log('Lobby Hero Widget-Free V1: PASS');
