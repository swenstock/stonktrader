(()=>{
'use strict';
if(window.__sbcLobbyInstallV1)return;window.__sbcLobbyInstallV1=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const HERO_SRC='/approved-lobby-hero-reference.png';
const JR_VISIBLE='JR. BROKER';
const RACE_ENDPOINT='/api/leaderboard-v45/broker-race?limit=50';
let raceOpen=false,raceTimer=null;
function setHtml(el,html){if(el&&el.innerHTML!==html)el.innerHTML=html;}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function normalizeJrBrokerLabels(root=document){
  const card=$('#cleanCard-junior',root);const heading=card?.querySelector('h3');if(heading)setHtml(heading,'JR.<br>BROKER');
  const modeAll=$('#modeAll span',root);if(modeAll&&/Jr\./i.test(modeAll.textContent||''))modeAll.textContent='See every tier — Free Roll through Jr. Broker — and choose your level.';
  $$('.mini-tier b,.leaderboard-card-title,.floor-clean-card h3,.session-tier-name,.tier-name,[data-tier-name]',root).forEach(el=>{const txt=(el.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();if(txt==='JR. STONKBROKER'||txt==='JR STONKBROKER'||txt==='JUNIOR'){if(el.tagName==='H3'&&el.closest('#cleanCard-junior'))setHtml(el,'JR.<br>BROKER');else el.textContent=JR_VISIBLE;}});
}
function runnerArt(){try{return TIER_DATA?.runner?.art||'/server/turtle_art_v1/runner.png'}catch(_){return'/server/turtle_art_v1/runner.png'}}
function rowArt(row){try{return row?.art||TIER_DATA?.junior?.art||TIER_DATA?.runner?.art||runnerArt()}catch(_){return runnerArt()}}
function progressDisplay(row){const progress=Number(row?.progress||0),redeem=Number(row?.redeemCount||20),toGo=Number(row?.juniorsToNextBroker);if(toGo===0&&progress===redeem)return'ELIGIBLE';if(toGo>=1&&toGo<=5)return`${toGo} TO GO`;return row?.progressLabel||`${progress} / ${redeem}`;}
function progressClass(row){const progress=Number(row?.progress||0),redeem=Number(row?.redeemCount||20),toGo=Number(row?.juniorsToNextBroker);if(toGo===0&&progress===redeem)return'rot-eligible';if(toGo===1)return'rot-near-1';if(toGo===2)return'rot-near-2';if(toGo===3)return'rot-near-3';if(toGo===4)return'rot-near-4';if(toGo===5)return'rot-near-5';return'';}
function goToExchange(){try{if(typeof showView==='function')showView('exchange')}catch(_){}}
function raceRows(model){const rows=Array.isArray(model?.topStackers)?model.topStackers:[];const list=raceOpen?rows:rows.slice(0,5);if(!list.length)return'<div class="rot-empty">No badge collections yet.</div>';return list.map(r=>{const cls=progressClass(r),eligible=cls==='rot-eligible';return`<div class="rot-row ${cls}"><b class="rot-rank">#${Number(r.rank||0)}</b><img src="${esc(rowArt(r))}" alt=""><span class="rot-name">${esc(r.displayName||'Trader')}</span><span class="rot-progress-wrap"><strong class="rot-count">${esc(progressDisplay(r))}</strong>${eligible?'<button type="button" class="rot-exchange-nudge">TICKET EXCHANGE →</button>':''}</span></div>`}).join('')}
function renderRace(model){const box=$('#riseOfTurtlesLive');if(!box)return;box.innerHTML=`<div class="rot-head"><div class="rot-title-lockup" aria-label="RISE OF THE TURTLES"><span class="rot-rise">RISE</span><span class="rot-of-the">OF THE</span><span class="rot-turtles">TURTLES</span><p>Collect Jr. Stonk Broker Badges.<br>Climb higher. Get promoted.</p></div><div class="rot-climb-scene" aria-hidden="true"><span class="rot-ladder"></span><img src="${runnerArt()}" alt=""></div></div><div class="rot-promo-panel"><div class="rot-list-title"><span class="rot-star">★</span><b>NEXT IN LINE FOR PROMOTION</b></div><div class="rot-rows">${raceRows(model)}</div></div><button type="button" id="riseOfTurtlesViewAll">${raceOpen?'SHOW TOP 5':'VIEW ALL'} <span>⌄</span></button>`;const btn=$('#riseOfTurtlesViewAll');if(btn)btn.onclick=()=>{raceOpen=!raceOpen;renderRace(model)};$$('.rot-exchange-nudge',box).forEach(b=>b.onclick=goToExchange);}
async function refreshRace(){try{const r=await fetch(RACE_ENDPOINT,{cache:'no-store'});if(!r.ok)throw new Error(`Race ${r.status}`);renderRace(await r.json())}catch(_){renderRace({topStackers:[]})}}
function installLobbyHero(){const view=$('#view-lobby'),hero=view?.querySelector('.hero');if(!view||!hero)return;hero.classList.add('approved-lobby-hero-v1');if(!hero.dataset.lobbyHeroInstalled){hero.innerHTML=`<div class="approved-lobby-hero-card panel"><img class="approved-lobby-hero-image" src="${HERO_SRC}" alt="Stonk Broker Challenge lobby hero"><section id="riseOfTurtlesLive" class="rise-of-turtles-live" aria-label="Rise of the Turtles promotion leaderboard"></section></div>`;hero.dataset.lobbyHeroInstalled='1';}else{const img=hero.querySelector('.approved-lobby-hero-image');if(img&&img.getAttribute('src')!==HERO_SRC)img.setAttribute('src',HERO_SRC);if(!$('#riseOfTurtlesLive',hero)){const sec=document.createElement('section');sec.id='riseOfTurtlesLive';sec.className='rise-of-turtles-live';hero.querySelector('.approved-lobby-hero-card')?.appendChild(sec);}}refreshRace();}
function install(){installLobbyHero();normalizeJrBrokerLabels();}
function start(){install();setTimeout(install,250);setTimeout(install,1200);raceTimer=setInterval(()=>{if($('#view-lobby')?.offsetParent!==null)refreshRace()},5000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
document.addEventListener('click',e=>{if(e.target.closest?.('[onclick*="showView"],[onclick*="openTier"],#navLobby,#navFloor'))setTimeout(install,0);},false);
new MutationObserver(()=>{clearTimeout(start.t);start.t=setTimeout(()=>{normalizeJrBrokerLabels();const hero=$('#view-lobby .hero');if(hero&&!$('#riseOfTurtlesLive',hero))installLobbyHero()},90)}).observe(document.documentElement,{childList:true,subtree:true});
window.__SBC_LOBBY_INSTALL_V1_TEST={installLobbyHero,normalizeJrBrokerLabels,renderRace,raceRows,progressDisplay,progressClass,HERO_SRC,JR_VISIBLE,RACE_ENDPOINT};
})();
