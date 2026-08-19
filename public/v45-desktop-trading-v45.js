(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches||window.__sbcDesktopTradingV45)return;window.__sbcDesktopTradingV45=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const BASKET_STORE='sbcLastBasketV45';
function view(){return $('#view-portfolio')}
function labelOf(el){return clean(el?.querySelector('span')?.textContent||el?.textContent).toUpperCase()}
function showConfirm(eyebrow,title,detail='',subdetail='',icon='✓'){const fire=()=>{try{if(window.SBCTradeConfirmV42?.show){window.SBCTradeConfirmV42.show({eyebrow,title,detail,subdetail,icon});return true}}catch(_){}return false};if(!fire())setTimeout(fire,100)}

function layoutPortfolioStats(){
  const v=view(),head=$('.trade-head',v),holdings=$('.holdings-card',v);if(!v||!head||!holdings)return;
  head.classList.add('desktop-trade-head-v45');holdings.classList.add('desktop-holdings-v45');
  const stats=$$('.port-stat',v);
  const rank=stats.find(x=>/CURRENT RANK/.test(labelOf(x))),prize=stats.find(x=>/EST\.? PRIZE/.test(labelOf(x))),time=stats.find(x=>/TIME\s*\/\s*CUTOFF|TIME LEFT/.test(labelOf(x)));
  const value=stats.find(x=>/PORTFOLIO VALUE/.test(labelOf(x))),cash=stats.find(x=>/AVAILABLE CASH/.test(labelOf(x))),pnl=stats.find(x=>/TOTAL P&L/.test(labelOf(x)));
  let headerMetrics=$('.header-metrics-v45',head);if(!headerMetrics){headerMetrics=document.createElement('div');headerMetrics.className='header-metrics-v45';const status=[...head.children].find(x=>/STATUS\s*LIVE/i.test(clean(x.textContent)));status?head.insertBefore(headerMetrics,status):head.appendChild(headerMetrics);}
  [rank,prize,time].filter(Boolean).forEach(x=>headerMetrics.appendChild(x));
  let posMetrics=$('.positions-kpis-v45',holdings);if(!posMetrics){posMetrics=document.createElement('div');posMetrics.className='positions-kpis-v45';const ch=$('.card-head',holdings);ch?ch.after(posMetrics):holdings.prepend(posMetrics);}
  [value,cash,pnl].filter(Boolean).forEach(x=>posMetrics.appendChild(x));
  const summary=$('.portfolio-summary',v);if(summary&&!summary.querySelector('.port-stat'))summary.classList.add('desktop-summary-empty-v45');
}

function polishHoldings(){
  const v=view(),holdings=$('.holdings-card',v);if(!holdings)return;
  const table=$('table',holdings),headers=table?$$('thead th',table):[];
  const labels=['SYMBOL','QTY','AVG COST','LAST','MARKET VALUE / ALLOC.','UNREALIZED P&L'];
  headers.slice(0,labels.length).forEach((h,i)=>h.textContent=labels[i]);
  if(table)table.classList.add('holdings-table-v45');
  const rows=$$('#portfolioHoldings tr',holdings);
  rows.forEach(tr=>{const cells=$$('td',tr);if(cells.length<6)return;
    const val=clean(cells[4].textContent),vm=val.match(/^(.+?)\s*[•·]\s*([+-]?[\d.]+%)$/);if(vm&&!cells[4].querySelector('small'))cells[4].innerHTML=`<b>${vm[1]}</b><small>${vm[2]} ALLOC.</small>`;
    const pl=clean(cells[5].textContent),pm=pl.match(/^(.+?)\s*[•·]\s*([+-]?[\d.]+%)$/);if(pm&&!cells[5].querySelector('small'))cells[5].innerHTML=`<b>${pm[1]}</b><small>${pm[2]}</small>`;
  });
}

