'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('public/v45-exchange-history-stage2-v1.js','utf8');
const listeners={},urls=[];
const legacy={
 tm36Mine:{id:'tm36Mine',style:{},remove(){this.removed=true;}},
 tm40Recent:{id:'tm40Recent',remove(){this.removed=true;}},
 tm38Recent:{id:'tm38Recent',remove(){this.removed=true;}},
 sbcExchangeRecentTradesPreview:{id:'sbcExchangeRecentTradesPreview',remove(){this.removed=true;}},
 sbcExchangeRealRecentSales:{id:'sbcExchangeRealRecentSales',remove(){this.removed=true;}},
 recentTicketSales:{id:'recentTicketSales',style:{},remove(){this.removed=true;}}
};
let active={id:'',textContent:'RUNNER YOU OWN 2'};
const strip={};
function cell(label){const span={textContent:label};return{span,children:[],textContent:'',querySelector(sel){if(sel==='span')return span;if(sel==='#sbcExchangeHistoryButton')return this.children.find(x=>x.id==='sbcExchangeHistoryButton')||null;return null;},appendChild(x){this.children.push(x);}}}
const bidCell=cell('HIGHEST BID'),askCell=cell('LOWEST ASK'),lastCell=cell('LAST SALE'),historyCell=cell('24H SALES');lastCell.nextElementSibling=historyCell;
function value(cell,text){return{textContent:text,dataset:{},closest(sel){if(sel==='.market-summary')return strip;if(sel==='.sum')return cell;return null;}}}
const summaryBid=value(bidCell,'100'),summaryAsk=value(askCell,'110'),summaryLast=value(lastCell,'999');
const view={querySelectorAll(){return[];}};
function element(tag='div'){return{id:'',style:{},textContent:'',children:[],setAttribute(){},appendChild(x){this.children.push(x);},querySelector(){return null;}}}
const document={readyState:'loading',querySelector(sel){if(sel==='#ticketTypeSelector .active')return active;if(sel==='#summaryBid')return summaryBid;if(sel==='#summaryAsk')return summaryAsk;if(sel==='#summaryLast')return summaryLast;if(sel==='#view-exchange')return view;if(sel[0]==='#')return legacy[sel.slice(1)]||null;return null;},createElement(tag){return element(tag);},addEventListener(name,fn){listeners[name]=fn;}};
const window={__SBC_EXCHANGE_HISTORY_STAGE2_V1:false,addEventListener(name,fn){listeners[name]=fn;},fetch:async url=>{urls.push(String(url));return{ok:true,json:async()=>({rows:[{time:'2026-08-31T12:04:00Z',market:'runner',price:140,buyer:'A',seller:'B',item:'Ticket #4'}]})};}};
const context={window,document,console,encodeURIComponent,Number,String,Object,Array,RegExp,Math,Date,Promise,URLSearchParams};vm.createContext(context);vm.runInContext(source,context);
const api=window.__SBC_EXCHANGE_HISTORY_STAGE2_TEST;assert(api,'history API must exist');
assert.strictEqual(api.ensureRecentPreview,undefined,'Stage 5 must retire the inline Recent Trades preview owner');
assert.strictEqual(api.refreshRecentTrades,undefined,'Stage 5 must retire the 3-trade preview fetch path');
api.retireRedundantSurfaces();
assert(legacy.tm40Recent.removed,'persisted fills surface must be removed');
assert(legacy.tm38Recent.removed,'older recent fills surface must be removed');
assert(legacy.sbcExchangeRecentTradesPreview.removed,'Stage 3 preview surface must be removed');
assert(legacy.sbcExchangeRealRecentSales.removed,'lower recent-sales surface must be removed');
assert(legacy.tm36Mine.removed,'legacy My Orders staging container must be removed, not hidden');
assert(legacy.recentTicketSales.removed,'legacy synthetic recent-sales surface must be removed, not hidden');
assert(!source.includes('sbcExchangeStage5HistoryRetireStyle'),'Stage 5 close-out must not rely on suppression CSS');
(async()=>{
 await api.refreshLastTrade();
 assert(urls.at(-1).includes('limit=1'),'LAST TRADE must remain backend-driven');
 assert(urls.at(-1).includes('market=runner'),'LAST TRADE must remain selected-market aware');
 assert(!urls.some(u=>u.includes('limit=3')),'Stage 5 must issue no 3-trade preview request');
 assert(!source.includes('ensureRecentPreview'));
 assert(!source.includes('renderRecentTrades'));
 assert(!source.includes('refreshRecentTrades'));
 assert(!source.includes('MutationObserver'));
 assert(!/setInterval\s*\(|setTimeout\s*\(/.test(source));
 console.log('Exchange History Stage 3 Preview Retirement: PASS');
 console.log('PUBLIC_HISTORY_UI=LAST-TRADE+HISTORY-only');
 console.log('PREVIEW_REQUESTS=0');
 console.log('LEGACY_SURFACES=retired');
})();