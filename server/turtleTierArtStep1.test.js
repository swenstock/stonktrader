'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exactV45Shell, TURTLE_TIER_ART_KEYS } = require('./v45ExactShell');

const ROOT = __dirname;
const ART_DIR = path.join(ROOT, 'turtle_art_v1');
const KEYS = ['freeroll','runner','clerk','trader','junior'];
const OLD_SHA256 = new Set([
  '691291c3a3fbb74ab7eeed5ba7e09cf4c891c76b41ebd0d6c7eb67f000657bb0',
  '1ce4f441f8bf946f8bf63d74b04334431bcef1a7700ada7ed0c673e6ccd55662',
  '23a95470d704f41964d5b2d739a5b680b8d8b5c4bc50c64adf2150cf9b023c3f',
  '5de3a66ae34c0e42af10462947981211c4b03af17a2c6629a3999a2985fa9483',
]);
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
function pngDimensions(buf){
  assert.strictEqual(buf.toString('ascii',1,4),'PNG','asset must be PNG');
  assert.strictEqual(buf.readUInt32BE(12),0x49484452,'PNG must start with IHDR');
  return [buf.readUInt32BE(16),buf.readUInt32BE(20)];
}
function tierBlock(source){
  const start=source.indexOf('const TIER_DATA = {');
  assert(start>=0,'canonical TIER_DATA missing');
  const end=source.indexOf(';\n',start);
  assert(end>start,'canonical TIER_DATA terminator missing');
  return source.slice(start,end);
}
function tierArt(block,key,index){
  const next=KEYS[index+1];
  const start=block.indexOf(`"${key}":`);
  const end=next?block.indexOf(`"${next}":`,start+key.length+3):block.length;
  assert(start>=0&&end>start,`${key} segment missing`);
  const seg=block.slice(start,end);
  const m=seg.match(/"art"\s*:\s*"data:image\/png;base64,([^"]+)"/g)||[];
  assert.strictEqual(m.length,1,`${key} must have exactly one art field`);
  const b64=m[0].match(/base64,([^"]+)/)[1];
  return Buffer.from(b64,'base64');
}
function floorCardArt(source,key){
  const start=source.indexOf(`id="cleanCard-${key}"`);
  const end=source.indexOf('</article>',start);
  assert(start>=0&&end>start,`${key} floor card missing`);
  const seg=source.slice(start,end);
  const m=seg.match(/<img\s+src="data:image\/png;base64,([^"]+)"/g)||[];
  assert.strictEqual(m.length,1,`${key} floor card must have exactly one embedded image`);
  const b64=m[0].match(/base64,([^"]+)/)[1];
  return Buffer.from(b64,'base64');
}

assert.deepStrictEqual(TURTLE_TIER_ART_KEYS,KEYS,'patch key order changed');
const shell=exactV45Shell.toString('utf8');
assert.strictEqual((shell.match(/const TIER_DATA = \{/g)||[]).length,1,'there must be one canonical TIER_DATA owner');
const block=tierBlock(shell);
const embeddedHashes=[];
for(let i=0;i<KEYS.length;i+=1){
  const key=KEYS[i];
  const file=fs.readFileSync(path.join(ART_DIR,`${key}.png`));
  assert.deepStrictEqual(pngDimensions(file),[240,241],`${key} dimensions changed`);
  const embedded=tierArt(block,key,i);
  assert.strictEqual(sha256(embedded),sha256(file),`${key} embedded art differs from canonical file`);
  const floorCard=floorCardArt(shell,key);
  assert.strictEqual(sha256(floorCard),sha256(file),`${key} Trading Floor card differs from canonical file`);
  assert(!OLD_SHA256.has(sha256(file)),`${key} still resolves to legacy art`);
  embeddedHashes.push(sha256(embedded));
}
assert.strictEqual(new Set(embeddedHashes).size,KEYS.length,'the five turtle tier assets must be distinct');

assert(/TIER_DATA\[[^\]]+\]\.art|TIER_DATA\[[^\]]+\]\?\.art|TIER_DATA\.[A-Za-z]+\.art/.test(shell), 'no in-shell TIER_DATA art consumer found');
const desktopIcons=fs.readFileSync(path.join(ROOT,'..','public','v45-desktop-icons.js'),'utf8');
assert(desktopIcons.includes("TIER_DATA[key]?.art"),'desktop icon consumer no longer reads canonical TIER_DATA art');
const desktopCss=fs.readFileSync(path.join(ROOT,'..','public','v45-desktop-icons.css'),'utf8');
assert(desktopCss.includes('.floor-clean-card>img{'),'Trading Floor portrait override missing');
assert(desktopCss.includes('height:auto!important;'),'Trading Floor portraits must use natural height');
assert(desktopCss.includes('aspect-ratio:auto!important;'),'Trading Floor portraits must not use legacy square aspect ratio');
assert(desktopCss.includes('object-fit:contain!important;'),'Trading Floor portraits must render the full canonical image');
const serverIndex=fs.readFileSync(path.join(ROOT,'index.js'),'utf8');
assert(serverIndex.includes('/v45-desktop-icons.css?v=2'),'Trading Floor portrait stylesheet cache-buster must be v2');
assert(serverIndex.includes('desktopIcons: "v2"'),'health metadata must report desktop icon assets v2');

console.log('Turtle Tier Art Step 1: PASS');
console.log('CANONICAL_OWNER=TIER_DATA-only');
console.log('TIERS='+KEYS.join(','));
console.log('DIMENSIONS=240x241-all-five');
console.log('DISTINCT_ASSETS=5');
console.log('LEGACY_HASHES=0');
console.log('TRADING_FLOOR_CARDS=canonical-all-five');
console.log('TRADING_FLOOR_RENDER=natural-full-image');
console.log('TRADING_FLOOR_CSS_CACHE_BUSTER=v2');
console.log('EXTERNAL_CONSUMER=v45-desktop-icons');
