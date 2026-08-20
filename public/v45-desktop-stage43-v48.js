(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches||window.__sbcDesktopStage43V48)return;window.__sbcDesktopStage43V48=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const norm=s=>clean(s).toUpperCase();
function textButton(root,label){return $$('button',root).find(b=>norm(b.textContent)===norm(label));}
function clickNative(root,label){const b=textButton(root,label);if(b){b.click();return true}return false;}
function activeText(buttons,fallback){const b=buttons.find(x=>x.classList.contains('active')||x.getAttribute('aria-pressed')==='true'||x.dataset.active==='true');return clean(b?.textContent)||fallback;}

function chartControls(){
  const card=$('#view-portfolio .chart-trade-card');if(!card)return;
  card.classList.add('stage43-chart-v48');
  $$('.desktop-chart-head-actions-v45',card).forEach(x=>x.remove());
  document.body.classList.remove('desktop-chart-focus-v45');card.classList.remove('desktop-chart-focus-card-v45','chart-tools-open-v45');
  const toolbar=$('.chart-toolbar',card);
  if(!toolbar)return;
  const nativeButtons=$$('button',toolbar);
  const timeNames=['TICK','1m','5m','15m','1h','1D'];
  const timeButtons=nativeButtons.filter(b=>timeNames.some(x=>norm(b.textContent)===norm(x)));
  const typeButtons=$$('button',card).filter(b=>['CANDLES','LINE'].includes(norm(b.textContent)));
  let dock=$('.stage43-chart-controls-v48',card);
  if(!dock){
    dock=document.createElement('div');dock.className='stage43-chart-controls-v48';
    dock.innerHTML=`<label><span>TIMEFRAME</span><select data-stage43-time-v48></select></label><details class="stage43-chart-tools-v48"><summary>CHART TOOLS <span>⌄</span></summary><div class="stage43-tools-menu-v48"><section><small>DISPLAY</small><button type="button" data-stage43-chart-action="CANDLES">CANDLES</button><button type="button" data-stage43-chart-action="LINE">LINE</button></section><section><small>INDICATORS</small><button type="button" data-stage43-chart-action="VOL">VOLUME</button><button type="button" data-stage43-chart-action="MA">MA</button><button type="button" data-stage43-chart-action="EMA">EMA</button></section><section><small>VIEW</small><button type="button" data-stage43-chart-action="GRID">GRID</button><button type="button" data-stage43-chart-action="CROSSHAIR">CROSSHAIR</button></section></div></details>`;
    toolbar.before(dock);
    const sel=$('[data-stage43-time-v48]',dock);sel.onchange=()=>{clickNative(toolbar,sel.value);setTimeout(syncChartControls,20)};
    $$('[data-stage43-chart-action]',dock).forEach(b=>b.onclick=()=>{const label=b.dataset.stage43ChartAction;if(!clickNative(card,label)&&label==='VOL')clickNative(card,'VOLUME');setTimeout(syncChartControls,20)});
  }
  const sel=$('[data-stage43-time-v48]',dock);if(sel&&!sel.options.length){const names=timeButtons.length?timeButtons.map(b=>clean(b.textContent)):timeNames;sel.innerHTML=[...new Set(names)].map(x=>`<option value="${x}">${x==='TICK'?'Tick':x}</option>`).join('');}
  toolbar.classList.add('stage43-native-chart-toolbar-v48');
  typeButtons.forEach(b=>b.classList.add('stage43-native-chart-type-v48'));
  const pop=$('.desktop-chart-tools-popover-v45',card);if(pop)pop.classList.add('stage43-old-tools-retired-v48');
  deDupeChartLabels(card);
  syncChartControls();
}
function syncChartControls(){
  const card=$('#view-portfolio .chart-trade-card'),dock=$('.stage43-chart-controls-v48',card),toolbar=$('.chart-toolbar',card);if(!card||!dock||!toolbar)return;
  const sel=$('[data-stage43-time-v48]',dock),timeButtons=$$('button',toolbar).filter(b=>['TICK','1M','5M','15M','1H','1D'].includes(norm(b.textContent)));
  if(sel){const v=activeText(timeButtons,sel.value||'1m');const opt=[...sel.options].find(o=>norm(o.value)===norm(v));if(opt)sel.value=opt.value;}
  $$('[data-stage43-chart-action]',dock).forEach(b=>{const wanted=b.dataset.stage43ChartAction;const native=$$('button',card).find(x=>norm(x.textContent)===(wanted==='VOL'?'VOL':wanted)&&!x.closest('.stage43-chart-controls-v48'));b.classList.toggle('active',!!native&&(native.classList.contains('active')||native.getAttribute('aria-pressed')==='true'));});
}
function deDupeChartLabels(card){
  const candidates=$$('small,span,div',card).filter(x=>x.children.length===0);
  let symbolSeen=0,liveSeen=0;
  candidates.forEach(x=>{const t=norm(x.textContent);if(/^([A-Z]{1,5})$/.test(t)&&t===norm($('#view-portfolio .trade-search-row select')?.value)){symbolSeen++;if(symbolSeen>1)x.classList.add('stage43-duplicate-chart-label-v48');}if(t==='LIVE'||t==='LIVE TRADING'){liveSeen++;if(liveSeen>1)x.classList.add('stage43-duplicate-chart-label-v48');}});
}

