(()=>{
'use strict';
if(window.__sbcStageCUiCleanupV1)return;window.__sbcStageCUiCleanupV1=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let refreshTimer=null;
function cleanupLegacyActivity(){
  const blotter=$('#view-portfolio .orders-activity-blotter-v15');
  if(!blotter)return;
  $$('.desktop-orders-empty-v45',blotter).forEach(x=>x.remove());
  ['#queuedOrders','#tradeHistory','#workingOrdersV45','.desktop-orders-tabs-v45','.orders-activity-tabs'].forEach(sel=>{
    $$(sel,blotter).forEach(x=>{x.hidden=true;x.setAttribute('aria-hidden','true');x.style.setProperty('display','none','important');});
  });
  $$('.blotter-body-v15',blotter).forEach(body=>{
    if(body.querySelector('.blotter-row-v15'))$$('.blotter-empty-v15',body).forEach(x=>x.remove());
  });
}
async function refreshCanonicalActivity(){
  const api=window.SBCAdvancedOrdersV15;
  if(!api?.refresh||!api?.renderBlotter)return;
  try{await api.refresh(true);api.renderBlotter();cleanupLegacyActivity();}catch(_){}
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
function run(){wrapFetch();cleanupLegacyActivity();}
new MutationObserver(()=>cleanupLegacyActivity()).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('sbc:orders-change',()=>setTimeout(cleanupLegacyActivity,0));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
setTimeout(run,300);setTimeout(run,1200);
})();
