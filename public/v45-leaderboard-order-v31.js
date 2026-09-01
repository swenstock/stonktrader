(()=>{
'use strict';
if(window.__sbcLeaderboardOrderV31)return;window.__sbcLeaderboardOrderV31=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const TIER_ORDER=['freeroll','runner','clerk','trader','junior'];
const TIER_ALIAS=Object.freeze({free:'freeroll',freeroll:'freeroll',runner:'runner',clerk:'clerk',low:'clerk',trader:'trader',mid:'trader',junior:'junior',high:'junior'});
function tierKey(button,index){
  const call=button?.getAttribute('onclick')||'';
  const match=call.match(/openLeaderTier\(\s*['"]([^'"]+)['"]/i);
  const raw=String(match?.[1]||'').toLowerCase();
  return TIER_ALIAS[raw]||TIER_ORDER[index]||null;
}
function canonicalArt(key){
  try{return typeof TIER_DATA!=='undefined'&&TIER_DATA?.[key]?.art?TIER_DATA[key].art:''}catch(_){return''}
}
function syncTierCards(cards,buttons){
  cards.forEach((card,index)=>{
    const key=tierKey(buttons[index],index);if(!key)return;
    const img=$('img',card),src=canonicalArt(key);
    if(img&&src&&img.getAttribute('src')!==src)img.setAttribute('src',src);
    card.dataset.canonicalTierArt=key;
    if(key==='junior'){
      $$('h1,h2,h3,h4,strong,b,[class*="tier"],[class*="name"],[class*="title"]',card).forEach(el=>{
        const text=(el.textContent||'').trim().replace(/\s+/g,' ').toUpperCase();
        if(text==='JR. STONKBROKER'||text==='JR STONKBROKER'||text==='JR. STONK BROKER'||text==='JR STONK BROKER')el.textContent='JR. BROKER';
      });
    }
  });
}
function cleanTierLabels(cards){
  cards.forEach(card=>{
    $$('*',card).forEach(el=>{
      if(el.children.length)return;
      if((el.textContent||'').trim().toUpperCase()==='VIEW LEADERS')el.style.display='none';
    });
  });
}
function reorder(){
  const view=$('#view-leaders');if(!view)return;
  const live=$('.live-section',view);if(!live)return;
  const tierButtons=$$('[onclick*="openLeaderTier"]',view);if(!tierButtons.length)return;
  const tierCards=tierButtons.map(b=>b.closest('article')||b.closest('[class*="tier"]')).filter(Boolean);
  if(!tierCards.length)return;
  syncTierCards(tierCards,tierButtons);
  cleanTierLabels(tierCards);
  const tierGrid=tierCards[0].parentElement;if(!tierGrid)return;
  const parent=tierGrid.parentElement;
  if(!parent)return;
  if(live.parentElement===parent&&live.nextElementSibling!==tierGrid){parent.insertBefore(live,tierGrid);}
}
function start(){reorder();setTimeout(reorder,200);setTimeout(reorder,700);setTimeout(reorder,1500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
new MutationObserver(()=>{clearTimeout(start.t);start.t=setTimeout(reorder,80)}).observe(document.documentElement,{childList:true,subtree:true});
})();