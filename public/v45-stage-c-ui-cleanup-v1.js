(()=>{
'use strict';
if(window.__sbcStageCUiCleanupV1)return;window.__sbcStageCUiCleanupV1=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let refreshTimer=null,portfolioSyncTimer=null,lastTradeSignature=null,forcePortfolioSync=false,portfolioSyncBusy=false;
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>`$${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const when=v=>{if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});};
const qtyText=o=>o?.quantity!=null?Number(o.quantity).toLocaleString(undefined,{maximumFractionDigits:4}):o?.percent!=null?`${Number(o.percent)}% SIZE`:'—';
const orderPrice=o=>{const t=String(o?.orderType||'market');if(t==='limit')return `LMT ${money(o.limitPrice)}`;if(t==='stop')return `STP ${money(o.stopPrice)}`;if(t==='stop_limit')return `STP ${money(o.stopPrice)} / LMT ${money(o.limitPrice)}`;return 'MKT @ OPEN';};
function ensureExchangeQaHelpers(){
  const specs=[
    ['__sbcExchangeDialogV1','data-sbc-exchange-dialog','/v45-exchange-dialog-v1.js?v=1'],
    ['__sbcTestStonkFaucetV1','data-sbc-test-stonk-direct','/v45-test-stonk-faucet-v1.js?v=2'],
    ['__sbcExchangeOwnOrdersV1','data-sbc-exchange-own-orders','/v45-exchange-own-orders-v1.js?v=8']
  ];
  for(const [flag,attr,src] of specs){if(window[flag]||document.querySelector(`script[${attr}]`))continue;const s=document.createElement('script');s.src=src;s.setAttribute(attr,'1');document.head.appendChild(s);}
}
function recentRow(e){const side=String(e.side||'buy').toLowerCase()==='sell'?'sell':'buy',label=side.toUpperCase();return `<article class="blotter-row-v15 ${side}" ${e.cancelled?`data-stage-c-cancelled="${esc(e.id)}"`:''}><b class="blotter-side-v15">${label}</b><strong>${esc(e.symbol||'—')}</strong><span>${esc(e.qty||'—')}</span><span>${esc(e.price||'—')}</span><span><em>${esc(e.status||'')}</em>${e.at?`<small>${esc(when(e.at))}</small>`:''}</span><span class="blotter-actions-v15"></span></article>`;}
function renderRecentWithCancelled(){
  const api=window.SBCAdvancedOrdersV15,root=$('#view-portfolio .orders-activity-blotter-v15 .blotter-root-v15'),body=$('[data-panel="recent"] .blotter-body-v15',root);
  if(!api?.cache||!body)return;
  const trades=Array.isArray(api.cache.trades)?api.cache.trades:[],orders=Array.isArray(api.cache.orders)?api.cache.orders:[];
  const cancelled=orders.filter(o=>String(o.status)==='cancelled'&&o.cancelledAt);
  const events=[
    ...trades.map(t=>({side:t.side,symbol:t.symbol,qty:Number(t.quantity||0).toLocaleString(undefined,{maximumFractionDigits:4}),price:money(t.price),status:'FILLED',at:t.timestamp,cancelled:false})),
    ...cancelled.map(o=>({id:o.id,side:o.side,symbol:o.symbol,qty:qtyText(o),price:orderPrice(o),status:'CANCELLED',at:o.cancelledAt,cancelled:true}))
  ].sort((a,b)=>new Date(b.at||0)-new Date(a.at||0)).slice(0,80);
  const signature=events.map(e=>`${e.cancelled?'c':'f'}:${e.id||''}:${e.symbol}:${e.at}`).join('|');
  if(body.dataset.stageCRecentSignature===signature&&body.querySelectorAll('[data-stage-c-cancelled]').length===cancelled.length)return;
  body.dataset.stageCRecentSignature=signature;
  body.innerHTML=events.length?events.map(recentRow).join(''):'<div class="blotter-empty-v15">No recent order activity.</div>';
}
function canonicalTradeSignature(){
  const trades=Array.isArray(window.SBCAdvancedOrdersV15?.cache?.trades)?window.SBCAdvancedOrdersV15.cache.trades:[];
  return trades.map(t=>`${t.id||''}:${String(t.side||'')}:${String(t.symbol||'')}:${Number(t.quantity||0)}:${String(t.timestamp||'')}`).join('|');
}
function activeLocalPortfolio(){try{return typeof currentPortfolio==='function'?currentPortfolio():null;}catch(_){return null;}}
function hydrateLocalFromBackend(snapshot){
  const p=activeLocalPortfolio();if(!p||!snapshot)return false;
  const holdings={};
  for(const pos of Array.isArray(snapshot.positions)?snapshot.positions:[]){const symbol=String(pos.symbol||'').toUpperCase();if(symbol&&Number(pos.quantity)>0)holdings[symbol]={shares:Number(pos.quantity),avg:Number(pos.avgCost||pos.price||0)};}
  p.id=Number(snapshot.id);p.portfolioId=Number(snapshot.id);p.cash=Number(snapshot.cash||0);p.holdings=holdings;p.__backendOwned=true;
  if(Number.isFinite(Number(snapshot.totalValue))){p.value=Number(snapshot.totalValue);p.totalValue=Number(snapshot.totalValue);}
  return true;
}
async function syncActiveBackendPortfolio(force=false){
  if(portfolioSyncBusy)return;
  const api=window.SBCAdvancedOrdersV15,workspace=window.SBCWorkspacePortfolioV1;
  if(!api?.cache||!workspace?.portfolioSnapshotById)return;
  const sig=canonicalTradeSignature();
  if(lastTradeSignature===null){lastTradeSignature=sig;if(!force)return;}
  const changed=sig!==lastTradeSignature;
  if(changed)lastTradeSignature=sig;
  if(!force&&!changed)return;
  const id=Number(api.cache.portfolioId||window.activePortfolioId||0);if(!(id>0))return;
  portfolioSyncBusy=true;
  try{
    const snapshot=await workspace.portfolioSnapshotById(id);
    if(Number(snapshot?.id)!==id)return;
    if(hydrateLocalFromBackend(snapshot)){
      if(typeof refreshTradeTicket==='function')refreshTradeTicket();
      window.dispatchEvent(new CustomEvent('sbc:portfolio-synced',{detail:{portfolioId:id}}));
    }
  }catch(_){}finally{portfolioSyncBusy=false;}
}
function schedulePortfolioSync(force=false){if(force)forcePortfolioSync=true;clearTimeout(portfolioSyncTimer);portfolioSyncTimer=setTimeout(()=>syncActiveBackendPortfolio(forcePortfolioSync).finally(()=>{forcePortfolioSync=false;}),90);}
async function refreshCanonicalActivity(){
  const api=window.SBCAdvancedOrdersV15;if(!api?.refresh||!api?.renderBlotter)return;
  try{await api.refresh(true);api.renderBlotter();renderRecentWithCancelled();await syncActiveBackendPortfolio(forcePortfolioSync);forcePortfolioSync=false;}catch(_){}
}
function scheduleRefresh(forcePortfolio=false){if(forcePortfolio)forcePortfolioSync=true;clearTimeout(refreshTimer);refreshTimer=setTimeout(refreshCanonicalActivity,80);setTimeout(refreshCanonicalActivity,420);}
function urlOf(input){try{return typeof input==='string'?input:input?.url||'';}catch(_){return'';}}
function methodOf(input,init){return String(init?.method||input?.method||'GET').toUpperCase();}
function wrapFetch(){
  if(window.fetch?.__stageCUiCleanupV1)return;
  const original=window.fetch.bind(window);
  const wrapped=async function(input,init){
    const response=await original(input,init);
    try{
      const url=urlOf(input),method=methodOf(input,init);
      if(response.ok&&method==='POST'&&/\/api\/portfolios\/\d+\/trades(?:\?|$)/.test(url))scheduleRefresh(true);
      if(response.ok&&(method==='POST'||method==='PATCH'||method==='DELETE')&&/\/api\/advanced-orders-v15(?:\/\d+)?(?:\?|$)/.test(url))scheduleRefresh(false);
    }catch(_){}
    return response;
  };
  wrapped.__stageCUiCleanupV1=true;window.fetch=wrapped;
}
function run(){ensureExchangeQaHelpers();wrapFetch();renderRecentWithCancelled();schedulePortfolioSync(false);}
window.addEventListener('sbc:orders-change',()=>setTimeout(refreshCanonicalActivity,0));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
setTimeout(run,300);setTimeout(run,1200);
})();
