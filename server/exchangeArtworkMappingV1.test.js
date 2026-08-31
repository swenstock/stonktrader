'use strict';
require('./turtleTierArtStep1.test');
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const { exactV45Shell }=require('./v45ExactShell');
const runtime=fs.readFileSync('public/v45-ticket-market-v36.js','utf8');
const shell=exactV45Shell.toString('utf8');
function objectLiteral(name){
  const m=runtime.match(new RegExp('const '+name+'=(\\{[^;]+\\});'));
  assert(m, name+' mapping missing');
  return vm.runInNewContext('('+m[1]+')');
}
const display=objectLiteral('TYPE_LABELS');
const visual=objectLiteral('VISUAL_LABELS');
const start=shell.indexOf('const TIER_DATA = '),end=shell.indexOf(';\n',start);
assert(start>=0&&end>start,'assembled TIER_DATA missing');
const TIER_DATA=JSON.parse(shell.slice(start+'const TIER_DATA = '.length,end));
const ctx={TIER_DATA};vm.createContext(ctx);
for(const fn of ['getExchangeTicketVisual','exchangeVisualHTML']){
  const a=shell.indexOf('function '+fn+'('),b=shell.indexOf('\nfunction ',a+1);
  assert(a>=0&&b>a,fn+' missing from assembled shell');
  vm.runInContext(shell.slice(a,b),ctx);
}
for(const type of ['junior','trader','clerk','runner']){
  assert(display[type],type+' display label missing');
  assert(visual[type],type+' visual label missing');
  const html=ctx.exchangeVisualHTML(visual[type]);
  assert(/<img src="data:image\/png;base64,/.test(html),type+' visual must resolve to embedded PNG');
  assert(!/src=""/.test(html),type+' visual must not render empty src');
}
assert(runtime.includes("exchangeVisualHTML(artName)"),'live book/title renderer must use artName');
assert(!runtime.includes('recentTicketSales'),'retired synthetic recent renderer must not remain solely for artwork mapping');
assert.strictEqual(display.runner,'RUNNER');
assert.strictEqual(visual.runner,'Runner');
assert.strictEqual(display.junior,'JR BROKER');
assert.strictEqual(visual.junior,'Jr. StonkBroker');
console.log('Exchange Artwork Mapping V1: PASS');
console.log('Canonical visible labels remain unchanged while all four live Exchange tier visuals resolve to valid assembled-shell PNGs.');
