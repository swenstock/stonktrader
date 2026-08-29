(()=>{
'use strict';
if(window.__sbcTradeReceiptV1)return;window.__sbcTradeReceiptV1=true;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qty=v=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:6}):''};
const money=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?'$'+n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):''};
let batch=null;
function close(){document.getElementById('sbcTradeReceiptV1')?.remove();}
function show({side='buy',title='',detail='',rows=[]}={}){close();const safe=(Array.isArray(rows)?rows:[]).filter(r=>String(r?.symbol||'').trim()),verb=side==='sell'?'SOLD':side==='queued-buy'?'QUEUED':'BOUGHT',icon=side==='sell'?'📉':side==='queued-buy'?'⏱️':'✓',root=document.createElement('div');root.id='sbcTradeReceiptV1';root.className='sbc-trade-receipt-v1';root.innerHTML=`<section tabindex="-1" role="dialog" aria-modal="true" aria-label="${esc(title||`${verb} ORDERS`)}"><header><div><small>TRANSACTION RECEIPT</small><h2>${esc(title||`YOU ${verb} THE FOLLOWING`)}</h2><p>${esc(detail||`${safe.length} order${safe.length===1?'':'s'}`)}</p></div><button type="button" data-receipt-close aria-label="Close">×</button></header><div class="sbc-trade-receipt-list-v1">${safe.map((r,i)=>{const price=Number(r.price),notional=Number(r.notional),right=money(notional)||(money(price)?'@ '+money(price):'');return `<div class="sbc-trade-receipt-row-v1"><i>${i+1}</i><b>${esc(String(r.symbol).toUpperCase())}</b><span>${qty(r.quantity)} SHARES</span><strong>${esc(right)}</strong></div>`}).join('')||'<div class="sbc-trade-receipt-empty-v1">No order rows were supplied.</div>'}</div><footer><span>${icon} ${safe.length} ${safe.length===1?'ORDER':'ORDERS'} ${verb}</span><button type="button" data-receipt-done>DONE</button></footer></section>`;document.body.appendChild(root);root.querySelector('[data-receipt-close]')?.addEventListener('click',close);root.querySelector('[data-receipt-done]')?.addEventListener('click',close);root.addEventListener('click',e=>{if(e.target===root)close();});requestAnimationFrame(()=>root.querySelector('section')?.focus({preventScroll:true}));}
function arm(type){batch={type,rows:[],started:Date.now()};}
function parseBody(body){try{return typeof body==='string'?JSON.parse(body):body||{};}catch(_){return{};}}
function bodyRow(body,out){const b=parseBody(body),t=out?.trade||out?.order||out||{};const price=Number(t.price||t.fillPrice||t.avgPrice||0),quantity=Number(t.quantity||b.quantity||0);return{symbol:String(t.symbol||b.symbol||'').toUpperCase(),quantity,price,notional:price>0&&quantity>0?price*quantity:0};}
function wrapWorkspace(){const w=window.SBCWorkspacePortfolioV1;if(!w?.submitTradeById||w.submitTradeById.__receiptV1)return false;const d=Object.getOwnPropertyDescriptor(w,'submitTradeById');if(Object.isFrozen(w)||d?.writable===false)return false;const original=w.submitTradeById;w.submitTradeById=async function(id,body){const out=await original.apply(this,arguments);try{if(batch?.type==='sell'){const r=bodyRow(body,out);if(String(r.symbol)&&r.quantity>0)batch.rows.push(r);}}catch(_){}return out;};w.submitTradeById.__receiptV1=true;return true;}
function niceOpenTime(level){try{if(!level?.opensAt)return 'The server says this contest is not open yet.';return`Server schedule says this contest opens ${new Date(level.opensAt).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'})}.`;}catch(_){return'The server says this contest is not open yet.';}}
function wrapEntryClockGuard(){const current=window.beginPortfolioFlow,a=window.SBCBackendAuthorityV1;if(typeof current!=='function'||!a?.entryEligibility||current.__entryClockGuardV1)return false;const wrapped=async function(session,tier,mode,returnView,entry){const liveIntent=String(mode||'').toLowerCase()==='live'&&['floor','tier'].includes(String(returnView||''));if(liveIntent){try{const eligibility=await a.entryEligibility({session,tier,mode,returnView,entry});if(String(eligibility?.level?.status||'').toLowerCase()!=='open'){window.SBCTradeConfirmV42?.show?.({eyebrow:'CONTEST CLOCK',title:'CONTEST NOT OPEN YET',detail:niceOpenTime(eligibility?.level),subdetail:'No reservation was created. Refresh the Trading Floor and enter when the contest is open.',icon:'⏱'});return false;}}catch(e){window.SBCTradeConfirmV42?.show?.({eyebrow:'CONTEST CLOCK',title:'ENTRY STATUS COULD NOT BE VERIFIED',detail:e?.message||String(e),subdetail:'No reservation was created from this live-entry attempt.',icon:'!'});return false;}}return current.apply(this,arguments);};wrapped.__entryClockGuardV1=true;window.beginPortfolioFlow=wrapped;return true;}
function wrapConfirm(){const c=window.SBCTradeConfirmV42;if(!c?.show||c.show.__receiptV3)return false;const original=c.show;c.show=function(payload){const text=`${payload?.eyebrow||''} ${payload?.title||''}`.toUpperCase();if(batch?.type==='sell'&&text.includes('SELL ALL COMPLETE')&&batch.rows.length){const rows=batch.rows.slice();batch=null;show({side:'sell',title:'SELL ALL COMPLETE',detail:`${rows.length} position${rows.length===1?'':'s'} sold.`,rows});return;}if(batch?.type==='sell'&&(text.includes('SELL ALL PARTIAL')||text.includes('SELL ALL FAILED'))){batch=null;}if(text.includes('ENTRY RESERVED'))payload={...payload,eyebrow:'ENTRY RESERVED',title:'YOUR NEXT CONTEST IS RESERVED',detail:'Your spot is reserved for the next contest.',subdetail:'Your real contest portfolio will be created automatically when the room opens.'};return original.call(this,payload);};c.show.__receiptV3=true;return true;}
function install(){wrapWorkspace();wrapConfirm();wrapEntryClockGuard();}
document.addEventListener('click',e=>{const t=e.target?.closest?.('[data-sell-all-confirm-v46]');if(!t)return;arm('sell');install();},true);
new MutationObserver(()=>{install();}).observe(document.documentElement,{childList:true,subtree:true});
install();setTimeout(install,250);setTimeout(install,1000);
window.SBCTradeReceiptV1={show,close};
})();

(()=>{
'use strict';
if(window.__sbcPostTradeMatureChartGuardV1)return;window.__sbcPostTradeMatureChartGuardV1=true;
function matureReady(){const host=document.querySelector('.sbc-mature-chart-host-v1.is-ready');return !!(host&&host.isConnected);}
function installLegacyRedrawGuard(){
  const current=window.renderSymbolChart;
  if(typeof current!=='function'||current.__postTradeMatureChartGuardV1)return false;
  const wrapped=function(){if(matureReady())return false;return current.apply(this,arguments);};
  wrapped.__postTradeMatureChartGuardV1=true;
  wrapped.__legacyRenderSymbolChart=current;
  window.renderSymbolChart=wrapped;
  return true;
}
installLegacyRedrawGuard();setTimeout(installLegacyRedrawGuard,0);setTimeout(installLegacyRedrawGuard,250);setTimeout(installLegacyRedrawGuard,1000);
window.SBCPostTradeMatureChartGuardV1={matureReady,installLegacyRedrawGuard};
})();