function moveSyncContext(){
  const holdings=$('#view-portfolio .holdings-card'),history=$('#tradeHistory');if(!holdings||!history)return;
  let host=$('.positions-context-v45',holdings);if(!host){host=document.createElement('div');host.className='positions-context-v45';const metrics=$('.positions-kpis-v45',holdings);metrics?metrics.after(host):$('.card-head',holdings)?.after(host);}
  const sync=[...history.children].find(x=>/\bSYNC\b/i.test(clean(x.textContent))&&/LOADED SELECTED MY CONTESTS ENTRY/i.test(clean(x.textContent)));
  if(sync){sync.classList.add('positions-sync-row-v45');host.replaceChildren(sync);}else if(!host.children.length)host.hidden=true;else host.hidden=false;
  if(host.children.length)host.hidden=false;
}

let activeOrderTab='queued';
function standardEmpty(box,type){if(!box)return;const meaningful=[...box.children].filter(x=>!x.classList.contains('desktop-orders-empty-v45')&&getComputedStyle(x).display!=='none');let empty=$('.desktop-orders-empty-v45',box);if(meaningful.length){empty?.remove();return;}if(!empty){empty=document.createElement('div');empty.className='desktop-orders-empty-v45';box.appendChild(empty);}empty.innerHTML=type==='queued'?'<b>No queued orders yet</b><span>Market orders waiting for an eligible trading window will appear here.</span>':type==='working'?'<b>No working orders yet</b><span>Limit, Stop and Stop Limit orders waiting for a trigger will appear here.</span>':'<b>No recent activity yet</b><span>Completed buys, sells and triggered orders will appear here.</span>';}
function renderWorkingOrders(){
  const box=$('#workingOrdersV45');if(!box)return;const api=window.SBCNativeOrdersV45,rows=api?.listForCurrent?.()||[];
  box.innerHTML=rows.map(o=>{const type=String(o.orderType||'').replace('_',' ').toUpperCase();const trig=o.orderType==='limit'?`LIMIT $${Number(o.limitPrice).toFixed(2)}`:o.orderType==='stop'?`STOP $${Number(o.stopPrice).toFixed(2)}`:`STOP $${Number(o.stopPrice).toFixed(2)} → LIMIT $${Number(o.limitPrice).toFixed(2)}${o.stopTriggered?' • TRIGGERED':''}`;const size=o.percent?`${o.percent}% SIZING`:`${Number(o.quantity||0).toLocaleString(undefined,{maximumFractionDigits:4})} SHARES`;return `<article class="working-order-row-v45"><div><small>${type}</small><b>${o.side.toUpperCase()} ${o.symbol}</b><span>${size} • ${trig}</span></div><button type="button" data-cancel-working-v45="${o.id}">CANCEL</button></article>`}).join('');
  $$('[data-cancel-working-v45]',box).forEach(b=>b.onclick=()=>{api?.cancel?.(b.dataset.cancelWorkingV45);setTimeout(renderWorkingOrders,0)});standardEmpty(box,'working');
}
function switchOrderTab(tab){activeOrderTab=tab;const queued=$('#queuedOrders'),working=$('#workingOrdersV45'),recent=$('#tradeHistory');[[queued,'queued'],[working,'working'],[recent,'recent']].forEach(([box,key])=>{if(box)box.hidden=key!==tab});$$('.desktop-orders-tabs-v45 button').forEach(b=>{const on=b.dataset.ordersTabV45===tab;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));});if(tab==='working')renderWorkingOrders();if(tab==='queued')standardEmpty(queued,'queued');if(tab==='recent')standardEmpty(recent,'recent');}
function setupOrders(){
  const card=$('#view-portfolio .orders-activity-card'),queued=$('#queuedOrders'),recent=$('#tradeHistory');if(!card||!queued||!recent)return;
  $('.orders-activity-tabs',card)?.classList.add('desktop-native-tabs-hidden-v45');
  let tabs=$('.desktop-orders-tabs-v45',card);if(!tabs){tabs=document.createElement('div');tabs.className='desktop-orders-tabs-v45';tabs.setAttribute('role','tablist');tabs.innerHTML='<button type="button" data-orders-tab-v45="queued">QUEUED ORDERS</button><button type="button" data-orders-tab-v45="working">WORKING ORDERS</button><button type="button" data-orders-tab-v45="recent">RECENT ACTIVITY</button>';const head=$('.card-head',card);head?head.after(tabs):card.prepend(tabs);$$('button',tabs).forEach(b=>b.onclick=()=>switchOrderTab(b.dataset.ordersTabV45));}
  let working=$('#workingOrdersV45',card);if(!working){working=document.createElement('div');working.id='workingOrdersV45';working.className='working-orders-v45';recent.parentNode.insertBefore(working,recent);}
  standardEmpty(queued,'queued');renderWorkingOrders();standardEmpty(recent,'recent');switchOrderTab(activeOrderTab);
}

