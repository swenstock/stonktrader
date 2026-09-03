'use strict';
const assert=require('assert');
const fs=require('fs');

const css=fs.readFileSync('public/v45-trading-workstation-v1.css','utf8');
const mobileV6=fs.readFileSync('public/v45-mobile-v6.js','utf8');

const desktopRule='#view-portfolio .sbc-quote-oe-grid-v1{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:stretch;width:100%;margin-top:14px}';
assert(css.includes(desktopRule),'desktop workstation rule must stay byte-for-byte exact');

const mobileStart=css.indexOf('@media(max-width:900px){');
const narrowStart=css.indexOf('@media(max-width:430px){');
assert(mobileStart>=0&&narrowStart>mobileStart,'mobile media blocks must remain ordered');
const mobile=css.slice(mobileStart,narrowStart);

assert(mobile.includes('#view-portfolio .sbc-quote-oe-grid-v1{grid-template-columns:minmax(0,1fr);gap:7px;margin-top:8px;align-items:start}'),
  'mobile workstation grid must be one column');
assert(mobile.includes('#view-portfolio .sbc-quote-oe-grid-v1>.sbc-quote-panel-v1{grid-column:1}'),
  'mobile quote panel must occupy the only column');
assert(!mobile.includes('grid-column:2'),'mobile media block must not strand quotes in column 2');
assert(mobile.includes('.sbc-quote-rows-v1{min-height:142px;max-height:240px}'),
  'mobile quote rows must remain scroll-height bounded');
assert(css.slice(narrowStart).includes('#view-portfolio .sbc-quote-oe-grid-v1{gap:5px}'),
  'small-phone override must continue inheriting the one-column grid');

assert(mobileV6.includes("if(quick.parentElement!==card){if(head)head.after(quick);else card.prepend(quick);}"),
  'V6 must still own Quick Trade reparenting into the chart card');
assert(mobileV6.includes("if(card)card.classList.add('mobile-chart-trade-v6')"),
  'V6 chart/trade composition remains intact');

console.log('PASS: desktop stays two-column while mobile quotes stack full-width below V6 chart/trade');
