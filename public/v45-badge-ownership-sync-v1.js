(()=>{
'use strict';
if(window.__sbcBadgeOwnershipSyncV1)return;window.__sbcBadgeOwnershipSyncV1=true;
let busy=false;
function token(){try{return String(localStorage.getItem('token')||'').replace(/^Bearer\s+/i,'').trim()}catch(_){return''}}
async function snapshot(){const t=token();if(!t)return null;const r=await fetch('/api/account/junior-broker',{headers:{Authorization:`Bearer ${t}`},cache:'no-store'}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Unable to load Badge holdings.');return d;}
function apply(d){if(!d)return;const count=Number(d.count||0),listed=Number(d.listed||0),available=Number(d.available||0);const owned=document.getElementById('sbcBadgeOwned');if(owned)owned.textContent=`YOU OWN ${count} · ${listed} LISTED · ${available} AVAILABLE`;const tab=document.getElementById('sbcBadgeMarketTab');if(tab){let small=tab.querySelector('small');if(!small){small=document.createElement('small');tab.appendChild(small);}small.textContent=`YOU OWN ${count} · ${available} AVAILABLE`;tab.dataset.sbcBadgeOwned=String(count);}window.dispatchEvent?.(new CustomEvent('sbc:badge-holding-sync',{detail:{count,listed,available}}));}
async function refresh(){if(busy)return;busy=true;try{apply(await snapshot());}catch(_){}finally{busy=false;}}
function reconcileSoon(){[120,450,1000,2200].forEach(ms=>setTimeout(refresh,ms));}
document.addEventListener('click',e=>{if(e.target?.closest?.('#sbcBadgeMarketTab'))setTimeout(refresh,100);if(e.target?.closest?.('#sbcBadgeMint'))reconcileSoon();},true);
window.addEventListener?.('sbc:badge-purchased',reconcileSoon);
window.addEventListener?.('sbc:exchange-heartbeat',refresh);
function run(){refresh()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
window.__SBC_BADGE_OWNERSHIP_SYNC_TEST={snapshot,apply,refresh,reconcileSoon};
})();
