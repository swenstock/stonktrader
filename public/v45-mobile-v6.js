(()=>{
'use strict';
if(!window.matchMedia('(max-width:620px)').matches||window.__sbcMobileV6)return;
window.__sbcMobileV6=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let positionsSheet=null;
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();

function cleanupLobby(){
  $$('.mobile-floor-brokers').forEach(x=>x.remove());
  const statement=$('.statement');if(statement)statement.classList.add('mobile-redundant-path-v6');
  const how=$('.how');if(how){how.classList.add('mobile-how-v6');$('.mobile-step-nav',how)?.remove();const steps=$('.steps',how);if(steps)steps.classList.add('mobile-how-scroll-v6');$$('.step',how).forEach(x=>x.classList.add('mobile-how-card-v6'));}
}

function contestHeading(view){
  return $$('h1,h2,h3',view).find(h=>{
    const t=clean(h.textContent).toUpperCase();
    return /(DEGEN HOUR|FREE ROLL|RUNNER|CLERK|TRADER|JR\.? STONKBROKER)/.test(t)&&!/(CURRENT POSITIONS|QUICK TRADE|ANALYTICS|LEADERBOARD|ORDERS)/.test(t);
  })||null;
}
function smallestHero(h){
  if(!h)return null;
  let el=h.parentElement,best=null;
  while(el&&el.id!=='view-portfolio'){
    const t=clean(el.textContent);
    if(el.matches('.panel,.card,section,article')&&t.length<900){best=el;break;}
    el=el.parentElement;
  }
  return best||h.parentElement;
}
function setupContestHeader(){
  const view=$('#view-portfolio');if(!view)return;
  const h=contestHeading(view),hero=smallestHero(h);if(!h||!hero||hero.classList.contains('chart-trade-card'))return;
  hero.classList.add('mobile-native-contest-hero-v6');
  let bar=$('#mobileContestHeaderV6',view);
  if(!bar){
    bar=document.createElement('section');bar.id='mobileContestHeaderV6';bar.className='mobile-contest-header-v6';
    bar.innerHTML='<div class="mobile-contest-art-v6"></div><div class="mobile-contest-copy-v6"><small>LIVE CONTEST</small><h1></h1><span></span></div><div class="mobile-contest-actions-v6"><button type="button" data-v6-back aria-label="Back">←</button><button type="button" data-v6-rules>RULES</button></div>';
    hero.parentNode.insertBefore(bar,hero);
  }
  $('h1',bar).textContent=clean(h.textContent).replace(/\s*—\s*/g,' — ');
  const meta=$$('p,span,small',hero).map(x=>clean(x.textContent)).find(t=>/ENTRY\s*#|LIVE PORTFOLIO|VIRTUAL START/i.test(t))||'';
  $('.mobile-contest-copy-v6>span',bar).textContent=meta;
  const artHost=$('.mobile-contest-art-v6',bar),sourceImg=$('img',hero);
  if(sourceImg&&!$('img',artHost)){const im=sourceImg.cloneNode(true);im.alt=im.alt||'Contest broker';artHost.appendChild(im);}
  const back=$$('button',hero).find(b=>/BACK/i.test(clean(b.textContent))),rules=$$('button',hero).find(b=>/^RULES$/i.test(clean(b.textContent)));
  const backProxy=$('[data-v6-back]',bar),rulesProxy=$('[data-v6-rules]',bar);
  backProxy.hidden=!back;rulesProxy.hidden=!rules;
  backProxy.onclick=()=>back?.click();rulesProxy.onclick=()=>rules?.click();
}

function setupTradeFirst(){
  const view=$('#view-portfolio');if(!view)return;
  $('#mobileTradeTabsV5',view)?.classList.add('mobile-v6-retired');
  $('#mobileTradeContextV5',view)?.classList.add('mobile-v6-retired');
  const card=$('.chart-trade-card',view),quick=$('.quick-trade-clean',view);
  if(card)card.classList.add('mobile-chart-trade-v6');
  if(!card||!quick)return;
  quick.classList.add('mobile-quick-trade-v6');
  const head=$('.card-head',card);
  if(quick.parentElement!==card){if(head)head.after(quick);else card.prepend(quick);}
  else if(head&&quick.previousElementSibling!==head)head.after(quick);
  const basket=$('.quick-ticket-launch',quick);if(basket){basket.classList.add('mobile-basket-cta-v6');basket.setAttribute('aria-label','Create a basket');}
}

function nativeRows(){
  const body=$('#portfolioHoldings');if(!body)return[];
  return $$('tr',body).filter(tr=>{const cells=$$('td',tr);return cells.length>=2&&!/100% UNINVESTED/i.test(clean(tr.textContent));});
}
function rowData(tr){
  const cells=$$('td',tr).map(td=>clean(td.textContent));
  const first=cells[0]||'';
  const symbol=(first.match(/[A-Z][A-Z0-9.]{0,7}/)||[])[0]||first.split(' ')[0]||'—';
  const shares=cells[1]||'—';
  const value=cells.length>=6?(cells[4]||'—'):(cells[cells.length-2]||'—');
  const pnl=cells[cells.length-1]||'—';
  const avg=cells.length>=6?cells[2]||'—':'';
  const price=cells.length>=6?cells[3]||'—':'';
  return {tr,symbol,shares,value,pnl,avg,price,all:cells.join(' ')};
}
function positionData(){return nativeRows().map(rowData);}
function ensurePositionsLauncher(){
  const view=$('#view-portfolio');if(!view)return;
  const holdings=$('.holdings-card',view)||(()=>{const h=$$('h1,h2,h3',view).find(x=>/CURRENT POSITIONS|^POSITIONS$/i.test(clean(x.textContent)));return h?.closest('.panel,.card,section')||null})();
  if(!holdings)return;
  holdings.classList.add('mobile-native-holdings-v6');
  let launch=$('#mobilePositionsLaunchV6',view);
  if(!launch){
    launch=document.createElement('section');launch.id='mobilePositionsLaunchV6';launch.className='mobile-positions-launch-v6';
    launch.innerHTML='<button type="button"><div><small>PORTFOLIO</small><b>CURRENT POSITIONS</b><span data-v6-pos-summary>No positions</span></div><strong><span data-v6-pos-count>0</span> ›</strong></button>';
    holdings.parentNode.insertBefore(launch,holdings);
    $('button',launch).onclick=openPositions;
  }
  const rows=positionData(),syms=rows.slice(0,4).map(x=>x.symbol);
  $('[data-v6-pos-count]',launch).textContent=String(rows.length);
  $('[data-v6-pos-summary]',launch).textContent=rows.length?`${syms.join(' • ')}${rows.length>4?' • …':''}`:'No open positions';
}
function ensurePositionsSheet(){
  if(positionsSheet)return positionsSheet;
  positionsSheet=document.createElement('div');positionsSheet.id='mobilePositionsSheetV6';positionsSheet.className='mobile-positions-sheet-v6';positionsSheet.hidden=true;
  positionsSheet.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="mobilePositionsTitleV6"><div class="mobile-sheet-grab-v6"></div><header><div><small>PORTFOLIO</small><h2 id="mobilePositionsTitleV6">CURRENT POSITIONS</h2></div><button type="button" data-v6-pos-close aria-label="Close positions">×</button></header><input type="search" inputmode="search" data-v6-pos-search placeholder="Search positions…" aria-label="Search positions"><div class="mobile-position-list-v6"></div></section>';
  document.body.appendChild(positionsSheet);
  $('[data-v6-pos-close]',positionsSheet).onclick=closePositions;
  $('[data-v6-pos-search]',positionsSheet).oninput=e=>renderPositions(e.target.value);
  positionsSheet.onclick=e=>{if(e.target===positionsSheet)closePositions();};
  return positionsSheet;
}
function renderPositions(q=''){
  const sheet=ensurePositionsSheet(),list=$('.mobile-position-list-v6',sheet),query=clean(q).toUpperCase();
  const rows=positionData().filter(x=>!query||x.all.toUpperCase().includes(query));
  list.innerHTML=rows.length?rows.map((x,i)=>`<article class="mobile-position-card-v6 ${/[+▲]/.test(x.pnl)?'gain':/[-▼]/.test(x.pnl)?'loss':''}" data-v6-pos-index="${i}"><div class="mobile-position-main-v6"><b>${x.symbol}</b><strong>${x.pnl}</strong></div><div class="mobile-position-meta-v6"><span>${x.shares} SH</span><span>${x.value}</span></div>${x.avg||x.price?`<div class="mobile-position-detail-v6"><span>AVG ${x.avg||'—'}</span><span>PRICE ${x.price||'—'}</span></div>`:''}<button type="button" data-v6-trade-symbol="${x.symbol}">TRADE ${x.symbol}</button></article>`).join(''):'<div class="mobile-position-empty-v6">No matching positions.</div>';
  $$('[data-v6-trade-symbol]',list).forEach((b,i)=>b.onclick=()=>{
    const symbol=b.dataset.v6TradeSymbol,source=positionData().find(x=>x.symbol===symbol)?.tr;
    if(source){source.click();closePositions();setTimeout(()=>{$('.quick-trade-clean')?.scrollIntoView({behavior:'smooth',block:'start'});},80);}
  });
}
function openPositions(){ensurePositionsSheet();renderPositions('');positionsSheet.hidden=false;document.body.classList.add('mobile-position-sheet-open-v6');setTimeout(()=> $('[data-v6-pos-search]',positionsSheet)?.focus(),80);}
function closePositions(){if(!positionsSheet)return;positionsSheet.hidden=true;document.body.classList.remove('mobile-position-sheet-open-v6');}

function nearestScroller(target){
  let p=target?.parentElement;
  while(p&&p!==document.body){const cs=getComputedStyle(p);if(p.scrollHeight>p.clientHeight+20&&/(auto|scroll)/.test(cs.overflowY))return p;p=p.parentElement;}
  return $('#globalLeader .leader-details')||$('#leaderV30Modal .leader-details');
}
function jumpToMeMobile(){
  const target=$('#leaderV30Modal .leader-v30-you,#leaderV30Modal .you-row,#globalLeader .leader-v30-you,#globalLeader .you-row');if(!target)return false;
  const scroller=nearestScroller(target);if(!scroller)return false;
  const sr=scroller.getBoundingClientRect(),tr=target.getBoundingClientRect();
  const top=scroller.scrollTop+(tr.top-sr.top)-scroller.clientHeight/2+target.offsetHeight/2;
  scroller.scrollTo({top:Math.max(0,top),behavior:'smooth'});
  target.classList.remove('mobile-find-flash-v6');void target.offsetWidth;target.classList.add('mobile-find-flash-v6');return true;
}
function bindFindMe(){
  if(document.documentElement.dataset.mobileFindV6)return;document.documentElement.dataset.mobileFindV6='1';
  document.addEventListener('click',e=>{const b=e.target.closest?.('button');if(!b||!/^(🎯\s*)?(FIND ME|JUMP TO ME)$/i.test(clean(b.textContent)))return;if(!b.closest('#leaderV30Modal,#globalLeader,#view-leaders'))return;if(jumpToMeMobile()){e.preventDefault();e.stopImmediatePropagation();}},true);
}

function cleanupDeadMobile(){
  $$('#mobileTradeTabsV5,#mobileTradeContextV5,.mobile-step-nav').forEach(x=>x.classList.add('mobile-v6-retired'));
  $$('.mobile-floor-brokers').forEach(x=>x.remove());
}
function enhance(){cleanupLobby();cleanupDeadMobile();setupContestHeader();setupTradeFirst();ensurePositionsLauncher();bindFindMe();}
window.__sbcMobileV6Enhance=enhance;
function start(){enhance();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();