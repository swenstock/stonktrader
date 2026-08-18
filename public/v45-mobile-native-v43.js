(()=>{
'use strict';
if(window.__sbcMobileNativeV43)return;window.__sbcMobileNativeV43=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const mq=matchMedia('(max-width:760px)');
const STORE={trade:'sbcM43TradeTab',exchange:'sbcM43ExchangeTab',view:'sbcM43View',scroll:'sbcM43Scroll'};
const state={tradeTab:sessionStorage.getItem(STORE.trade)||'trade',exchangeTab:sessionStorage.getItem(STORE.exchange)||'bid',socket:null,reconnectTimer:null,reconnectTry:0,lastQuoteAt:0,connection:'boot',preDisconnect:{},posFingerprint:'',observerTimer:null,lastView:'',hiddenAt:0};
const SHEET_ROOTS='.ticket-order-modal,.record-modal,.ai-analysis-modal,.rules-gate,.allocation-modal,.findme-modal,.standing-modal,.entry-confirm-modal,.entry-success,.test-clock-modal,.ta42-confirm,.tm39-fill-confirm';
const SHEET_CARDS='.ticket-order-card,.record-card,.ai-analysis-card,.rules-card,.allocation-card,.findme-card,.standing-card,.entry-confirm-card,.entry-success-card,.test-clock-card,.ta42-confirm>section,.tm39-fill-confirm>section';
function mobile(){return mq.matches}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function text(el){return (el?.textContent||'').replace(/\s+/g,' ').trim()}
function currentView(){
  const views=$$('.view[id^="view-"]');
  const v=views.find(x=>{const st=getComputedStyle(x);return st.display!=='none'&&st.visibility!=='hidden'&&(x.classList.contains('active')||x.offsetHeight>0)});
  return v?.id?.replace(/^view-/,'')||'';
}
function ensureViewport(){
  let meta=$('meta[name="viewport"]');
  if(!meta){meta=document.createElement('meta');meta.name='viewport';document.head.appendChild(meta)}
  if(!/viewport-fit=cover/i.test(meta.content||''))meta.content='width=device-width, initial-scale=1, viewport-fit=cover';
}
function ensureBottomNav(){
  const nav=$('.mobile-bottom-nav');if(!nav)return;
  nav.setAttribute('aria-label','Primary navigation');
  const labels={lobby:'Lobby',floor:'Trading Floor',my:'My Contests',exchange:'Ticket Exchange',leaders:'Leaderboards'};
  $$('button',nav).forEach(b=>{
    const raw=b.getAttribute('onclick')||'',m=raw.match(/showView\(['"]([^'"]+)/),view=m?.[1]||'';
    if(view){b.dataset.sbcM43View=view;b.setAttribute('aria-label',labels[view]||view);}
  });
  syncNavActive();
}
function syncNavActive(){
  if(!mobile())return;const v=currentView()||state.lastView;if(v)state.lastView=v;
  $$('.mobile-bottom-nav button').forEach(b=>{const on=b.dataset.sbcM43View===v;b.classList.toggle('sbc-m43-active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  if(v)sessionStorage.setItem(STORE.view,v);
}
function ensureTradeTabs(){
  if(!mobile())return;const view=$('#view-portfolio'),summary=$('#view-portfolio .portfolio-summary');if(!view||!summary)return;
  let tabs=$('.sbc-m43-trade-tabs',view);
  if(!tabs){
    tabs=document.createElement('nav');tabs.className='sbc-m43-trade-tabs';tabs.setAttribute('aria-label','Portfolio sections');
    tabs.innerHTML='<button type="button" data-m43-trade="trade"><b>⌁</b>CHART + TRADE</button><button type="button" data-m43-trade="positions"><b>▤</b>POSITIONS</button><button type="button" data-m43-trade="analytics"><b>⌁</b>ANALYTICS</button>';
    summary.insertAdjacentElement('afterend',tabs);
    $$('[data-m43-trade]',tabs).forEach(b=>b.onclick=()=>setTradeTab(b.dataset.m43Trade,true));
  }
  if(!['trade','positions','analytics'].includes(state.tradeTab))state.tradeTab='trade';
  setTradeTab(state.tradeTab,false);
}
function setTradeTab(tab,user=false){
  if(!mobile())return;const view=$('#view-portfolio');if(!view)return;
  state.tradeTab=tab;sessionStorage.setItem(STORE.trade,tab);view.dataset.sbcMobileTab=tab;
  $$('.sbc-m43-trade-tabs button',view).forEach(b=>{const on=b.dataset.m43Trade===tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1});
  if(tab==='analytics')$('#analyticsDock')?.classList.add('open');
  if(user){const y=Number(sessionStorage.getItem(`${STORE.scroll}:portfolio:${tab}`)||0);requestAnimationFrame(()=>scrollTo({top:y,behavior:'smooth'}));}
  syncPositionCards();
}
function ensureSymbolChips(){
  if(!mobile())return;const select=$('#tradeSymbol'),picker=$('#view-portfolio .clean-stock-picker');if(!select||!picker)return;
  let row=$('.sbc-m43-symbol-chips',picker.parentElement);
  if(!row){row=document.createElement('div');row.className='sbc-m43-symbol-chips';row.setAttribute('role','listbox');row.setAttribute('aria-label','Stock symbols');picker.insertAdjacentElement('afterend',row)}
  const options=[...select.options].filter(o=>o.value);
  const key=options.map(o=>`${o.value}:${o.text}`).join('|');
  if(row.dataset.key!==key){row.dataset.key=key;row.innerHTML=options.map(o=>`<button type="button" data-m43-symbol="${esc(o.value)}" role="option">${esc(o.value)}</button>`).join('');$$('[data-m43-symbol]',row).forEach(b=>b.onclick=()=>chooseSymbol(b.dataset.m43Symbol));}
  $$('[data-m43-symbol]',row).forEach(b=>{const on=b.dataset.m43Symbol===select.value;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on))});
  const search=$('button',picker);if(search&&!search.dataset.m43Search){search.dataset.m43Search='1';search.setAttribute('aria-label','Search stocks');search.addEventListener('click',e=>{if(!mobile())return;e.preventDefault();e.stopImmediatePropagation();openSymbolSheet()},true)}
}
function chooseSymbol(sym){const select=$('#tradeSymbol');if(!select)return;select.value=sym;select.dispatchEvent(new Event('change',{bubbles:true}));ensureSymbolChips();closeSymbolSheet();}
function ensureSymbolSheet(){
  if($('#sbcM43SymbolSheet'))return;const root=document.createElement('div');root.id='sbcM43SymbolSheet';root.setAttribute('aria-hidden','true');
  root.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="sbcM43SymbolTitle"><div class="handle"></div><header><h2 id="sbcM43SymbolTitle">CHOOSE A STOCK</h2><button type="button" class="close" aria-label="Close stock picker">×</button></header><input id="sbcM43SymbolSearch" type="search" autocomplete="off" autocapitalize="characters" placeholder="Search symbol…" aria-label="Search stock symbols"><div id="sbcM43SymbolResults"></div></section>';
  document.body.appendChild(root);$('.close',root).onclick=closeSymbolSheet;root.onclick=e=>{if(e.target===root)closeSymbolSheet()};$('#sbcM43SymbolSearch',root).addEventListener('input',renderSymbolResults);wireSwipeSheet(root,$('section',root),closeSymbolSheet);
}
function renderSymbolResults(){ensureSymbolSheet();const root=$('#sbcM43SymbolSheet'),q=String($('#sbcM43SymbolSearch',root)?.value||'').trim().toUpperCase(),select=$('#tradeSymbol');if(!select)return;const opts=[...select.options].filter(o=>o.value&&(!q||o.value.toUpperCase().includes(q)||o.text.toUpperCase().includes(q)));$('#sbcM43SymbolResults',root).innerHTML=opts.map(o=>`<button type="button" data-pick="${esc(o.value)}">${esc(o.value)}</button>`).join('');$$('[data-pick]',root).forEach(b=>b.onclick=()=>chooseSymbol(b.dataset.pick));}
function openSymbolSheet(){ensureSymbolSheet();renderSymbolResults();const root=$('#sbcM43SymbolSheet');root.classList.add('open');root.setAttribute('aria-hidden','false');setTimeout(()=>$('#sbcM43SymbolSearch',root)?.focus(),70)}
function closeSymbolSheet(){const root=$('#sbcM43SymbolSheet');if(!root)return;root.classList.remove('open');root.setAttribute('aria-hidden','true')}
function parsePnl(t){const raw=String(t||'').replace(/,/g,'');const m=raw.match(/[-+]?\$?\s*([\d.]+)/);if(!m)return 0;const n=Number(m[1]||0);return /^\s*-/.test(raw)?-n:n}
function syncPositionCards(){
  if(!mobile())return;const table=$('#view-portfolio .holdings-table'),tbody=$('#portfolioHoldings'),card=table?.closest('.holdings-card');if(!table||!tbody||!card)return;
  let box=$('#sbcM43PositionCards',card);if(!box){box=document.createElement('div');box.id='sbcM43PositionCards';table.insertAdjacentElement('afterend',box)}
  const rows=$$('tr',tbody),finger=rows.map(r=>text(r)).join('||');if(finger===state.posFingerprint&&box.children.length)return;state.posFingerprint=finger;
  if(!rows.length){box.innerHTML='<div class="sbc-m43-empty">100% cash — no open positions yet.</div>';return}
  box.innerHTML=rows.map((r,i)=>{const c=$$('td',r),vals=c.map(text),symbol=vals[0]||'—',shares=vals[1]||'—',avg=vals[2]||'—',price=vals[3]||'—',value=vals[4]||'—',pnl=vals[5]||'—',n=parsePnl(pnl);return `<article class="sbc-m43-position-card" data-m43-pos="${i}" tabindex="0" role="button" aria-expanded="false"><div class="sbc-m43-position-main"><div class="sbc-m43-position-symbol"><b>${esc(symbol)}</b><span>${esc(shares)} shares</span></div><div class="sbc-m43-position-pnl ${n<0?'sbc-m43-loss':'sbc-m43-gain'}">${esc(pnl)}</div></div><div class="sbc-m43-position-details"><div><small>AVG COST</small><b>${esc(avg)}</b></div><div><small>LAST PRICE</small><b>${esc(price)}</b></div><div><small>VALUE / ALLOCATION</small><b>${esc(value)}</b></div><div><small>SHARES</small><b>${esc(shares)}</b></div></div><div class="sbc-m43-position-actions"><span>Tap card for details</span><button type="button" data-m43-trade-pos="${i}">TRADE ${esc(symbol)}</button></div></article>`}).join('');
  $$('[data-m43-pos]',box).forEach(el=>{const toggle=()=>{const on=!el.classList.contains('open');el.classList.toggle('open',on);el.setAttribute('aria-expanded',String(on))};el.onclick=e=>{if(e.target.closest('button'))return;toggle()};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}}});
  $$('[data-m43-trade-pos]',box).forEach(b=>b.onclick=e=>{e.stopPropagation();const r=rows[Number(b.dataset.m43TradePos)];if(r){setTradeTab('trade',false);r.click();setTimeout(()=>$('#symbolChartCard')?.scrollIntoView({block:'start',behavior:'smooth'}),80)}});
}
function labelTable(table){
  if(!table||table.classList.contains('holdings-table'))return;table.classList.add('sbc-m43-card-table');const heads=$$('thead th',table).map(text);$$('tbody tr',table).forEach(r=>$$('td',r).forEach((c,i)=>{if(!c.dataset.label)c.dataset.label=heads[i]||`FIELD ${i+1}`}));
}
function enhanceTables(){if(!mobile())return;$$('#view-leaders table,#view-my table,#view-floor table,.findme-modal table,.standing-modal table').forEach(labelTable);decoratePnl()}
function decoratePnl(){
  if(!mobile())return;$$('#view-leaders td,#view-my td,#view-portfolio .order-row b,#view-leaders b').forEach(el=>{const t=text(el);if(!/[+$-][\d$]|P&L/i.test(t))return;if(/^\s*[-−]/.test(t)||/P&L\s*[-−]/i.test(t)){el.classList.add('sbc-m43-loss');el.classList.remove('sbc-m43-gain')}else if(/^\s*\+/.test(t)||/P&L\s*\+/i.test(t)){el.classList.add('sbc-m43-gain');el.classList.remove('sbc-m43-loss')}});
}
function locateBooks(){
  const grid=$('#view-exchange .ticket-market-grid');if(!grid)return{};const children=$$(':scope > .book-side',grid);let bid=$('.bid-book',grid),ask=$('.ask-book',grid);if(!bid)bid=children.find(x=>/BIDS/i.test(text($('.book-side-head',x))));if(!ask)ask=children.find(x=>/OFFERS|ASKS/i.test(text($('.book-side-head',x))));return{grid,bid,ask};
}
function ensureExchangeTabs(){
  if(!mobile())return;const {grid,bid,ask}=locateBooks();if(!grid||!bid||!ask)return;let tabs=$('.sbc-m43-exchange-tabs',grid.parentElement);if(!tabs){tabs=document.createElement('nav');tabs.className='sbc-m43-exchange-tabs';tabs.setAttribute('aria-label','Ticket order book side');tabs.innerHTML='<button type="button" data-side="bid">BIDS</button><button type="button" data-side="ask">OFFERS</button>';grid.insertAdjacentElement('beforebegin',tabs);$$('button',tabs).forEach(b=>b.onclick=()=>setExchangeTab(b.dataset.side,true))}setExchangeTab(state.exchangeTab,false);
}
function setExchangeTab(side,user=false){
  if(!['bid','ask'].includes(side))side='bid';state.exchangeTab=side;sessionStorage.setItem(STORE.exchange,side);const {bid,ask}=locateBooks(),tabs=$('.sbc-m43-exchange-tabs');if(!bid||!ask)return;bid.classList.toggle('sbc-m43-book-active',side==='bid');ask.classList.toggle('sbc-m43-book-active',side==='ask');$$('button',tabs).forEach(b=>b.setAttribute('aria-selected',String(b.dataset.side===side)));if(user)(side==='bid'?bid:ask).scrollTop=0;
}
function labelIconButtons(){
  if(!mobile())return;const map={'×':'Close','✕':'Close','⌕':'Search','⚙':'Settings','☰':'Menu','↻':'Refresh','◀':'Previous','▶':'Next'};$$('button').forEach(b=>{if(b.getAttribute('aria-label'))return;const t=text(b);if(map[t]){b.setAttribute('aria-label',map[t]);b.dataset.sbcM43IconOnly='1';return}if(b.id==='candlesBtn')b.setAttribute('aria-label','Candlestick chart');if(b.id==='lineBtn')b.setAttribute('aria-label','Line chart')});
}
function closeNativeSheet(root){
  const buttons=$$('button',root);const close=buttons.find(b=>b.matches('[aria-label*="close" i],.tm35-x,.ta42-x,.tm39-fill-x,.qt-x')||/^(×|✕|CLOSE|CANCEL)$/i.test(text(b)));if(close){close.click();return}root.classList.remove('open','show');root.setAttribute('aria-hidden','true');if('hidden'in root)root.hidden=true;
}
function wireSwipeSheet(root,card,customClose){
  if(!root||!card||card.dataset.m43Swipe)return;card.dataset.m43Swipe='1';let sy=0,dy=0,active=false,pid=null;
  card.addEventListener('pointerdown',e=>{if(!mobile()||e.pointerType==='mouse'&&e.button!==0)return;const rect=card.getBoundingClientRect();if(e.clientY-rect.top>92)return;active=true;pid=e.pointerId;sy=e.clientY;dy=0;try{card.setPointerCapture(pid)}catch(_){}card.classList.add('sbc-m43-sheet-dragging')});
  card.addEventListener('pointermove',e=>{if(!active||e.pointerId!==pid)return;dy=Math.max(0,e.clientY-sy);if(dy)card.style.transform=`translateY(${Math.min(dy,180)}px)`});
  const end=e=>{if(!active||e.pointerId!==pid)return;active=false;card.classList.remove('sbc-m43-sheet-dragging');card.classList.add('sbc-m43-sheet-return');const dismiss=dy>86;card.style.transform='';setTimeout(()=>card.classList.remove('sbc-m43-sheet-return'),200);if(dismiss)(customClose||(()=>closeNativeSheet(root)))()};card.addEventListener('pointerup',end);card.addEventListener('pointercancel',end);
}
function wireSheets(){if(!mobile())return;$$(SHEET_ROOTS).forEach(root=>{const card=$(SHEET_CARDS,root)||root.firstElementChild;if(card)wireSwipeSheet(root,card)})}
function ensureConnectionBadge(){
  if(!mobile())return;let el=$('#sbcM43Connection');if(!el){el=document.createElement('div');el.id='sbcM43Connection';el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.textContent='CONNECTING';document.body.appendChild(el)}
}
function priceSnapshot(){const out={};['#pValue','#pPL','#quotePrice','#symbolQuoteLine','#summaryBid','#summaryAsk','#summaryLast'].forEach(sel=>{const el=$(sel);if(el)out[sel]=text(el)});return out}
function flashReconnectChanges(before){Object.entries(before||{}).forEach(([sel,old])=>{const el=$(sel);if(el&&text(el)!==old){el.classList.remove('sbc-m43-reconnect-flash');void el.offsetWidth;el.classList.add('sbc-m43-reconnect-flash');setTimeout(()=>el.classList.remove('sbc-m43-reconnect-flash'),1300)}})}
function tradeButtons(){return $$('#view-portfolio .quick-action,#view-portfolio #submitTradeBtn')}
function setTradingBlocked(block){tradeButtons().forEach(b=>{if(block){if(b.dataset.m43WasDisabled==null)b.dataset.m43WasDisabled=b.disabled?'1':'0';b.disabled=true;b.setAttribute('aria-disabled','true');b.title='Live market data is stale. Trading resumes after reconnection.'}else{if(b.dataset.m43WasDisabled==='0')b.disabled=false;b.removeAttribute('data-m43-was-disabled');b.removeAttribute('aria-disabled');if(/Live market data is stale/.test(b.title||''))b.removeAttribute('title')}})}
function setConnection(next,label){
  if(!mobile())return;ensureConnectionBadge();const was=state.connection;if(was===next&&(!label||text($('#sbcM43Connection'))===label))return;
  if((next==='stale'||next==='reconnecting')&&was==='live')state.preDisconnect=priceSnapshot();
  state.connection=next;document.body.classList.toggle('sbc-m43-stale',next==='stale');document.body.classList.toggle('sbc-m43-reconnecting',next==='reconnecting');const el=$('#sbcM43Connection');if(el)el.textContent=label||(next==='live'?'LIVE DATA':next==='reconnecting'?'RECONNECTING':'STALE DATA');setTradingBlocked(next!=='live');
  const dot=$('#view-portfolio .live-dot-chart');if(dot){if(!dot.dataset.m43LiveText)dot.dataset.m43LiveText=text(dot)||'● LIVE';if(next==='live')dot.textContent=dot.dataset.m43LiveText;else dot.textContent=next==='stale'?'● STALE':'● RECONNECTING'}
  if(next==='live'&&was!=='live')flashReconnectChanges(state.preDisconnect);
}
function wsUrl(){return `${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`}
function clearReconnect(){clearTimeout(state.reconnectTimer);state.reconnectTimer=null}
function scheduleReconnect(){if(!mobile()||document.hidden||!navigator.onLine)return;clearReconnect();const delay=Math.min(15000,800*Math.pow(2,Math.min(5,state.reconnectTry++)));state.reconnectTimer=setTimeout(connectFeed,delay)}
async function healthFallback(){if(!mobile()||!navigator.onLine)return false;try{const ctrl=new AbortController(),to=setTimeout(()=>ctrl.abort(),2500),r=await fetch('/api/health',{cache:'no-store',signal:ctrl.signal});clearTimeout(to);return r.ok}catch(_){return false}}
function connectFeed(){
  if(!mobile()||document.hidden)return;clearReconnect();if(!navigator.onLine){setConnection('stale','OFFLINE');return}
  if(state.socket){try{state.socket.onclose=null;state.socket.close()}catch(_){}state.socket=null}
  setConnection('reconnecting','RECONNECTING');
  if(!('WebSocket'in window)){healthFallback().then(ok=>setConnection(ok?'live':'stale',ok?'SERVER LIVE':'STALE DATA'));return}
  let ws;try{ws=new WebSocket(wsUrl());state.socket=ws}catch(_){scheduleReconnect();return}
  const openedAt=Date.now();
  ws.onopen=()=>{state.reconnectTry=0};
  ws.onmessage=e=>{let packet=null;try{packet=JSON.parse(e.data)}catch(_){}if(packet?.type==='quotes'){state.lastQuoteAt=Date.now();setConnection('live','LIVE DATA')}};
  ws.onerror=()=>{};
  ws.onclose=async()=>{if(state.socket!==ws)return;state.socket=null;const ok=await healthFallback();if(ok&&Date.now()-state.lastQuoteAt<7000)setConnection('live','SERVER LIVE');else setConnection('reconnecting','RECONNECTING');scheduleReconnect()};
  setTimeout(async()=>{if(state.socket!==ws||state.connection==='live')return;const ok=await healthFallback();if(!ok||Date.now()-openedAt>4500)setConnection('stale',ok?'QUOTE FEED STALE':'STALE DATA')},4500);
}
function monitorFeed(){if(!mobile()||document.hidden)return;if(state.connection==='live'&&state.lastQuoteAt&&Date.now()-state.lastQuoteAt>6500){setConnection('stale','QUOTE FEED STALE');try{state.socket?.close()}catch(_){}}}
function saveContext(){if(!mobile())return;const v=currentView()||state.lastView;if(v){sessionStorage.setItem(STORE.view,v);sessionStorage.setItem(`${STORE.scroll}:${v}:${v==='portfolio'?state.tradeTab:'main'}`,String(Math.round(scrollY)))}}
function restoreContext(){if(!mobile())return;const v=currentView();if(v==='portfolio')setTradeTab(sessionStorage.getItem(STORE.trade)||state.tradeTab,false);if(v==='exchange')setExchangeTab(sessionStorage.getItem(STORE.exchange)||state.exchangeTab,false);const key=`${STORE.scroll}:${v}:${v==='portfolio'?state.tradeTab:'main'}`,y=Number(sessionStorage.getItem(key)||0);if(y>0)setTimeout(()=>scrollTo({top:y}),120)}
function connectionEvents(){
  addEventListener('offline',()=>{if(!mobile())return;setConnection('stale','OFFLINE');try{state.socket?.close()}catch(_){}});
  addEventListener('online',()=>{if(!mobile())return;setConnection('reconnecting','RECONNECTING');connectFeed()});
  document.addEventListener('visibilitychange',()=>{if(!mobile())return;if(document.hidden){state.hiddenAt=Date.now();saveContext();try{state.socket?.close()}catch(_){}}else{setConnection('reconnecting',state.hiddenAt?'CHECKING LIVE DATA':'RECONNECTING');connectFeed();restoreContext()}});
  addEventListener('pagehide',saveContext);addEventListener('pageshow',()=>{if(mobile()){restoreContext();connectFeed()}});
}
function run(){
  if(!mobile())return;document.documentElement.classList.add('sbc-mobile-v43');ensureViewport();ensureBottomNav();ensureTradeTabs();ensureSymbolChips();syncPositionCards();enhanceTables();ensureExchangeTabs();wireSheets();labelIconButtons();ensureConnectionBadge();syncNavActive();
}
function scheduleRun(){clearTimeout(state.observerTimer);state.observerTimer=setTimeout(run,120)}
function start(){
  run();connectionEvents();connectFeed();setInterval(monitorFeed,1000);
  const obs=new MutationObserver(scheduleRun);obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
  mq.addEventListener?.('change',()=>{if(mobile()){run();connectFeed()}else{try{state.socket?.close()}catch(_){}}});
  setTimeout(run,350);setTimeout(run,1000);setTimeout(run,2200);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
