(()=>{
'use strict';
if(window.__sbcStageCUiCleanupV1)return;window.__sbcStageCUiCleanupV1=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let refreshTimer=null;
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>`$${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const when=v=>{if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});};
const qtyText=o=>o?.quantity!=null?Number(o.quantity).toLocaleString(undefined,{maximumFractionDigits:4}):o?.percent!=null?`${Number(o.percent)}% SIZE`:'—';
const orderPrice=o=>{const t=String(o?.orderType||'market');if(t==='limit')return `LMT ${money(o.limitPrice)}`;if(t==='stop')return `STP ${money(o.stopPrice)}`;if(t==='stop_limit')return `STP ${money(o.stopPrice)} / LMT ${money(o.limitPrice)}`;return 'MKT @ OPEN';};
function recentRow(e){const side=String(e.side||'buy').toLowerCase()==='sell'?'sell':'buy',label=side.toUpperCase();return `<article class="blotter-row-v15 ${side}" ${e.cancelled?`data-stage-c-cancelled="${esc(e.id)}"`:''}><b class="blotter-side-v15">${label}</b><strong>${esc(e.symbol||'—')}</strong><span>${esc(e.qty||'—')}</span><span>${esc(e.price||'—')}</span><span><em>${esc(e.status||'')}</em>${e.at?`<small>${esc(when(e.at))}</small>`:''}</span><span class="blotter-actions-v15"></span></article>`;}
function renderRecentWithCancelled(){
  const api=window.SBCAdvancedOrdersV15,root=$('#view-portfolio .orders-activity-blotter-v15 .blotter-root-v15'),body=$('[data-panel="recent"] .blotter-body-v15',root);
  if(!api?.cache||!body)return;
  const trades=Array.isArray(api.cache.trades)?api.cache.trades:[],orders=Array.isArray(api.cache.orders)?api.cache.orders:[];
  const cancelled=orders.filter(o=>String(o.status)==='cancelled'&&o.cancelledAt);
  if(!cancelled.length)return;
  const events=[
    ...trades.map(t=>({side:t.side,symbol:t.symbol,qty:Number(t.quantity||0).toLocaleString(undefined,{maximumFractionDigits:4}),price:money(t.price),status:'FILLED',at:t.timestamp,cancelled:false})),
    ...cancelled.map(o=>({id:o.id,side:o.side,symbol:o.symbol,qty:qtyText(o),price:orderPrice(o),status:'CANCELLED',at:o.cancelledAt,cancelled:true}))
  ].sort((a,b)=>new Date(b.at||0)-new Date(a.at||0)).slice(0,80);
  const signature=events.map(e=>`${e.cancelled?'c':'f'}:${e.id||''}:${e.symbol}:${e.at}`).join('|');
  if(body.dataset.stageCRecentSignature===signature&&body.querySelectorAll('[data-stage-c-cancelled]').length===cancelled.length)return;
  body.dataset.stageCRecentSignature=signature;
  body.innerHTML=events.length?events.map(recentRow).join(''):'<div class="blotter-empty-v15">No recent order activity.</div>';
}
function cleanupLegacyActivity(){
  const blotter=$('#view-portfolio .orders-activity-blotter-v15');
  if(!blotter)return;
  $$('.desktop-orders-empty-v45',blotter).forEach(x=>x.remove());
  ['#queuedOrders','#tradeHistory','#workingOrdersV45','.desktop-orders-tabs-v45','.orders-activity-tabs'].forEach(sel=>{
    $$(sel,blotter).forEach(x=>{x.hidden=true;x.setAttribute('aria-hidden','true');x.style.setProperty('display','none','important');});
  });
  const legacyEmpty=/\bNo activity yet\b|\bNo recent activity yet\b|Your trade decisions will appear here|Completed buys, sells and triggered orders will appear here/i;
  $$('*',blotter).forEach(x=>{
    if(x.closest('.blotter-root-v15'))return;
    const text=clean(x.textContent);
    if(text&&text.length<180&&legacyEmpty.test(text)){
      x.hidden=true;x.setAttribute('aria-hidden','true');x.style.setProperty('display','none','important');
    }
  });
  $$('.blotter-body-v15',blotter).forEach(body=>{
    if(body.querySelector('.blotter-row-v15'))$$('.blotter-empty-v15',body).forEach(x=>x.remove());
  });
  renderRecentWithCancelled();
}
function suppressBasketDuplicateConfirm(){
  const basket=$('.bb19-overlay:not([hidden])'),confirm=$('#ta42Confirm');
  if(!basket||!confirm)return;
  if(/TRADE COMPLETE/i.test(clean(confirm.textContent)))confirm.remove();
}
async function refreshCanonicalActivity(){
  const api=window.SBCAdvancedOrdersV15;
  if(!api?.refresh||!api?.renderBlotter)return;
  try{await api.refresh(true);api.renderBlotter();cleanupLegacyActivity();renderRecentWithCancelled();}catch(_){}
}
function scheduleRefresh(){
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(refreshCanonicalActivity,80);
  setTimeout(refreshCanonicalActivity,420);
}
function urlOf(input){try{return typeof input==='string'?input:input?.url||'';}catch(_){return'';}}
function methodOf(input,init){return String(init?.method||input?.method||'GET').toUpperCase();}
function wrapFetch(){
  if(window.fetch?.__stageCUiCleanupV1)return;
  const original=window.fetch.bind(window);
  const wrapped=async function(input,init){
    const response=await original(input,init);
    try{
      const url=urlOf(input),method=methodOf(input,init);
      if(response.ok&&method==='POST'&&/\/api\/portfolios\/\d+\/trades(?:\?|$)/.test(url))scheduleRefresh();
    }catch(_){}
    return response;
  };
  wrapped.__stageCUiCleanupV1=true;
  window.fetch=wrapped;
}
function run(){wrapFetch();cleanupLegacyActivity();suppressBasketDuplicateConfirm();renderRecentWithCancelled();}
new MutationObserver(()=>{cleanupLegacyActivity();suppressBasketDuplicateConfirm();renderRecentWithCancelled();}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('sbc:orders-change',()=>setTimeout(refreshCanonicalActivity,0));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
setTimeout(run,300);setTimeout(run,1200);
})();
