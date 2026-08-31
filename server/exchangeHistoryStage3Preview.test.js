'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('public/v45-exchange-history-stage2-v1.js','utf8');
let active={id:'',textContent:'RUNNER YOU OWN 2'};
const strip={};
function cell(label){const span={textContent:label};return{span,children:[],textContent:'',querySelector(sel){if(sel==='span')return span;if(sel==='#sbcExchangeHistoryButton')return this.children.find(x=>x.id==='sbcExchangeHistoryButton')||null;return null;},appendChild(x){this.children.push(x);}}}
const bidCell=cell('HIGHEST BID'),askCell=cell('LOWEST ASK'),lastCell=cell('LAST SALE'),historyCell=cell('24H SALES');lastCell.nextElementSibling=historyCell;
function value(cell,text){return{textContent:text,dataset:{},closest(sel){if(sel==='.market-summary')return strip;if(sel==='.sum')return cell;return null;}}}
const summaryBid=value(bidCell,'100'),summaryAsk=value(askCell,'110'),summaryLast=value(lastCell,'999');
const grid={id:'grid'},panel={children:[grid],querySelector(sel){if(sel==='.ticket-market-grid')return grid;if(sel==='#sbcExchangeRecentTradesPreview')return this.children.find(x=>x.id==='sbcExchangeRecentTradesPreview')||null;return null;},insertBefore(node,ref){const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,node);node.parentNode=this;}};
const bidBook={closest(sel){return sel==='section.panel'?panel:null;}},askBook={closest(sel){return sel==='section.panel'?panel:null;}};
const listeners={},urls=[];
function element(){return{id:'',dataset:{},style:{},textContent:'',innerHTML:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},querySelector(sel){if(sel==='[data-sbc-recent-trades-body]')return this.body||(this.body={innerHTML:''});return null;}}}
const document={readyState:'loading',querySelector(sel){if(sel==='#sbcExchangeRecentTradesPreview')return panel.children.find(x=>x.id==='sbcExchangeRecentTradesPreview')||null;return{'#ticketTypeSelector .active':active,'#summaryBid':summaryBid,'#summaryAsk':summaryAsk,'#summaryLast':summaryLast,'#bidBook':bidBook,'#askBook':askBook}[sel]||null;},createElement(){return element();},addEventListener(name,fn){listeners[name]=fn;}};
const rows=[
 {time:'2026-08-31T12:04:00Z',market:'runner',price:140,buyer:'A',seller:'B',item:'Ticket #4'},
 {time:'2026-08-31T12:03:00Z',market:'runner',price:130,buyer:'C',seller:'D',item:'Ticket #3'},
 {time:'2026-08-31T12:02:00Z',market:'runner',price:120,buyer:'E',seller:'F',item:'Ticket #2'},
 {time:'2026-08-31T12:01:00Z',market:'runner',price:110,buyer:'G',seller:'H',item:'Ticket #1'},
];
const window={__SBC_EXCHANGE_HISTORY_STAGE2_V1:false,addEventListener(name,fn){listeners[name]=fn;},fetch:async url=>{urls.push(String(url));return{ok:true,json:async()=>({rows})};}};
const context={window,document,console,encodeURIComponent,Number,String,Object,Array,RegExp,Math,Date,Promise};vm.createContext(context);vm.runInContext(source,context);
const api=window.__SBC_EXCHANGE_HISTORY_STAGE2_TEST;assert(api);
const preview=api.ensureRecentPreview();assert(preview,'preview must resolve from actual bid/ask panel anchors');assert.strictEqual(panel.children[0],preview,'preview must be inserted immediately before ticket-market-grid');assert.strictEqual(panel.children[1],grid);
(async()=>{
 const result=await api.refreshRecentTrades();
 assert.strictEqual(result.length,3,'preview request must expose exactly 3 rows');
 const url=urls.at(-1);assert(url.includes('/api/exchange-history?'));assert(url.includes('limit=3'));assert(url.includes('offset=0'));assert(url.includes('market=runner'));assert(!url.includes('search='),'Stage 3 preview must not send search');
 const html=preview.body.innerHTML;
 assert.strictEqual((html.match(/class="sbc-recent-trade"/g)||[]).length,3,'render must contain exactly three trade cards');
 assert(html.indexOf('Ticket #4')<html.indexOf('Ticket #3')&&html.indexOf('Ticket #3')<html.indexOf('Ticket #2'),'rows must remain newest-first');
 assert(!html.includes('Ticket #1'),'fourth row must not render');
 assert(!html.includes('buyer')&&!html.includes('seller')&&!html.includes('A → B'),'compact preview must remain anonymous');
 assert.strictEqual(preview.dataset.sbcHistoryMarket,'runner');
 assert(!source.includes('MutationObserver'));assert(!/setInterval\s*\(|setTimeout\s*\(/.test(source));
 console.log('Exchange History Stage 3 Preview: PASS');
 console.log('PREVIEW_POSITION=before-ticket-market-grid');
 console.log('PREVIEW_COUNT=3');
 console.log('PREVIEW_ORDER=newest-first');
 console.log('PREVIEW_SEARCH=none');
 console.log('PREVIEW_IDENTITIES=hidden');
})();
