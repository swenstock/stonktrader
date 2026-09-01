(()=>{
'use strict';
if(window.__sbcStage4JuniorUi)return;
window.__sbcStage4JuniorUi=true;
const BADGE_ICON_SRC='/stonkbroker-reward-crop.png?v=1';

function buildViewModel(snapshot){
  const s=snapshot||{};
  const count=Number(s.count||0);
  const redeemCount=Number(s.redeemCount||20);
  const progress=Number(s.progress??(count%redeemCount));
  const pct=Math.max(0,Math.min(100,(progress/redeemCount)*100));
  return{
    count,
    redeemCount,
    progress,
    progressLabel:`${progress} / ${redeemCount}`,
    progressPercent:pct,
    redeemable:!!s.redeemable,
    fullRedemptionsAvailable:Number(s.fullRedemptionsAvailable||0),
    history:Array.isArray(s.history)?s.history:[],
  };
}

function historyLabel(row){
  if(!row)return'';
  if(row.type==='redemption')return`REDEEMED 20 JR STONK BROKER BADGES • ACTIVATED BROKER ${String(row.status||'').replaceAll('_',' ').toUpperCase()}`;
  const source=row.source==='minted'?'MINTED':'WON';
  return`${source} 1 JR STONK BROKER BADGE`;
}

window.__SBC_STAGE4_JUNIOR_UI_TEST={buildViewModel,historyLabel};
if(typeof document==='undefined')return;

const $=(s,r=document)=>r.querySelector(s);
let capturedAuth='';
let mounted=false;
let loading=false;
let latest=null;

function auth(){
  if(capturedAuth)return capturedAuth;
  try{
    for(let i=0;i<localStorage.length;i++){
      const raw=localStorage.getItem(localStorage.key(i));
      if(!raw)continue;
      const vals=[raw];
      try{const j=JSON.parse(raw);if(j&&typeof j==='object')vals.push(j.token,j.accessToken,j.access_token,j.jwt,j.authToken)}catch(_){}
      for(const v of vals){if(typeof v==='string'&&v.split('.').length===3&&v.length>40)return`Bearer ${v.replace(/^Bearer\s+/i,'')}`}
    }
  }catch(_){}
  return'';
}

function headerValue(headers,name){
  try{
    if(headers instanceof Headers)return headers.get(name)||'';
    if(Array.isArray(headers)){const x=headers.find(([k])=>String(k).toLowerCase()===name.toLowerCase());return x?.[1]||''}
    if(headers&&typeof headers==='object'){const k=Object.keys(headers).find(k=>k.toLowerCase()===name.toLowerCase());return k?headers[k]:''}
  }catch(_){}
  return'';
}

const nativeFetch=window.fetch.bind(window);
window.fetch=async function(input,init){
  const ah=headerValue(init?.headers,'authorization')||headerValue(input?.headers,'authorization');
  if(ah)capturedAuth=ah;
  return nativeFetch(input,init);
};

async function api(path,opts={}){
  const headers={...(opts.headers||{})};
  const a=auth();
  if(a)headers.Authorization=a;
  if(opts.body&&!headers['Content-Type'])headers['Content-Type']='application/json';
  const r=await nativeFetch(path,{...opts,headers});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(d.error||`Prize request failed (${r.status})`);e.status=r.status;throw e}
  return d;
}

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function view(){return $('#view-my')}

function ensureCard(){
  const v=view();
  if(!v)return null;
  let card=$('#sbcJuniorCollectionV4',v);
  if(card)return card;
  card=document.createElement('section');
  card.id='sbcJuniorCollectionV4';
  card.className='sbc-jr4-card';
  v.appendChild(card);
  mounted=true;
  return card;
}

function fmtDate(raw){
  if(!raw)return'';
  const d=new Date(String(raw).replace(' ','T')+'Z');
  if(Number.isNaN(d.getTime()))return String(raw);
  return d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}

function renderHistory(vm){
  if(!vm.history.length)return'<div class="sbc-jr4-empty">No Jr Stonk Broker Badge activity yet.</div>';
  return vm.history.map(row=>`<div class="sbc-jr4-history-row"><div><b>${esc(historyLabel(row))}</b><span>${esc(fmtDate(row.createdAt))}</span></div><strong class="${row.quantity<0?'out':'in'}">${row.quantity>0?'+':''}${esc(row.quantity)}</strong></div>`).join('');
}

function render(snapshot,{signedOut=false,error=''}={}){
  const card=ensureCard();
  if(!card)return;
  if(signedOut){
    card.innerHTML=`<div class="sbc-jr4-head"><div class="sbc-jr4-title"><span class="sbc-jr4-badge-art"><img src="${BADGE_ICON_SRC}" alt="" loading="lazy" decoding="async"></span><div><small>PRIZE COLLECTION</small><h3>JR STONK BROKER BADGES</h3></div></div><span>20 = 1 BROKER</span></div><div class="sbc-jr4-signedout">Sign in to track your Badges, promotion progress, and prize history.</div>`;
    return;
  }
  if(error){card.innerHTML=`<div class="sbc-jr4-head"><div class="sbc-jr4-title"><span class="sbc-jr4-badge-art"><img src="${BADGE_ICON_SRC}" alt="" loading="lazy" decoding="async"></span><div><small>PRIZE COLLECTION</small><h3>JR STONK BROKER BADGES</h3></div></div><span>20 = 1 BROKER</span></div><div class="sbc-jr4-signedout">${esc(error)}</div>`;return}
  const vm=buildViewModel(snapshot);
  latest=vm;
  card.innerHTML=`
    <div class="sbc-jr4-head"><div class="sbc-jr4-title"><span class="sbc-jr4-badge-art"><img src="${BADGE_ICON_SRC}" alt="" loading="lazy" decoding="async"></span><div><small>PRIZE COLLECTION</small><h3>JR STONK BROKER BADGES</h3></div></div><span>COLLECT 20 → GET PROMOTED</span></div>
    <div class="sbc-jr4-grid">
      <div class="sbc-jr4-count"><small>YOU OWN</small><b>${vm.count}</b><span>BADGES</span></div>
      <div class="sbc-jr4-progress"><div class="sbc-jr4-progress-top"><small>NEXT PROMOTION</small><b>${vm.progressLabel}</b></div><div class="sbc-jr4-track"><i style="width:${vm.progressPercent}%"></i></div><p>Collect Jr Stonk Broker Badges. Collect 20. Get promoted to an Activated StonkBroker.</p></div>
      <div class="sbc-jr4-action"><button id="sbcJr4Redeem" ${vm.redeemable?'':'disabled'}>${vm.redeemable?'GET PROMOTED':'KEEP COLLECTING'}</button><small>${vm.redeemable?`${vm.fullRedemptionsAvailable} promotion${vm.fullRedemptionsAvailable===1?'':'s'} ready`:`${vm.redeemCount-vm.progress} more to promotion`}</small></div>
    </div>
    <button class="sbc-jr4-history-toggle" id="sbcJr4HistoryToggle">TRANSACTION HISTORY <span>+</span></button>
    <div class="sbc-jr4-history" id="sbcJr4History" hidden>${renderHistory(vm)}</div>`;
  const redeem=$('#sbcJr4Redeem',card);
  if(redeem&&!redeem.disabled)redeem.onclick=redeemNow;
  const toggle=$('#sbcJr4HistoryToggle',card),hist=$('#sbcJr4History',card);
  if(toggle&&hist)toggle.onclick=()=>{hist.hidden=!hist.hidden;$('span',toggle).textContent=hist.hidden?'+':'−'};
}

async function refresh(){
  if(loading)return;
  const card=ensureCard();
  if(!card)return;
  const a=auth();
  if(!a){render(null,{signedOut:true});return}
  loading=true;
  try{const d=await api('/api/account/junior-broker');render(d)}catch(e){if(e.status===401)render(null,{signedOut:true});else render(null,{error:e.message})}finally{loading=false}
}

async function redeemNow(){
  if(!latest?.redeemable)return;
  if(!confirm('Collect 20 complete. Get promoted to one funded Activated StonkBroker?'))return;
  const btn=$('#sbcJr4Redeem');
  if(btn){btn.disabled=true;btn.textContent='PROMOTING…'}
  try{const d=await api('/api/account/junior-broker/redeem',{method:'POST',body:'{}'});render(d.snapshot);alert('Promotion funded. Your Activated StonkBroker is pending delivery.')}catch(e){alert(e.message);await refresh()}
}

function run(){if(!ensureCard())return;refresh()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
new MutationObserver(()=>{if(!mounted&&view())run()}).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',e=>{const t=(e.target?.textContent||'').trim().toUpperCase();if(t==='MY CONTESTS')setTimeout(refresh,120)},true);
})();

(()=>{if(typeof document==='undefined'||document.getElementById('sbcBrokerRaceLoader'))return;const s=document.createElement('script');s.id='sbcBrokerRaceLoader';s.src='/v45-broker-race-ui.js?v=2';document.body.appendChild(s)})();
