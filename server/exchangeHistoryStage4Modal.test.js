'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('public/v45-exchange-history-stage2-v1.js','utf8');
const listeners={},urls=[];
function control(){return{value:'',disabled:false,textContent:'',innerHTML:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}}}
const parts={
 body:control(),status:control(),page:control(),prev:control(),next:control(),input:control(),form:control(),clear:control()
};
const modalBody={innerHTML:'',querySelector(sel){return{
 '[data-history-body]':parts.body,'[data-history-status]':parts.status,'[data-history-page]':parts.page,'[data-history-prev]':parts.prev,'[data-history-next]':parts.next,'[data-history-input]':parts.input,'[data-history-search]':parts.form,'[data-history-clear]':parts.clear
}[sel]||null;}};
const document={readyState:'loading',querySelector(){return null;},addEventListener(name,fn){listeners[name]=fn;}};
const rows1=Array.from({length:25},(_,i)=>({time:`2026-08-31T12:${String(59-i).padStart(2,'0')}:00Z`,market:'runner',price:100+i,buyer:`Buyer ${i}`,seller:`Seller ${i}`,item:`Ticket #${100+i}`}));
const rows2=[{time:'2026-08-31T11:00:00Z',market:'badge',price:48000,buyer:'Carol Gamma',seller:'Delta Desk',item:'Jr Stonk Broker Badge'}];
const rowsBob=[{time:'2026-08-31T10:00:00Z',market:'trader',price:260,buyer:'Bob Beta',seller:'Alice Alpha',item:'Ticket #77'}];
const window={__SBC_EXCHANGE_HISTORY_STAGE2_V1:false,addEventListener(name,fn){listeners[name]=fn;},SBCExchangeDialogV1:{custom(opts){assert.strictEqual(opts.title,'TRANSACTION HISTORY');assert.strictEqual(opts.width,'min(1080px,96vw)');opts.render(modalBody,{});return Promise.resolve(true);},notice(){throw new Error('custom dialog should be available');}},fetch:async url=>{const u=String(url);urls.push(u);let payload;if(u.includes('search=Bob'))payload={rows:rowsBob,limit:25,offset:0,nextOffset:null,hasMore:false,search:'Bob'};else if(u.includes('offset=25'))payload={rows:rows2,limit:25,offset:25,nextOffset:null,hasMore:false,search:''};else payload={rows:rows1,limit:25,offset:0,nextOffset:25,hasMore:true,search:''};return{ok:true,json:async()=>payload};}};
const context={window,document,console,encodeURIComponent,Number,String,Object,Array,RegExp,Math,Date,Promise,URLSearchParams};vm.createContext(context);vm.runInContext(source,context);
const api=window.__SBC_EXCHANGE_HISTORY_STAGE2_TEST;assert(api,'history test API must exist');
function tick(){return new Promise(r=>setImmediate(r));}
(async()=>{
 api.openHistory();await tick();
 assert(urls[0].includes('/api/exchange-history?'));assert(urls[0].includes('limit=25'));assert(urls[0].includes('offset=0'));assert(!urls[0].includes('search='));assert(!urls[0].includes('market='),'History must query the full ledger, not only the selected market');
 assert(parts.body.innerHTML.includes('Buyer 0'));assert(parts.body.innerHTML.includes('Ticket #100'));assert.strictEqual(parts.next.disabled,false,'first page must expose Next when hasMore=true');assert.strictEqual(parts.prev.disabled,true,'first page must disable Prev');
 parts.next.handlers.click();await tick();
 assert(urls.at(-1).includes('offset=25'),'Next must request a real second server page');assert(!urls.at(-1).includes('market='),'pagination must stay on the full ledger');assert(parts.body.innerHTML.includes('Carol Gamma'));assert(parts.body.innerHTML.includes('Jr Stonk Broker Badge'));assert.strictEqual(parts.next.disabled,true,'last page must disable Next');assert.strictEqual(parts.prev.disabled,false,'second page must enable Prev');
 parts.input.value='Bob';parts.form.handlers.submit({preventDefault(){}});await tick();
 const searchUrl=urls.at(-1);assert(searchUrl.includes('offset=0'),'new search must reset to first page');assert(searchUrl.includes('search=Bob'),'account search must be sent to the server');assert(!searchUrl.includes('market='),'account search must search the complete ledger');assert(parts.body.innerHTML.includes('Bob Beta'),'server search result must render');assert(!parts.body.innerHTML.includes('Carol Gamma'),'search result must replace prior page');assert(parts.status.textContent.includes('Bob'));
 assert(parts.body.innerHTML.includes('<td>Bob Beta</td>'));assert(parts.body.innerHTML.includes('<td>Alice Alpha</td>'));assert(!parts.body.innerHTML.includes('account_id'));assert(!parts.body.innerHTML.includes('wallet'));
 assert(!source.includes('MutationObserver'));assert(!/setInterval\s*\(|setTimeout\s*\(/.test(source));
 console.log('Exchange History Stage 4 Modal: PASS');
 console.log('PAGE_1_ROWS=25');
 console.log('PAGE_2_REQUEST=offset-25');
 console.log('SEARCH_REQUEST=Bob-server-side');
 console.log('SEARCH_RESULT=Bob-Beta');
 console.log('FULL_LEDGER=no-market-filter');
 console.log('COLUMNS=Time-Market-Price-Buyer-Seller-TicketBadge');
})();
