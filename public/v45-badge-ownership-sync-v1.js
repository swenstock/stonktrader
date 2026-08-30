(()=>{
'use strict';
if(window.__sbcBadgeOwnershipSyncV1)return;window.__sbcBadgeOwnershipSyncV1=true;
function token(){try{return String(localStorage.getItem('token')||'').replace(/^Bearer\s+/i,'').trim()}catch(_){return''}}
async function snapshot(){const t=token();if(!t)return null;const r=await fetch('/api/account/junior-broker',{headers:{Authorization:`Bearer ${t}`}}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Unable to load Badge holdings.');return d;}
function apply(d){if(!d)return;const count=Number(d.count||0),listed=Number(d.listed||0),available=Number(d.available||0);const owned=document.getElementById('sbcBadgeOwned');if(owned)owned.textContent=`YOU OWN ${count} · ${listed} LISTED · ${available} AVAILABLE`;const tab=document.getElementById('sbcBadgeMarketTab');if(tab){let small=tab.querySelector('small');if(!small){small=document.createElement('small');tab.appendChild(small);}small.textContent=`YOU OWN ${count} · ${available} AVAILABLE`;tab.dataset.sbcBadgeOwned=String(count);} }
async function refresh(){try{apply(await snapshot());window.__SBC_EXCHANGE_MY_ACTIVITY_V1?.refresh?.();}catch(_){} }
document.addEventListener('click',e=>{if(e.target?.closest?.('#sbcBadgeMarketTab,#sbcBadgeMint'))setTimeout(refresh,300);},true);
function run(){refresh();setInterval(()=>{const v=document.getElementById('view-exchange');if(v?.offsetParent!==null)refresh()},2500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
window.__SBC_BADGE_OWNERSHIP_SYNC_TEST={snapshot,apply,refresh};
})();
