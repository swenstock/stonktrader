'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('public/v45-exchange-history-stage2-v1.js','utf8');
let active={id:'',textContent:'RUNNER YOU OWN 9'};
const strip={};
function cell(label){const span={textContent:label};return{span,children:[],textContent:'',querySelector(sel){if(sel==='span')return span;if(sel==='#sbcExchangeHistoryButton')return this.children.find(x=>x.id==='sbcExchangeHistoryButton')||null;return null;},appendChild(x){this.children.push(x);}}}
const bidCell=cell('HIGHEST BID'),askCell=cell('LOWEST ASK'),lastCell=cell('LAST SALE'),historyCell=cell('24H SALES');lastCell.nextElementSibling=historyCell;
function value(cell,text){return{textContent:text,dataset:{},closest(sel){if(sel==='.market-summary')return strip;if(sel==='.sum')return cell;return null;}}}
const summaryBid=value(bidCell,'100'),summaryAsk=value(askCell,'110'),summaryLast=value(lastCell,'999');
const listeners={};let lastUrl='';
const document={readyState:'loading',querySelector(sel){return{'#ticketTypeSelector .active':active,'#summaryBid':summaryBid,'#summaryAsk':summaryAsk,'#summaryLast':summaryLast}[sel]||null;},createElement(tag){return{id:'',type:'',className:'',textContent:'',style:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;}}},addEventListener(name,fn){listeners[name]=fn;}};
const window={__SBC_EXCHANGE_HISTORY_STAGE2_V1:false,addEventListener(name,fn){listeners[name]=fn;},fetch:async url=>{lastUrl=String(url);const badge=lastUrl.includes('market=badge');return{ok:true,json:async()=>({rows:[{time:'2026-08-31T12:00:00Z',market:badge?'badge':'runner',price:badge?48000:125,buyer:'A',seller:'B',item:badge?'Jr Stonk Broker Badge':'Ticket #1'}]})};}};
const context={window,document,console,encodeURIComponent,Number,String,Object,Array,RegExp,Math};vm.createContext(context);vm.runInContext(source,context);
const api=window.__SBC_EXCHANGE_HISTORY_STAGE2_TEST;assert(api,'test API must exist');
const ui=api.ensureStrip();assert(ui,'stat strip must resolve from real shell IDs');assert.strictEqual(ui.last,summaryLast,'LAST TRADE must reuse the existing #summaryLast node');assert.strictEqual(bidCell.span.textContent,'HIGHEST BID');assert.strictEqual(askCell.span.textContent,'LOWEST ASK');assert.strictEqual(lastCell.span.textContent,'LAST TRADE');assert.strictEqual(historyCell.children.length,1);assert.strictEqual(historyCell.children[0].id,'sbcExchangeHistoryButton');assert.strictEqual(historyCell.children[0].textContent,'HISTORY');
assert.strictEqual(api.activeMarket(),'runner');
(async()=>{
  await api.refreshLastTrade();
  assert(lastUrl.includes('limit=1'));assert(lastUrl.includes('market=runner'));assert.strictEqual(summaryLast.textContent,'125');assert.strictEqual(summaryLast.dataset.sbcHistoryMarket,'runner');
  active={id:'sbcBadgeMarketTab',textContent:'JR STONK BROKER BADGE'};
  await api.refreshLastTrade();
  assert(lastUrl.includes('market=badge'));assert.strictEqual(summaryLast.textContent,'48,000');assert.strictEqual(summaryLast.dataset.sbcHistoryMarket,'badge');

  const pending={};
  window.fetch=url=>new Promise(resolve=>{const u=String(url),market=u.includes('market=badge')?'badge':'runner';pending[market]=()=>resolve({ok:true,json:async()=>({rows:[{time:'2026-08-31T12:01:00Z',market,price:market==='badge'?48111:126,buyer:'A',seller:'B',item:market==='badge'?'Jr Stonk Broker Badge':'Ticket #2'}]})});});
  active={id:'',textContent:'RUNNER YOU OWN 9'};
  const lateRunner=api.refreshLastTrade();
  active={id:'sbcBadgeMarketTab',textContent:'JR STONK BROKER BADGE'};
  const currentBadge=api.refreshLastTrade();
  assert.strictEqual(typeof pending.runner,'function','Runner request must be pending');
  assert.strictEqual(typeof pending.badge,'function','Badge request must be pending');
  pending.badge();await currentBadge;
  assert.strictEqual(summaryLast.textContent,'48,111','newer Badge response must paint first');
  assert.strictEqual(summaryLast.dataset.sbcHistoryMarket,'badge');
  pending.runner();await lateRunner;
  assert.strictEqual(summaryLast.textContent,'48,111','late Runner response must not overwrite selected Badge market');
  assert.strictEqual(summaryLast.dataset.sbcHistoryMarket,'badge','stale response must not change market ownership marker');

  assert.strictEqual(typeof listeners['sbc:exchange-heartbeat'],'function','must reuse existing Exchange heartbeat');assert.strictEqual(typeof listeners['sbc:exchange-rendered'],'function','must refresh on selected-market render');assert(!source.includes('MutationObserver'));assert(!/setInterval\s*\(|setTimeout\s*\(/.test(source));
  console.log('Exchange History Stage 2 UI: PASS');
  console.log('RUNNER_LAST_TRADE=125');
  console.log('BADGE_LAST_TRADE=48,000');
  console.log('SEQUENCE_GUARD=late-runner-blocked');
  console.log('SUMMARY_LAST_NODE=reused-in-place');
  console.log('HISTORY_BUTTON=present-unwired');
})();
