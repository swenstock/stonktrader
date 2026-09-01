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
function activeTierKey(){
  try{return TIER_ALIAS[String(currentTierKey||'').toLowerCase()]||'runner'}catch(_){return'runner'}
}
function canonicalArt(key){
  try{return typeof TIER_DATA!=='undefined'&&TIER_DATA?.[key]?.art?TIER_DATA[key].art:''}catch(_){return''}
}
function canonicalName(key){
  if(key==='junior')return'JR. BROKER';
  try{return typeof TIER_DATA!=='undefined'&&TIER_DATA?.[key]?.name?TIER_DATA[key].name:String(key||'').toUpperCase()}catch(_){return String(key||'').toUpperCase()}
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
function syncTierPopup(){
  const modal=$('#leaderV30Modal');if(!modal)return;
  const head=$('.leader-v30-modal-head',modal);if(!head)return;
  const key=activeTierKey(),src=canonicalArt(key);if(!src)return;
  let img=$('#leaderV31TierThumb',head);
  if(!img){
    img=document.createElement('img');
    img.id='leaderV31TierThumb';
    img.alt='';
    img.setAttribute('aria-hidden','true');
    img.style.cssText='width:58px;height:58px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.18);flex:0 0 58px;margin-right:12px;';
    head.insertBefore(img,head.firstChild);
  }
  if(img.getAttribute('src')!==src)img.setAttribute('src',src);
  img.dataset.canonicalTierArt=key;
  const title=$('#leaderV30ModalTitle',modal);
  if(title){
    const ev=(()=>{try{return (typeof LIVE_EVENTS!=='undefined'?LIVE_EVENTS:[]).find(e=>e.id===currentEventId)||LIVE_EVENTS?.[0]||null}catch(_){return null}})();
    title.textContent=`${canonicalName(key)}${ev?.name?' — '+ev.name:''}`;
  }
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
  const view=$('#view-leaders');if(!view){syncTierPopup();return;}
  const live=$('.live-section',view);if(!live){syncTierPopup();return;}
  const tierButtons=$$('[onclick*="openLeaderTier"]',view);if(!tierButtons.length){syncTierPopup();return;}
  const tierCards=tierButtons.map(b=>b.closest('article')||b.closest('[class*="tier"]')).filter(Boolean);
  if(!tierCards.length){syncTierPopup();return;}
  syncTierCards(tierCards,tierButtons);
  cleanTierLabels(tierCards);
  const tierGrid=tierCards[0].parentElement;if(!tierGrid){syncTierPopup();return;}
  const parent=tierGrid.parentElement;
  if(!parent){syncTierPopup();return;}
  if(live.parentElement===parent&&live.nextElementSibling!==tierGrid){parent.insertBefore(live,tierGrid);}
  syncTierPopup();
}
function start(){reorder();setTimeout(reorder,200);setTimeout(reorder,700);setTimeout(reorder,1500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
new MutationObserver(()=>{clearTimeout(start.t);start.t=setTimeout(reorder,80)}).observe(document.documentElement,{childList:true,subtree:true});
})();