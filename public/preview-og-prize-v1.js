(()=>{
'use strict';
if(window.__SBC_OG_PRIZE_PREVIEW_V1)return;window.__SBC_OG_PRIZE_PREVIEW_V1=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let catalog=null, selectedPrize='AI', pendingButton=null, bypass=false;
const ENTRY_USD={freeroll:0,runner:1,clerk:5,trader:15,junior:50,broker:50};
const PAYOUT={freeroll:30,runner:30,clerk:25,trader:20,junior:20,broker:20};
const norm=s=>String(s||'').trim().toUpperCase();
function tierFromText(s){const t=norm(s);if(t.includes('FREE ROLL'))return'freeroll';if(t.includes('RUNNER'))return'runner';if(t.includes('CLERK'))return'clerk';if(t.includes('TRADER'))return'trader';if(t.includes('JR.')||t.includes('JUNIOR')||t.includes('BROKER'))return'broker';return null}
function replaceText(root=document){
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(w.nextNode())nodes.push(w.currentNode);
  nodes.forEach(n=>{let s=n.nodeValue;if(!s||!s.trim())return;s=s.replace(/JR\.\s*STONKBROKER/gi,'BROKER').replace(/JR\.?\s*BROKER/gi,'BROKER').replace(/JUNIOR\s+STONKBROKER/gi,'BROKER').replace(/JUNIOR\s+BROKER/gi,'BROKER');n.nodeValue=s});
}
function removeRetired(){
  $$('[data-view="exchange"],#view-exchange,.ticket-exchange,.ticket-market,.badge-market').forEach(x=>x.remove());
  $$('button,a').forEach(el=>{const t=norm(el.textContent);if(t.includes('TICKET EXCHANGE')||t==='EXCHANGE'||t.includes('ENTER THE TICKET EXCHANGE'))el.remove()});
  $$('section,article,div').forEach(el=>{if(el.children.length>28)return;const t=norm(el.textContent);if(!t)return;
    const retired=(t.includes('JR STONK BROKER BADGES')||t.includes('COLLECT 20')||t.includes('GET PROMOTED')||t.includes('CLIMB THE CORPORATE LADDER')||t.includes('MAIN EVENT TICKET — LIVE MARKET'));
    if(retired&&el.closest('main'))el.dataset.sbcRetiredPrizeSurface='1';
  });
}
function patchTierCards(){
  const cards=$$('article[id^="cleanCard-"],.mini-tier,.floor-clean-card');
  cards.forEach(card=>{const tier=tierFromText(card.textContent);if(!tier)return;replaceText(card);
    const price=ENTRY_USD[tier];
    const candidates=$$('.price,.usd,.tier-price,.mini-tier-price,strong,b',card);
    candidates.forEach(el=>{const t=norm(el.textContent);if(t.includes('STONK')||/^≈?\s*\$/.test(el.textContent.trim())||t==='FREE'){
      if(tier==='freeroll'){if(t==='FREE'||t.includes('STONK')||t.startsWith('≈'))el.textContent='FREE';}
      else if(t.includes('STONK')||t.startsWith('≈')||/^\$/.test(el.textContent.trim()))el.textContent=`$${price}`;
    }});
    const desc=$$('small,span,p,div',card).find(el=>/qualifying|ticket|badge|promotion|promoted/i.test(el.textContent||''));
    if(desc&&desc.children.length===0)desc.textContent=tier==='freeroll'?'Zero-risk entry':`$${price} entry • paid in SBC`;
  });
}
function patchHowItWorks(){
  $$('section,article').forEach(el=>{const t=norm(el.textContent);if(!t.includes('HOW IT WORKS'))return;
    $$('div',el).forEach(d=>{const x=norm(d.textContent);if(x.includes('EARN TICKETS')||x.includes('GET PROMOTED')||x.includes('WIN THE BROKER'))d.dataset.sbcRetiredPrizeSurface='1'});
    const target=$$('div',el).find(d=>norm(d.textContent).includes('FINISH TOP 10%'));
    if(target){const h=target.querySelector('h3,b');if(h)h.textContent='FINISH IN THE PRIZE ZONE';const p=target.querySelector('p,span');if(p)p.textContent='Top finishers win the selected coin prize. Prize depth varies by entry level.'}
  });
}
function patchPrizeLanguage(){
  $$('*').forEach(el=>{if(el.children.length)return;const t=el.textContent||'';
    if(/EST\. PRIZE/i.test(t))return;
    if(/Est\.\s*\d+\s*(ME|Runner|Clerk|Trader).*Ticket/i.test(t))el.textContent=`Prize: ${selectedPrize}`;
    else if(/Pool forming/i.test(t)&&el.closest('[class*=prize],[class*=entry],[class*=metric]'))el.textContent=`${selectedPrize} pool forming`;
  });
  $$('[id*=prize],[class*=prize]').forEach(el=>{const t=norm(el.textContent);if(t.includes('EST. PRIZE')&&!el.querySelector('.sbc-selected-prize-pill')){const pill=document.createElement('span');pill.className='sbc-selected-prize-pill';pill.textContent=`${selectedPrize} PRIZE`;el.appendChild(pill)}});
}
function ensureModal(){
  if($('#sbcPrizeChoiceModal'))return;
  const wrap=document.createElement('div');wrap.id='sbcPrizeChoiceModal';wrap.className='sbc-prize-choice-modal';wrap.hidden=true;
  wrap.innerHTML=`<div class="sbc-prize-choice-card"><button class="sbc-prize-choice-close" type="button">CLOSE</button><small>PRIZE SELECTION</small><h2>CHOOSE YOUR PRIZE</h2><p>You still paper trade stocks. This only chooses what the contest pays.</p><div class="sbc-prize-choice-grid" id="sbcPrizeChoiceGrid"></div></div>`;
  document.body.appendChild(wrap);wrap.querySelector('.sbc-prize-choice-close').onclick=()=>{wrap.hidden=true;pendingButton=null};
}
function renderPrizeChoices(){ensureModal();const assets=(catalog?.prizeAssets||[]).filter(x=>x.enabledForPrizes!==false&&x.enabled!==false);$('#sbcPrizeChoiceGrid').innerHTML=assets.map(a=>`<button type="button" class="sbc-prize-choice" data-sbc-prize="${a.symbol}"><b>${a.symbol}</b><span>${a.name||a.symbol} prize asset</span></button>`).join('');
  $$('[data-sbc-prize]').forEach(b=>b.onclick=()=>{selectedPrize=b.dataset.sbcPrize;localStorage.setItem('sbcPreviewPrizeAsset',selectedPrize);$('#sbcPrizeChoiceModal').hidden=true;patchPrizeLanguage();const next=pendingButton;pendingButton=null;if(next){bypass=true;next.click();setTimeout(()=>bypass=false,0)}})
}
function shouldGate(btn){if(!btn||bypass)return false;const text=norm(btn.textContent);if(!/(PLAY NOW|RESERVE NOW|ENTER NOW|ENTER ›|ENTER >|RESERVE →|ENTER →|PLAY FREE)/.test(text))return false;const scope=btn.closest('.session,.mc-card,.floor-clean-card,.contest-card,.tier-session-card,[class*=session],[class*=contest]');if(!scope)return false;return true}
function installPrizeGate(){document.addEventListener('click',e=>{const btn=e.target.closest?.('button,a');if(!shouldGate(btn))return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();pendingButton=btn;renderPrizeChoices();$('#sbcPrizeChoiceModal').hidden=false},true)}
function addPrizeContext(){
  const heads=$$('.portfolio-head,.portfolio-scorebar,.portfolio-header,.contest-head,.active-contest');
  heads.forEach(h=>{if(h.querySelector('.sbc-selected-prize-pill'))return;const p=document.createElement('span');p.className='sbc-selected-prize-pill';p.textContent=`PRIZE: ${selectedPrize}`;h.appendChild(p)});
}
function patchPrizeLine(){
  $$('*').forEach(el=>{if(el.children.length)return;const t=el.textContent||'';if(/TOP\s*10%/i.test(t)){const tier=tierFromText(el.closest('article,section,div')?.textContent)||'runner';el.textContent=`TOP ${PAYOUT[tier]||20}%`;}});
}
function apply(){replaceText();removeRetired();patchTierCards();patchHowItWorks();patchPrizeLanguage();patchPrizeLine();addPrizeContext()}
async function start(){selectedPrize=localStorage.getItem('sbcPreviewPrizeAsset')||'AI';try{const r=await fetch('/api/v2/catalog',{cache:'no-store'});if(r.ok)catalog=await r.json()}catch(_){}ensureModal();renderPrizeChoices();installPrizeGate();apply();[100,350,900,1800].forEach(ms=>setTimeout(apply,ms));let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;apply()})}).observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
