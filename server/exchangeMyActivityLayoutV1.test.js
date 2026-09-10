'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('public/v45-exchange-my-activity-v1.js', 'utf8');

function between(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Unable to extract ${start}`);
  return source.slice(a, b);
}

function styleOf(html, needle) {
  const i = html.indexOf(needle);
  assert(i >= 0, `Missing ${needle}`);
  const start = html.lastIndexOf('style="', i);
  const end = html.indexOf('"', start + 7);
  assert(start >= 0 && end > start, `Missing style for ${needle}`);
  return html.slice(start + 7, end);
}

const ensurePanelFn = between(src, 'function ensurePanel()', '\nfunction statusStyle');
const rowHtmlFn = between(src, 'function rowHtml(o)', '\nfunction render()');

const panelMatch = ensurePanelFn.match(/data-activity-body style="([^"]+)"/);
assert(panelMatch, 'Activity body inline style must be present');
assert(panelMatch[1].includes('max-height:390px'), 'Activity body must retain bounded vertical height');
assert(panelMatch[1].includes('overflow-y:auto'), 'Activity body must retain vertical scrolling');
assert(panelMatch[1].includes('overflow-x:hidden'), 'Activity body must suppress horizontal scrollbar after row grid is made intrinsically fit-safe');
assert(!/(^|;)overflow:auto(?:;|$)/.test(panelMatch[1]), 'Activity body must not retain two-axis overflow:auto');
console.log('PASS: activity body keeps vertical scrolling without horizontal scrollbar ownership');

const context = {};
vm.createContext(context);
vm.runInContext(`
  function esc(s){return String(s??'')}
  function fmt(n){return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:1})}
  function when(){return 'Sep 9, 6:41 PM'}
  function eventTime(o){return o.createdAt}
  function rowKey(){return 'row-key'}
  function statusStyle(){return 'color:#fff'}
  function sideText(o){return o.side==='bid'?'BID':'OFFER'}
  ${rowHtmlFn}
  this.rowHtml=rowHtml;
`, context);

const working = context.rowHtml({
  label:'Jr Broker Ticket', side:'bid', status:'working', id:123456,
  ticketId:987654, price:12345, createdAt:'2026-09-09T18:41:00-06:00', isMine:true
});
const filled = context.rowHtml({
  label:'Runner Ticket', side:'offer', status:'filled', id:333,
  ticketId:444, price:7777, createdAt:'2026-09-09T18:41:00-06:00', isMine:false
});

for (const text of ['Jr Broker Ticket','WORKING','12,345 STONK','Sep 9, 6:41 PM','EDIT']) {
  assert(working.includes(text), `Working row must retain visible field/action: ${text}`);
}
assert(working.includes('Ticket #987654'), 'Working row must retain ticket id detail');
for (const text of ['Runner Ticket','FILLED','7,777 STONK','Sep 9, 6:41 PM','DETAILS ›']) {
  assert(filled.includes(text), `Filled row must retain visible field/action: ${text}`);
}
console.log('PASS: all five activity fields and EDIT/DETAILS actions remain rendered');

const articleStyle = styleOf(working, 'data-activity-row');
assert(articleStyle.includes('display:grid'), 'Activity row must remain a grid');
const grid = articleStyle.match(/grid-template-columns:([^;]+)/);
assert(grid, 'Activity row grid-template-columns must be present');
const tracks = grid[1].trim().split(/\s+(?=minmax\()/);
assert.strictEqual(tracks.length, 5, 'Activity row must retain exactly five grid tracks');
assert(tracks.every(t => /^minmax\(0,/.test(t)), `Every activity track must have a zero intrinsic minimum; got: ${grid[1]}`);
assert(articleStyle.includes('gap:8px'), 'Activity row must use the compact 8px desktop gap');
assert(articleStyle.includes('min-width:0'), 'Activity row must explicitly permit grid shrinkage');
assert(!/minmax\((?:170|90|120|125)px/.test(grid[1]), 'Old fixed minimum-width tracks must be retired');
console.log('PASS: five-column grid is intrinsically fit-safe instead of relying on fixed minimum widths');

assert(working.includes('style="min-width:0"'), 'Instrument/details cell must be shrink-safe');
assert(working.includes('style="font-size:10px;font-weight:900'), 'Status cell must retain compact readable styling');
assert(working.includes('style="font-size:11px;min-width:0"'), 'Price cell must be shrink-safe');
assert(working.includes('style="color:#8fa7b5;font-size:10px;min-width:0"'), 'Date cell must be shrink-safe');
assert(working.includes('style="text-align:right;min-width:0"'), 'Action cell must be shrink-safe');
assert(working.includes('width:100%;box-sizing:border-box'), 'EDIT button must fit inside its grid track rather than overflow it');
console.log('PASS: each row cell can shrink and the EDIT action remains inside its track');

console.log('Exchange My Activity Layout V1: PASS');