function priceWindow(){
  const ticket=$('#view-portfolio .quick-trade-clean'),adv=$('.advanced-order-types-v15',ticket),row=$('.adv-price-row-v15',ticket);if(!ticket||!adv||!row)return;
  ticket.classList.add('stage43-order-entry-v48');
  let win=$('.stage43-price-window-v48',ticket);
  if(!win){win=document.createElement('section');win.className='stage43-price-window-v48';win.innerHTML='<header><div><small>ORDER CONDITIONS</small><b data-stage43-price-title>PRICE</b></div><button type="button" data-stage43-price-close aria-label="Close order condition window">×</button></header><div class="stage43-price-fields-v48"></div>';const grid=$('.desktop-order-grid-v45',ticket);grid?grid.after(win):adv.after(win);$('[data-stage43-price-close]',win).onclick=()=>{const market=$('[data-adv-type="market"]',ticket);market?.click();setTimeout(()=>syncPriceWindow(ticket),10)};}
  const host=$('.stage43-price-fields-v48',win);if(row.parentElement!==host)host.appendChild(row);
  $$('[data-adv-type],[data-stop-mode]',ticket).forEach(b=>{if(b.dataset.stage43PriceBound)return;b.dataset.stage43PriceBound='1';b.addEventListener('click',()=>setTimeout(()=>syncPriceWindow(ticket),0));});
  syncPriceWindow(ticket);
}
function syncPriceWindow(ticket){
  const win=$('.stage43-price-window-v48',ticket);if(!win)return;const type=ticket.dataset.advType||'market';
  const title=$('[data-stage43-price-title]',win);if(type==='market'){win.hidden=true;return;}
  win.hidden=false;title.textContent=type==='limit'?'LIMIT PRICE':type==='stop'?'STOP LOSS':'STOP LOSS + LIMIT';
  const limit=$('.adv-limit-v15',win),stop=$('.adv-stop-v15',win);if(limit)limit.hidden=!(type==='limit'||type==='stop_limit');if(stop)stop.hidden=!(type==='stop'||type==='stop_limit');
  if(type==='limit')$('.adv-limit-price-v15',win)?.focus();else $('.adv-stop-price-v15',win)?.focus();
}

function layoutCleanup(){
  const v=$('#view-portfolio'),grid=$('.trading-workspace-v47',v),chart=$('.chart-trade-card',v),ticket=$('.quick-trade-clean',chart);if(!v||!grid||!chart||!ticket)return;
  grid.classList.add('stage43-workspace-v48');chart.classList.add('stage43-chart-order-v48');ticket.classList.add('stage43-centered-oe-v48');
  if(window.__sbcDesktopStage51V55){const old=$('.stage43-analysis-bottom-v48',v);if(old)old.classList.add('stage51-retired-bottom-v55');return;}
  const stage51Owned=x=>!!x.closest('.stage51-header-strip-v55,.stage51-modal-v55,.stage51-native-stash-v55,[data-stage51-source]');
  const analytics=$$('body *').filter(x=>{if(stage51Owned(x))return false;const t=norm(x.textContent);return x.children.length>0&&(t.startsWith('PORTFOLIO ANALYTICS')||t.startsWith('ADVANCED PERFORMANCE CHARTS'));});
  const unique=analytics.filter(x=>!analytics.some(y=>y!==x&&y.contains(x)));
  if(unique.length){let bottom=$('.stage43-analysis-bottom-v48',v);if(!bottom){bottom=document.createElement('section');bottom.className='stage43-analysis-bottom-v48';bottom.innerHTML='<header><small>ANALYSIS</small><h3>PORTFOLIO ANALYSIS</h3></header><div></div>';grid.after(bottom);}const host=$(':scope>div',bottom);unique.forEach(x=>{x.classList.add('stage43-analysis-card-v48');if(x.parentElement!==host)host.appendChild(x);});}
}
function enlargeBasket(){const b=$('#view-portfolio .quick-ticket-launch');if(b)b.classList.add('stage43-basket-launch-v48');}
function enhance(){chartControls();priceWindow();layoutCleanup();enlargeBasket();}
function start(){enhance();let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(enhance,80)}).observe(document.body,{childList:true,subtree:true});setInterval(enhance,1400);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();