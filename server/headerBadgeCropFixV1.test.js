'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { exactV45Shell } = require('./v45ExactShell');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public', 'v45-lobby-install-v1.css'), 'utf8');
const art = fs.readFileSync(path.join(root, 'public', 'stonkbroker-reward-crop.png'));
const shell = exactV45Shell.toString('utf8');

assert(css.includes('header.top > img.avatar{object-position:center top}'), 'header Badge crop must anchor to top');
assert(shell.includes('.avatar{width:40px;height:40px;margin-left:18px;border-radius:7px;object-fit:cover;'), 'exact shell must still use cover framing for header avatar');
assert(shell.includes('<img class="avatar" src="data:image/png;base64,'), 'exact shell header avatar target missing');

assert(art.length > 24 && art.toString('ascii', 1, 4) === 'PNG', 'canonical Badge art must be a PNG');
const width = art.readUInt32BE(16);
const height = art.readUInt32BE(20);
assert.strictEqual(width, 330, 'canonical Badge art width changed unexpectedly');
assert.strictEqual(height, 430, 'canonical Badge art height changed unexpectedly');
assert(height > width, 'portrait Badge art must remain taller than the square header frame');

console.log('Header Badge Crop Fix V1: PASS');
