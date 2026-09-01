(()=>{
'use strict';
if(window.__sbcPromotionBadgeArtCleanupV1)return;window.__sbcPromotionBadgeArtCleanupV1=true;
const BADGE_BROKER_SRC='/stonkbroker-reward-crop.png?v=1';
const BADGE_BROKER_ALT='Jr. Stonk Broker Badge';
function patchImg(img){if(!img)return false;if(img.getAttribute('src')!==BADGE_BROKER_SRC)img.setAttribute('src',BADGE_BROKER_SRC);img.setAttribute('alt',BADGE_BROKER_ALT);return true;}
function removeTutorialReplay(root=document){root.querySelectorAll('.tutorial-replay').forEach(el=>el.remove());}
function patchHeaderBadgeBroker(root=document){return patchImg(root.querySelector('header.top > img.avatar'));}
function patchPromotionStepBroker(root=document){const steps=[...root.querySelectorAll('#how .steps > .step')];return patchImg(steps[3]?.querySelector(':scope > img'));}
function apply(root=document){removeTutorialReplay(root);patchHeaderBadgeBroker(root);patchPromotionStepBroker(root);}
function start(){apply();setTimeout(apply,250);setTimeout(apply,1000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
document.addEventListener('click',e=>{const t=(e.target?.textContent||'').trim().toUpperCase();if(t==='LOBBY'||t==='HOW IT WORKS')setTimeout(apply,0)},true);
window.__SBC_PROMOTION_BADGE_ART_CLEANUP_V1_TEST={BADGE_BROKER_SRC,BADGE_BROKER_ALT,apply,patchHeaderBadgeBroker,patchPromotionStepBroker,removeTutorialReplay};
})();
