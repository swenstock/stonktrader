(()=>{
'use strict';
if(window.__sbcBrokerRaceUi)return;window.__sbcBrokerRaceUi=true;

function buildRaceModel(data){
  const d=data||{};
  return{
    brokersEarned:Number(d.brokersEarned||0),
    juniorsAwarded:Number(d.juniorsAwarded||0),
    juniorsStacked:Number(d.juniorsStacked||0),
    redeemCount:Number(d.redeemCount||20),
    topStackers:Array.isArray(d.topStackers)?d.topStackers:[],
  };
}
window.__SBC_BROKER_RACE_UI_TEST={buildRaceModel};
if(typeof document==='undefined')return;

const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let latest=null,loading=false;

function ensureCss(){if($('#sbcBrokerRaceCss'))return;const l=document.createElement('link');l.id='sbcBrokerRaceCss';l.rel='stylesheet';l.href='/v45-broker-race-ui.css?v=1';document.head.appendChild(l)}
async function load(){if(loading)return latest;loading=true;try{const r=await fetch('/api/leaderboard-v45/broker-race?limit=50',{cache:'no-store'});if(!r.ok)throw new Error(`Broker Race ${r.status}`);latest=buildRaceModel(await r.json());return latest}finally{loading=false}}
function progressText(r){if(Number(r.juniorCount||0)>=Number(r.redeemCount||20)&&Number(r.progress||0)===Number(r.redeemCount||20))return 'READY TO REDEEM';const left=Number(r.juniorsToNextBroker||0);return left===1?'1 JR AWAY':`${left} JR AWAY`}
function topRows(rows,limit=5){const list=rows.slice(0,limit);if(!list.length)return'<div class="sbc-race-empty">No Juniors have been stacked yet. The race starts with the first award.</div>';return list.map(r=>`<div class="sbc-race-row"><div class="sbc-race-rank">#${r.rank}</div><div class="sbc-race-name"><b>${esc(r.displayName)}</b><span>${esc(progressText(r))}</span></div><div class="sbc-race-count">${r.juniorCount} JR</div></div>`).join('')}

function findFundingPanel(){
  const headings=$$('h1,h2,h3,h4,b,strong,div,span').filter(el=>(el.textContent||'').trim().toUpperCase()==='CURRENT FUNDING');
  for(const h of headings){let n=h;for(let i=0;i<7&&n;i++,n=n.parentElement){const t=(n.textContent||'').toUpperCase();if(t.includes('PRIZE FUND')&&t.includes('733,332'))return n}}
  return null;
}

function renderHome(model){
  const panel=findFundingPanel();if(!panel)return false;
  if(panel.id==='sbcBrokerRaceHome')return true;
  panel.id='sbcBrokerRaceHome';
  panel.innerHTML=`<div class="sbc-race-kicker">PLATFORM-WIDE PROGRESSION</div><div class="sbc-race-title">THE BROKER RACE</div><div class="sbc-race-layout"><div><div class="sbc-race-stats"><div class="sbc-race-stat"><small>STONKBROKERS EARNED</small><b>${model.brokersEarned}</b><span>Lifetime funded redemptions</span></div><div class="sbc-race-stat"><small>JR BROKERS AWARDED</small><b>${model.juniorsAwarded}</b><span>Lifetime contest + mint issuance</span></div><div class="sbc-race-stat"><small>JR BROKERS STACKED</small><b>${model.juniorsStacked}</b><span>Currently held by players</span></div></div><p class="sbc-race-copy">Compete. Win Juniors. Stack 20. Claim an Activated Stonk Broker. Your personal 20-step progress lives in My Contests; this board tracks the race across all SBC players.</p></div><div class="sbc-race-top"><div class="sbc-race-top-head"><b>🔥 CLOSEST TO THE BROKER</b><span>TOP 5 STACKERS</span></div>${topRows(model.topStackers,5)}</div></div>`;
  return true;
}

function renderLeaders(model){
  const view=$('#view-leaders');if(!view)return false;
  let card=$('#sbcJrStackersLeaders',view);if(!card){card=document.createElement('section');card.id='sbcJrStackersLeaders';card.className='sbc-jr-leaders-card';view.appendChild(card)}
  const rows=model.topStackers;
  card.innerHTML=`<div class="sbc-jr-leaders-head"><div><div class="sbc-race-kicker">CAREER / PROGRESSION</div><h3>JR BROKER STACKERS</h3></div><p>Platform-wide current Junior holdings — separate from contest P&amp;L standings. Stack 20 to redeem an Activated Stonk Broker.</p></div>${rows.length?`<table class="sbc-jr-leaders-table"><thead><tr><th>RANK</th><th>TRADER</th><th>JR BROKERS</th><th>TO NEXT BROKER</th></tr></thead><tbody>${rows.map(r=>`<tr><td>#${r.rank}</td><td>${esc(r.displayName)}</td><td><b>${r.juniorCount}</b></td><td><span class="sbc-jr-progress-mini ${r.juniorsToNextBroker===0?'hot':''}">${esc(progressText(r))}</span></td></tr>`).join('')}</tbody></table>`:'<div class="sbc-race-empty">No Junior Broker holdings yet.</div>'}`;
  return true;
}

async function refresh(){ensureCss();try{const m=await load();renderHome(m);renderLeaders(m)}catch(e){console.warn('Broker Race UI unavailable',e)}}
function start(){ensureCss();refresh();setTimeout(refresh,700)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
new MutationObserver(()=>{clearTimeout(start.t);start.t=setTimeout(()=>{if(latest){renderHome(latest);renderLeaders(latest)}},100)}).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',e=>{const t=(e.target?.textContent||'').trim().toUpperCase();if(t==='LOBBY'||t==='LEADERBOARD')setTimeout(refresh,120)},true);
})();
