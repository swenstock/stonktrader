(()=>{
'use strict';
if(window.__sbcExchangeTierIntegrityV1)return;window.__sbcExchangeTierIntegrityV1=true;
const CANON={junior:{label:'Jr Broker',legacy:'JR. STONKBROKER'},trader:{label:'Trader',legacy:'TRADER'},clerk:{label:'Clerk',legacy:'CLERK'},runner:{label:'Runner',legacy:'RUNNER'}};
function typeFromText(text){const u=String(text||'').toUpperCase();if(/JR\.?\s*(STONK\s*)?BROKER|JUNIOR/.test(u))return'junior';if(u.includes('TRADER'))return'trader';if(u.includes('CLERK'))return'clerk';if(u.includes('RUNNER'))return'runner';return null;}
function selectorType(){const selector=document.getElementById('ticketTypeSelector');if(!selector)return null;const active=selector.querySelector('button.active');if(!active||active.id==='sbcBadgeMarketTab')return null;return typeFromText(active.textContent);}
function ensureJuniorMarker(){const title=document.getElementById('marketTicketTitle');if(!title)return;title.querySelector('[data-sbc-junior-marker]')?.remove();const type=selectorType();if(type!=='junior')return;const marker=document.createElement('span');marker.setAttribute('data-sbc-junior-marker','1');marker.textContent=' JUNIOR';marker.style.cssText='display:none!important';title.appendChild(marker);}
function normalizeVisibleJunior(root=document.getElementById('view-exchange')){if(!root)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const n of nodes){const p=n.parentElement;if(!p||p.closest('[data-sbc-junior-marker]'))continue;const old=n.nodeValue||'';const next=old.replace(/JR\.?\s*STONKBROKER/gi,'JR BROKER').replace(/JR\.?\s*STONK\s+BROKER(?!\s+BADGE)/gi,'JR BROKER');if(next!==old)n.nodeValue=next;}}
function syncLegacyGlobal(){const type=selectorType();if(!type)return type;try{if(typeof activeTicketMarket!=='undefined')activeTicketMarket=CANON[type].legacy;}catch(_){}ensureJuniorMarker();return type;}
function wrapRender(){const original=window.renderTicketMarket;if(typeof original!=='function'||original.__sbcTierIntegrityV1)return;const wrapped=function(){syncLegacyGlobal();const result=original.apply(this,arguments);return Promise.resolve(result).then(v=>{ensureJuniorMarker();normalizeVisibleJunior();return v;});};wrapped.__sbcTierIntegrityV1=true;window.renderTicketMarket=wrapped;}
function auditDom(){const type=selectorType();if(!type)return true;ensureJuniorMarker();normalizeVisibleJunior();const title=(document.getElementById('marketTicketTitle')?.textContent||'').toUpperCase();const expected=type==='junior'?'JUNIOR':CANON[type].legacy;return type==='junior'?title.includes('JUNIOR'):title.includes(expected);}
function run(){wrapRender();syncLegacyGlobal();auditDom();}
document.addEventListener('click',e=>{const b=e.target?.closest?.('#ticketTypeSelector button');if(!b||b.id==='sbcBadgeMarketTab')return;queueMicrotask(()=>{syncLegacyGlobal();wrapRender();window.renderTicketMarket?.();});},true);
new MutationObserver(()=>{ensureJuniorMarker();normalizeVisibleJunior();}).observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();setTimeout(run,250);setTimeout(run,900);
window.__SBC_EXCHANGE_TIER_INTEGRITY_TEST={typeFromText,selectorType,syncLegacyGlobal,ensureJuniorMarker,normalizeVisibleJunior,auditDom,CANON};
})();
