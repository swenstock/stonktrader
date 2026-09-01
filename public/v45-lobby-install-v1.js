(()=>{
'use strict';
if(window.__sbcLobbyInstallV1)return;window.__sbcLobbyInstallV1=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const HERO_SRC='/approved-lobby-hero-reference.png';
const JR_VISIBLE='JR. BROKER';
function setHtml(el,html){if(el&&el.innerHTML!==html)el.innerHTML=html;}
function normalizeJrBrokerLabels(root=document){
  const card=$('#cleanCard-junior',root);
  const heading=card?.querySelector('h3');
  if(heading)setHtml(heading,'JR.<br>BROKER');
  const modeAll=$('#modeAll span',root);
  if(modeAll&&/Jr\./i.test(modeAll.textContent||''))modeAll.textContent='See every tier — Free Roll through Jr. Broker — and choose your level.';
  $$('.mini-tier b,.leaderboard-card-title,.floor-clean-card h3,.session-tier-name,.tier-name,[data-tier-name]',root).forEach(el=>{
    const txt=(el.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();
    if(txt==='JR. STONKBROKER'||txt==='JR STONKBROKER'||txt==='JUNIOR'){
      if(el.tagName==='H3'&&el.closest('#cleanCard-junior'))setHtml(el,'JR.<br>BROKER');
      else el.textContent=JR_VISIBLE;
    }
  });
}
function installLobbyHero(){
  const view=$('#view-lobby');
  const hero=view?.querySelector('.hero');
  if(!view||!hero)return;
  hero.classList.add('approved-lobby-hero-v1');
  if(!hero.dataset.lobbyHeroInstalled){
    hero.innerHTML=`<div class="approved-lobby-hero-card panel"><img src="${HERO_SRC}" alt="Stonk Broker Challenge lobby hero"><div class="approved-lobby-hero-copy" aria-hidden="true">Stonk Broker Challenge lobby hero</div></div>`;
    hero.dataset.lobbyHeroInstalled='1';
  }else{
    const img=hero.querySelector('img');
    if(img&&img.getAttribute('src')!==HERO_SRC)img.setAttribute('src',HERO_SRC);
  }
}
function install(){installLobbyHero();normalizeJrBrokerLabels();}
function start(){install();setTimeout(install,250);setTimeout(install,1200);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
document.addEventListener('click',e=>{if(e.target.closest?.('[onclick*="showView"],[onclick*="openTier"],#navLobby,#navFloor'))setTimeout(install,0);},false);
new MutationObserver(()=>{clearTimeout(start.t);start.t=setTimeout(install,90)}).observe(document.documentElement,{childList:true,subtree:true});
window.__SBC_LOBBY_INSTALL_V1_TEST={installLobbyHero,normalizeJrBrokerLabels,HERO_SRC,JR_VISIBLE};
})();