function simplifyOrderEntry(){
  const ticket=$('#view-portfolio .quick-trade-clean');if(!ticket)return;ticket.classList.add('desktop-order-entry-v45');
  const adv=$('.advanced-order-types-v15',ticket),mode=$('.quick-input-mode',ticket),pct=$('.quick-percent-row',ticket),help=$('.percent-help',ticket);if(!adv||!mode||!pct)return;
  const typeRow=$('.adv-type-row-v15',adv),stopModes=$('.adv-stop-modes-v15',adv),stopLimit=$('[data-stop-mode="stop_limit"]',adv);
  if(typeRow&&stopLimit&&stopLimit.parentElement!==typeRow){stopLimit.textContent='STOP LIMIT';stopLimit.classList.add('desktop-stop-limit-v45');typeRow.appendChild(stopLimit);}if(stopModes)stopModes.classList.add('desktop-stop-modes-retired-v45');
  let grid=$('.desktop-order-grid-v45',ticket);if(!grid){grid=document.createElement('div');grid.className='desktop-order-grid-v45';grid.innerHTML='<section class="desktop-order-type-v45"></section><section class="desktop-order-size-v45"><small>ORDER SIZE</small></section>';const head=$('.quick-trade-head',ticket);head?head.after(grid):ticket.prepend(grid);}
  const left=$('.desktop-order-type-v45',grid),right=$('.desktop-order-size-v45',grid);if(adv.parentElement!==left)left.appendChild(adv);[mode,pct,help].filter(Boolean).forEach(x=>{if(x.parentElement!==right)right.appendChild(x)});
  let typeHelp=$('.desktop-order-help-v45',left);if(!typeHelp){typeHelp=document.createElement('p');typeHelp.className='desktop-order-help-v45';left.appendChild(typeHelp);}
  const update=()=>{const t=ticket.dataset.advType||'market';typeHelp.textContent=t==='market'?'Market executes at the next eligible quote.':t==='limit'?'Limit executes only at your price or better.':t==='stop'?'Stop activates when the stop price is reached, then executes at market.':'Stop Limit activates at the stop, then waits for your limit price or better.';};
  $$('[data-adv-type],[data-stop-mode]',adv).forEach(b=>{if(b.dataset.desktopV45Bound)return;b.dataset.desktopV45Bound='1';b.addEventListener('click',()=>setTimeout(update,0));});update();
}

function simplifyChart(){
  const card=$('#view-portfolio .chart-trade-card');if(!card)return;card.classList.add('desktop-chart-card-v45');card.dataset.chartProviderSlot='market-data-adapter';
  const head=$('.card-head',card);if(head){[...head.children].filter(x=>/^LIVE TRADING$/i.test(clean(x.textContent))).forEach(x=>x.classList.add('desktop-redundant-live-v45'));let actions=$('.desktop-chart-head-actions-v45',head);if(!actions){actions=document.createElement('div');actions.className='desktop-chart-head-actions-v45';actions.innerHTML='<button type="button" data-chart-tools-v45>CHART TOOLS</button><button type="button" data-chart-focus-v45>FOCUS MODE</button>';head.appendChild(actions);$('[data-chart-tools-v45]',actions).onclick=()=>{card.classList.toggle('chart-tools-open-v45')};$('[data-chart-focus-v45]',actions).onclick=()=>toggleChartFocus(card);}}
  const toolbar=$('.chart-toolbar',card);if(toolbar){let pop=$('.desktop-chart-tools-popover-v45',card);if(!pop){pop=document.createElement('div');pop.className='desktop-chart-tools-popover-v45';pop.innerHTML='<header><b>CHART TOOLS</b><button type="button" aria-label="Close chart tools">×</button></header><div></div>';card.appendChild(pop);$('header button',pop).onclick=()=>card.classList.remove('chart-tools-open-v45');}
    const host=$('div',pop);$$('.toolbar-group',toolbar).forEach(g=>{const t=clean(g.textContent).toUpperCase();if(/INDICATORS|\bVIEW\b/.test(t)&&g.parentElement!==host)host.appendChild(g);});
  }
}
function toggleChartFocus(card){const on=!document.body.classList.contains('desktop-chart-focus-v45');document.body.classList.toggle('desktop-chart-focus-v45',on);card.classList.toggle('desktop-chart-focus-card-v45',on);const b=$('[data-chart-focus-v45]',card);if(b)b.textContent=on?'EXIT FOCUS':'FOCUS MODE';if(on)card.scrollTop=0;}

