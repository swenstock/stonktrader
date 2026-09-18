(()=>{
'use strict';
if(window.__sbcLobbyInstallV1)return;window.__sbcLobbyInstallV1=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const JR_VISIBLE='JR. BROKER';
const JR_STONK_BROKER_BADGE_ART='/stonkbroker-reward-crop.png?v=1';
function setHtml(el,html){if(el&&el.innerHTML!==html)el.innerHTML=html;}
function normalizeJrBrokerLabels(root=document){
  const card=$('#cleanCard-junior',root);const heading=card?.querySelector('h3');if(heading)setHtml(heading,'JR.<br>BROKER');
  const modeAll=$('#modeAll span',root);if(modeAll&&/Jr\./i.test(modeAll.textContent||''))modeAll.textContent='See every tier — Free Roll through Jr. Broker — and choose your level.';
  $$('.mini-tier b,.leaderboard-card-title,.floor-clean-card h3,.session-tier-name,.tier-name,[data-tier-name]',root).forEach(el=>{const txt=(el.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();if(txt==='JR. STONKBROKER'||txt==='JR STONKBROKER'||txt==='JUNIOR'){if(el.tagName==='H3'&&el.closest('#cleanCard-junior'))setHtml(el,'JR.<br>BROKER');else el.textContent=JR_VISIBLE;}});
}
function retireLobbyStatementStrip(root=document){const statement=$('.statement',root);if(statement)statement.remove();}
function patchJrStonkBrokerBadgeArt(root=document){
  $$('.tutorial-replay',root).forEach(el=>el.remove());
  const headerAvatar=$('header.top > img.avatar',root);if(headerAvatar){headerAvatar.src=JR_STONK_BROKER_BADGE_ART;headerAvatar.alt='Jr. Stonk Broker Badge';}
  const steps=$$('#how .steps > .step',root),promotionArt=steps[3]?.querySelector(':scope > img');if(promotionArt){promotionArt.src=JR_STONK_BROKER_BADGE_ART;promotionArt.alt='Jr. Stonk Broker Badge';}
}
function install(){retireLobbyStatementStrip();normalizeJrBrokerLabels();patchJrStonkBrokerBadgeArt();}
function start(){install();setTimeout(install,250);setTimeout(install,1200);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
document.addEventListener('click',e=>{if(e.target.closest?.('[onclick*="showView"],[onclick*="openTier"],#navLobby,#navFloor'))setTimeout(install,0);},false);
window.__SBC_LOBBY_INSTALL_V1_TEST={normalizeJrBrokerLabels,retireLobbyStatementStrip,patchJrStonkBrokerBadgeArt,JR_VISIBLE,JR_STONK_BROKER_BADGE_ART};
})();