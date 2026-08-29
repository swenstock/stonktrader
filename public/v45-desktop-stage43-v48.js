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
    dock.innerHTML=`<div class="stage43-time-strip-v49">${timeNames.map(x=>`<button type="button" data-stage43-time-v49="${x}">${x==='TICK'?'1s':x}</button>`).join('')}</div><details class="stage43-chart-tools-v48"><summary>CHART TOOLS <span>⌄</span></summary><div class="stage43-tools-menu-v48"><section><small>DISPLAY</small><button type="button" data-stage43-chart-action="CANDLES">CANDLES</button><button type="button" data-stage43-chart-action="LINE">LINE</button></section><section><small>INDICATORS</small><button type="button" data-stage43-chart-action="VOL">VOLUME</button><button type="button" data-stage43-chart-action="MA">MA</button><button type="button" data-stage43-chart-action="EMA">EMA</button></section><section><small>VIEW</small><button type="button" data-stage43-chart-action="GRID">GRID</button><button type="button" data-stage43-chart-action="CROSSHAIR">CROSSHAIR</button></section></div></details>`;
    toolbar.before(dock);
    $$('[data-stage43-time-v49]',dock).forEach(b=>b.onclick=()=>{clickNative(toolbar,b.dataset.stage43TimeV49);setTimeout(syncChartControls,20);});
    $$('[data-stage43-chart-action]',dock).forEach(b=>b.onclick=()=>{const label=b.dataset.stage43ChartAction;if(!clickNative(card,label)&&label==='VOL')clickNative(card,'VOLUME');setTimeout(syncChartControls,20)});
  }
  toolbar.classList.add('stage43-native-chart-toolbar-v48');
  typeButtons.forEach(b=>b.classList.add('stage43-native-chart-type-v48'));
  const pop=$('.desktop-chart-tools-popover-v45',card);if(pop)pop.classList.add('stage43-old-tools-retired-v48');
  deDupeChartLabels(card);
  syncChartControls();
}
function syncChartControls(){
  const card=$('#view-portfolio .chart-trade-card'),dock=$('.stage43-chart-controls-v48',card),toolbar=$('.chart-toolbar',card);if(!card||!dock||!toolbar)return;
  const timeButtons=$$('button',toolbar).filter(b=>['TICK','1M','5M','15M','1H','1D'].includes(norm(b.textContent))),active=norm(activeText(timeButtons,''));
  $$('[data-stage43-time-v49]',dock).forEach(b=>b.classList.toggle('active',norm(b.dataset.stage43TimeV49)===active));
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
  $$('[data-adv-type],[data-stop-mode]',ticket).forEach(b=>{if(b.dataset.stage43PriceBound)return;b.dataset.stage43PriceBound='1';b.addEventListener('click',()=>setTimeout(()=>{syncPriceWindow(ticket);const type=ticket.dataset.advType||'market';const input=type==='limit'?$('.adv-limit-price-v15',ticket):['stop','stop_limit'].includes(type)?$('.adv-stop-price-v15',ticket):null;if(input&&document.activeElement!==input)input.focus({preventScroll:true});},0));});
  syncPriceWindow(ticket);
}
function syncPriceWindow(ticket){
  const win=$('.stage43-price-window-v48',ticket);if(!win)return;const type=ticket.dataset.advType||'market';
  const title=$('[data-stage43-price-title]',win);if(type==='market'){win.hidden=true;return;}
  win.hidden=false;title.textContent=type==='limit'?'LIMIT PRICE':type==='stop'?'STOP LOSS':'STOP LOSS + LIMIT';
  const limit=$('.adv-limit-v15',win),stop=$('.adv-stop-v15',win);if(limit)limit.hidden=!(type==='limit'||type==='stop_limit');if(stop)stop.hidden=!(type==='stop'||type==='stop_limit');
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
const detailMoney=n=>Number.isFinite(Number(n))?'$'+Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const detailDate=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'});};
function rowParts(row){const kids=[...row.children];return{side:norm($('.blotter-side-v15',row)?.textContent||kids[0]?.textContent),symbol:norm(row.querySelector('strong')?.textContent||kids[1]?.textContent),size:clean(kids[2]?.textContent),priceText:clean(kids[3]?.textContent),status:norm(kids[4]?.textContent)};}
function rowPrice(text){const m=String(text||'').replace(/,/g,'').match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);return m?Number(m[1]):null;}
function matchAdvancedOrder(row){const p=rowParts(row),orders=Array.isArray(window.SBCAdvancedOrdersV15?.cache?.orders)?window.SBCAdvancedOrdersV15.cache.orders:[],px=rowPrice(p.priceText),c=orders.filter(o=>['filled','executed'].includes(String(o.status||o.rawStatus||'').toLowerCase())&&norm(o.symbol)===p.symbol&&norm(o.side)===p.side);if(!c.length)return null;return c.sort((a,b)=>{const ad=px==null?0:Math.abs(Number(a.executedPrice||0)-px),bd=px==null?0:Math.abs(Number(b.executedPrice||0)-px);return ad!==bd?ad-bd:new Date(b.executedAt||0)-new Date(a.executedAt||0);})[0];}
function closeOrderDetail(){document.getElementById('sbcOrderDetailV1')?.remove();}
function detailField(label,value){return `<div><small>${label}</small><b>${value==null||value===''?'—':value}</b></div>`;}
function openOrderDetail(row){
  const p=rowParts(row),o=matchAdvancedOrder(row),px=rowPrice(p.priceText),root=document.createElement('div');root.id='sbcOrderDetailV1';root.className='sbc-order-detail-v1';
  const type=o?norm(String(o.orderType||'market').replace('_',' ')):'TRADE',size=o?(o.quantity!=null?`${Number(o.quantity).toLocaleString(undefined,{maximumFractionDigits:6})} SHARES`:`${Number(o.percent||0)}% SIZE`):p.size;
  const instructions=o?`${detailField('ORDER TYPE',type)}${detailField('SIDE',norm(o.side))}${detailField('SYMBOL',norm(o.symbol))}${detailField('SIZE',size)}${detailField('LIMIT PRICE',o.limitPrice!=null?detailMoney(o.limitPrice):'—')}${detailField('STOP PRICE',o.stopPrice!=null?detailMoney(o.stopPrice):'—')}${detailField('CREATED',detailDate(o.createdAt))}${detailField('LAST REPLACED',o.replacedAt?detailDate(o.replacedAt):'—')}`:`${detailField('SIDE',p.side)}${detailField('SYMBOL',p.symbol)}${detailField('SIZE',p.size)}${detailField('ORDER TYPE','MARKET / DIRECT FILL')}`;
  const execution=o?`${detailField('TRIGGERED',o.triggeredAt?detailDate(o.triggeredAt):'—')}${detailField('FILLED',detailDate(o.executedAt))}${detailField('FILL PRICE',detailMoney(o.executedPrice||px))}${detailField('STATUS','FILLED')}`:`${detailField('FILL PRICE',px!=null?detailMoney(px):p.priceText)}${detailField('STATUS',p.status||'FILLED')}`;
  root.innerHTML=`<section tabindex="-1" role="dialog" aria-modal="true" aria-label="Order details"><header><div><small>ORDER DETAILS</small><h2>${p.side} ${p.symbol}</h2><p>${type}${o?.replacedAt?' • REPLACED':''}</p></div><button type="button" data-order-detail-close aria-label="Close">×</button></header><h3>ORDER INSTRUCTIONS</h3><div class="sbc-order-detail-grid-v1">${instructions}</div><h3>EXECUTION</h3><div class="sbc-order-detail-grid-v1">${execution}</div><footer><span>${o?'Backend order instructions and execution state.':'Authoritative fill details.'}</span><button type="button" data-order-detail-done>DONE</button></footer></section>`;
  document.body.appendChild(root);$('[data-order-detail-close]',root).onclick=closeOrderDetail;$('[data-order-detail-done]',root).onclick=closeOrderDetail;root.onclick=e=>{if(e.target===root)closeOrderDetail();};requestAnimationFrame(()=>root.querySelector('section')?.focus({preventScroll:true}));
}
function activityDetails(){const root=$('#view-portfolio .orders-activity-blotter-v15');if(!root||root.dataset.stage43DetailBound)return;root.dataset.stage43DetailBound='1';root.addEventListener('click',e=>{if(e.target.closest('button,input,select,a'))return;const row=e.target.closest('.blotter-row-v15');if(!row||!row.closest('[data-panel="recent"],[data-panel="fills"]'))return;e.preventDefault();openOrderDetail(row);});}
function enhance(){chartControls();priceWindow();layoutCleanup();enlargeBasket();activityDetails();}
function start(){enhance();let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(enhance,80)}).observe(document.body,{childList:true,subtree:true});setInterval(enhance,1400);}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeOrderDetail();});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();