function saveBasketFromDom(){const rows=$$('[data-bb19-range]').map(r=>({symbol:r.dataset.bb19Range,weight:Number(r.value||0)})).filter(x=>x.symbol&&x.weight>0);if(rows.length)localStorage.setItem(BASKET_STORE,JSON.stringify({savedAt:Date.now(),rows}));}
function loadBasketIntoBuilder(){let saved;try{saved=JSON.parse(localStorage.getItem(BASKET_STORE)||'null')}catch(_){}const rows=Array.isArray(saved?.rows)?saved.rows:[];if(!rows.length){showConfirm('BASKET LIBRARY','NO SAVED BASKET YET','CREATE A BASKET FIRST','Your most recent created basket will be available here.','🧺');return;}
  const desired=new Map(rows.map(x=>[x.symbol,Number(x.weight)]));
  const clearNext=()=>{const selected=$('[data-bb19-pick].selected');if(selected){selected.click();setTimeout(clearNext,20);return;}addNext(0);};
  const list=[...desired.keys()];
  const addNext=i=>{if(i>=list.length){setTimeout(applyWeights,40);return;}const b=$(`[data-bb19-pick="${CSS.escape(list[i])}"]`);if(b&&!b.classList.contains('selected'))b.click();setTimeout(()=>addNext(i+1),24);};
  const applyWeights=()=>{for(const [symbol,weight] of desired){const r=$(`[data-bb19-range="${CSS.escape(symbol)}"]`);if(!r)continue;r.value=String(weight);r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}));}showConfirm('BASKET LOADED',`${rows.length} STOCK${rows.length===1?'':'S'} RESTORED`,'READY TO REVIEW','Adjust any weights, then create the ticket.','🧺');};clearNext();
}
function enhanceBasket(){
  const overlay=$('.bb19-overlay');if(!overlay)return;const pane=$('.bb19-pane',overlay),head=$('.bb19-pane-head',pane);if(!head)return;
  let actions=$('.basket-header-actions-v45',head);if(!actions){actions=document.createElement('div');actions.className='basket-header-actions-v45';actions.innerHTML='<button type="button" data-basket-stocks-v45>AVAILABLE STOCKS</button><button type="button" data-load-basket-v45>LOAD BASKET</button>';const label=head.firstElementChild;label?label.after(actions):head.prepend(actions);$('[data-basket-stocks-v45]',actions).onclick=()=>document.querySelector('.available-stocks-v16')?.click();$('[data-load-basket-v45]',actions).onclick=loadBasketIntoBuilder;}
}

function hideQuickUtilities(){const b=$('#view-portfolio .available-stocks-v16');if(b){b.classList.add('desktop-available-stocks-retired-v45');b.setAttribute('aria-hidden','true');}}
function enhance(){layoutPortfolioStats();polishHoldings();moveSyncContext();setupOrders();simplifyOrderEntry();simplifyChart();enhanceBasket();hideQuickUtilities();}
document.addEventListener('click',e=>{if(e.target.closest?.('#bb19Create'))saveBasketFromDom();},true);
window.addEventListener('sbc:working-orders-change',()=>{renderWorkingOrders();setupOrders()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const card=$('#view-portfolio .chart-trade-card');if(card?.classList.contains('chart-tools-open-v45'))card.classList.remove('chart-tools-open-v45');else if(document.body.classList.contains('desktop-chart-focus-v45'))toggleChartFocus(card);}});
function start(){enhance();let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(enhance,90)}).observe(document.body,{childList:true,subtree:true});setInterval(()=>{renderWorkingOrders();enhanceBasket();},1500);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();