(()=>{
'use strict';
if(window.__sbcStage67Ux)return;window.__sbcStage67Ux=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const upper=s=>clean(s).toUpperCase();
(function loadFinalCleanup(){
  if(!document.querySelector('link[data-sbc-basket-stability]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-basket-stability-v1.css?v=1';l.dataset.sbcBasketStability='1';document.head.appendChild(l);}
  if(!document.querySelector('script[data-sbc-price-sync]')){const s=document.createElement('script');s.src='/v45-price-sync-v1.js?v=1';s.dataset.sbcPriceSync='1';document.head.appendChild(s);}
})();

function removeOpenSlots(){
  $$('#view-my .entry-slot-empty.entry-slot-big').forEach(x=>x.remove());
}

function enforceTradeMode(mode){
  const shares=$('#sharesModeBtn'),percent=$('#percentModeBtn'),sw=$('#sharesInputWrap'),pw=$('#percentInputWrap');
  if(!shares||!percent)return;
  const percentOn=mode==='percent';
  shares.classList.toggle('active',!percentOn);percent.classList.toggle('active',percentOn);
  shares.setAttribute('aria-pressed',String(!percentOn));percent.setAttribute('aria-pressed',String(percentOn));
  if(sw)sw.style.display=percentOn?'none':'block';if(pw)pw.style.display=percentOn?'block':'none';
  if(!percentOn)$$('.quick-percent-row button').forEach(b=>b.classList.remove('active'));
}
function installTradeModeGuard(){
  if(typeof window.setTradeInputMode==='function'&&!window.setTradeInputMode.__stage67){
    const original=window.setTradeInputMode;
    const wrapped=function(mode){const out=original.apply(this,arguments);enforceTradeMode(mode);return out;};
    wrapped.__stage67=true;wrapped.__stage67Original=original;window.setTradeInputMode=wrapped;
  }
  const ticket=$('#view-portfolio .quick-trade-clean');if(!ticket||ticket.dataset.stage67ModeGuard)return;
  ticket.dataset.stage67ModeGuard='1';
  ticket.addEventListener('click',e=>{
    const pct=e.target.closest('.quick-percent-row button');
    if(pct&&typeof window.setTradeInputMode==='function')window.setTradeInputMode('percent');
    const mode=e.target.closest('#sharesModeBtn,#percentModeBtn');
    if(mode)setTimeout(()=>enforceTradeMode(mode.id==='percentModeBtn'?'percent':'shares'),0);
  },true);
}

function chartPopout(){
  if(!window.matchMedia('(min-width:901px)').matches)return;
  const card=$('#view-portfolio .chart-trade-card');if(!card)return;
  card.classList.add('stage67-chart-ready');
  let btn=$('[data-stage67-chart-expand]',card);
  if(!btn){
    btn=document.createElement('button');btn.type='button';btn.dataset.stage67ChartExpand='1';btn.className='stage67-chart-expand-btn';btn.textContent='EXPAND CHART';
    const dock=$('.stage43-chart-controls-v48',card)||$('.chart-toolbar',card)||$('.card-head',card);dock?.appendChild(btn);
    btn.onclick=e=>{e.preventDefault();e.stopPropagation();toggleChart(card,btn);};
  }
}
function toggleChart(card,btn,force){
  const open=force==null?!card.classList.contains('stage67-chart-popout'):!!force;
  card.classList.toggle('stage67-chart-popout',open);document.body.classList.toggle('stage67-chart-open',open);
  btn.textContent=open?'RESTORE CHART':'EXPAND CHART';btn.setAttribute('aria-pressed',String(open));
  setTimeout(()=>{try{if(typeof window.renderSymbolChart==='function')window.renderSymbolChart();window.dispatchEvent(new Event('resize'));}catch(_){ }},30);
}
function installEscape(){if(document.documentElement.dataset.stage67Escape)return;document.documentElement.dataset.stage67Escape='1';document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const card=$('.stage67-chart-popout');const btn=card&&$('[data-stage67-chart-expand]',card);if(card&&btn)toggleChart(card,btn,false);});}

const categoryForTitle=t=>{t=upper(t);if(t.includes('RACE TO THE CLOSE'))return'race_to_close';if(t.includes('DEGEN HOUR'))return'hourly';if(t.includes('WEEKLY'))return'weekly';if(t.includes('AFTERNOON'))return'afternoon';if(t.includes('MORNING'))return'morning';if(t.includes('DAILY'))return'full_day';return null;};
const tierLabel=l=>l.priceLevel==='free'?'FREE ROLL':l.priceLevel==='runner'?'RUNNER':l.priceLevel==='low'?'CLERK':l.priceLevel==='mid'?'TRADER':'JR. STONKBROKER';
function projectionText(level){
  const p=level.payoutProjection,n=Number(level.entrantCount||0);
  if(!p)return n?`${n} entries • projection unavailable`:`0 entries • waiting for entries`;
  if(level.priceLevel==='free')return `${n} entries • top ${p.paidPlaces} • 2 Runner tickets each • ${p.status==='FUNDED'?'FUNDED':'reserve shortfall'}`;
  const parts=[`${n} entries`,`top ${p.paidPlaces}`,`${p.mainEventTickets||0} Main Event ticket${p.mainEventTickets===1?'':'s'}`];
  if(p.lowerTierTickets)parts.push(`${p.lowerTierTickets} lower-tier tickets`);
  if(p.cashPrizePlaces)parts.push(`${p.cashPrizePlaces} cash-prize place${p.cashPrizePlaces===1?'':'s'}`);
  if(p.residualBonuses)parts.push(`${Number(p.residualBonuses).toLocaleString()} STONK bonus pool`);
  return parts.join(' • ');
}
function renderProjection(card,category){
  let box=$('.stage67-payout-projection',card);if(!box){box=document.createElement('details');box.className='stage67-payout-projection';box.open=false;card.appendChild(box);}
  const wasOpen=box.open;
  const levels=(category?.levels||[]).filter(l=>['free','runner','low','mid','high'].includes(l.priceLevel));
  const entrants=levels.reduce((n,l)=>n+Number(l.entrantCount||0),0);
  box.innerHTML=`<summary><span>PROJECTED PAYOUTS</span><b>IF FIELD CLOSED NOW • ${entrants.toLocaleString()} ENTRIES</b></summary><div class="stage67-payout-grid">${levels.map(l=>`<div class="stage67-payout-row"><strong>${tierLabel(l)}</strong><span>${projectionText(l)}</span></div>`).join('')}</div><small>Projection uses the same V45 settlement engine as final payouts and updates with the live field.</small>`;
  box.open=wasOpen;box.onclick=e=>e.stopPropagation();
}
async function projectedPayouts(){
  const cards=$$('#enterableList .enterable-card');if(!cards.length)return;
  try{
    const res=await fetch('/api/satellites',{cache:'no-store'});if(!res.ok)return;const data=await res.json();
    cards.forEach(card=>{const id=categoryForTitle($('h3',card)?.textContent);const cat=(data.categories||[]).find(c=>c.id===id);if(cat)renderProjection(card,cat);});
  }catch(_){ }
}

function enhance(){removeOpenSlots();installTradeModeGuard();chartPopout();installEscape();}
function hookRender(name){
  const fn=window[name];if(typeof fn!=='function'||fn.__stage67Hook)return;
  const wrapped=function(){const out=fn.apply(this,arguments);setTimeout(()=>{enhance();if(name==='renderTradingFloor')projectedPayouts();},0);return out;};
  wrapped.__stage67Hook=true;wrapped.__stage67Original=fn;window[name]=wrapped;
}
function installRenderHooks(){['renderTradingFloor','renderMyContests','renderPortfolio','showView'].forEach(hookRender);}
function start(){
  enhance();installRenderHooks();projectedPayouts();
  setTimeout(()=>{installRenderHooks();enhance();projectedPayouts();},300);
  setTimeout(()=>{installRenderHooks();enhance();projectedPayouts();},1200);
  setInterval(projectedPayouts,15000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();