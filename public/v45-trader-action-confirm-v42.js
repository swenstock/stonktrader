(()=>{
'use strict';
if(window.__sbcTraderActionConfirmV42)return;window.__sbcTraderActionConfirmV42=true;
let timer=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>`$${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const qty=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:4});
function close(){document.getElementById('ta42Confirm')?.remove();clearTimeout(timer);timer=null;}
function show({eyebrow='TRADE COMPLETE',title='',detail='',subdetail='',icon='✓'}){
  if(!title)return false;close();
  const root=document.createElement('div');root.id='ta42Confirm';root.className='ta42-confirm';
  root.innerHTML=`<section role="dialog" aria-modal="true" aria-label="Trade confirmation"><button type="button" class="ta42-x" aria-label="Close">×</button><div class="ta42-icon">${esc(icon)}</div><small>${esc(eyebrow)}</small><h2>${esc(title)}</h2>${detail?`<strong>${esc(detail)}</strong>`:''}${subdetail?`<p>${esc(subdetail)}</p>`:''}<button type="button" class="ta42-done">GOT IT</button></section>`;
  document.body.appendChild(root);
  root.querySelector('.ta42-x').onclick=close;root.querySelector('.ta42-done').onclick=close;root.onclick=e=>{if(e.target===root)close()};
  timer=setTimeout(close,3600);return true;
}
function parseBody(init){try{if(!init?.body)return{};if(typeof init.body==='string')return JSON.parse(init.body);return{}}catch(_){return{}}}
function urlOf(input){try{return typeof input==='string'?input:input?.url||''}catch(_){return''}}
function methodOf(input,init){return String(init?.method||input?.method||'GET').toUpperCase()}
function advancedDetail(b){const type=String(b.orderType||'').replace('_',' ').toUpperCase();if(type==='LIMIT')return`Limit ${money(b.limitPrice)}`;if(type==='STOP')return`Stop ${money(b.stopPrice)}`;if(type==='STOP LIMIT')return`Stop ${money(b.stopPrice)} → Limit ${money(b.limitPrice)}`;return type||'Order accepted';}
function showTrade(body,out){
  if(body?.basketOrder)return;
  const symbol=String(out?.symbol||body?.symbol||'').toUpperCase(),side=String(out?.side||body?.side||'').toUpperCase();
  if(!symbol||!['BUY','SELL'].includes(side))return;
  if(out?.queued){show({eyebrow:'ORDER QUEUED',title:`${side} ${symbol}`,detail:'WAITING FOR MARKET OPEN',subdetail:out.message||'This order will be rechecked at the next eligible market open.',icon:'⏱'});return;}
  show({eyebrow:'TRADE COMPLETE',title:`YOU ${side==='BUY'?'BOUGHT':'SOLD'} ${qty(out?.quantity||body?.quantity)} ${symbol}`,detail:`${money(out?.price)} PER SHARE`,subdetail:out?.percent?`${out.percent}% quick ${side.toLowerCase()} executed.`:'Order executed successfully.',icon:side==='BUY'?'📈':'📉'});
}
function showAdvanced(body){
  const side=String(body?.side||'').toUpperCase(),symbol=String(body?.symbol||'').toUpperCase(),type=String(body?.orderType||'ORDER').replace('_',' ').toUpperCase();
  if(!symbol||!side)return;
  const size=body.percent?`${body.percent}% sizing`:body.quantity?`${qty(body.quantity)} shares`:'';
  show({eyebrow:'ORDER PLACED',title:`${type} ${side} • ${symbol}`,detail:advancedDetail(body),subdetail:size?`${size} • Waiting for trigger/execution.`:'Waiting for trigger/execution.',icon:'📝'});
}
window.SBCTradeConfirmV42={show,showAdvanced,close};
const nativeFetch=window.fetch.bind(window);
window.fetch=async function(input,init){
  const url=urlOf(input),method=methodOf(input,init),body=parseBody(init),response=await nativeFetch(input,init);
  if(!response.ok)return response;
  try{
    if(method==='POST'&&/\/api\/portfolios\/\d+\/trades(?:\?|$)/.test(url)){
      const out=await response.clone().json().catch(()=>({}));queueMicrotask(()=>showTrade(body,out));
    }else if(method==='POST'&&/\/api\/advanced-orders-v15(?:\?|$)/.test(url)){
      queueMicrotask(()=>showAdvanced(body));
    }
  }catch(_){}
  return response;
};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('ta42Confirm'))close()});
})();
