(()=>{
'use strict';
if(window.__sbcTradingWorkstationV1)return;window.__sbcTradingWorkstationV1=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const norm=s=>String(s||'').trim().toUpperCase();
const valid=s=>/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s);
const BASKET_STORE='sbcLastBasketV45';
const QUOTE_ROUTE='/api/quotes';
let symbols=['AAPL','MSFT','NVDA','TSLA','AMZN'],timer=null;

function tierKeyFor(el){const t=String(el?.closest?.('.mini-tier,.session,.mc-card,.floor-clean-card,.mobile-path-row,.step')?.textContent||el?.parentElement?.textContent||'').toUpperCase();return t.includes('JUNIOR')||t.includes('JR.')?'junior':t.includes('TRADER')?'trader':t.includes('CLERK')?'clerk':t.includes('RUNNER')?'runner':'freeroll';}
function turtleArt(key){try{return typeof TIER_DATA!=='undefined'&&TIER_DATA[key]?.art?TIER_DATA[key].art:''}catch(_){return''}}
function normalizePortraits(){
  const stale=$$('img').filter(im=>/stonkbroker-reward-crop|victory-broker\.svg|broker-icon|broker-avatar/i.test(String(im.getAttribute('src')||''))&&im.closest('.mini-tier,.session,.mc-card,.floor-clean-card,.mobile-path-row,.step,.mobile-floor-brokers'));
  stale.forEach(im=>{const src=turtleArt(tierKeyFor(im));if(src){im.src=src;im.removeAttribute('srcset');im.dataset.sbcTurtleNormalized='1';}});
  $$('.desktop-tier-icon,.mobile-tier-thumb,.mobile-session-broker,.mobile-contest-broker,.mobile-step-broker,.mobile-broker-anchor,.mobile-floor-broker').forEach(im=>{const src=turtleArt(tierKeyFor(im));if(src&&im.src!==src)im.src=src;});
}
function parseSymbols(raw){return [...new Set(String(raw||'').split(/[|,;\s]+/).map(norm).filter(valid))].slice(0,30)}
function savedBasketSymbols(storage=localStorage){try{const x=JSON.parse(storage.getItem(BASKET_STORE)||'null');return [...new Set((x?.rows||[]).map(r=>norm(r?.symbol)).filter(valid))].slice(0,30)}catch(_){return[]}}
function quotePrice(q){for(const k of ['price','last','lastPrice','close','current']){const n=Number(q?.[k]);if(Number.isFinite(n))return n}return null}
function quoteChange(q){for(const k of ['changePct','percentChange','changePercent','pctChange']){const n=Number(q?.[k]);if(Number.isFinite(n))return n}return null}
async function fetchQuotes(list,fetchImpl=fetch){
  const url=QUOTE_ROUTE+'?symbols='+encodeURIComponent(list.join(','));
  const r=await fetchImpl(url,{method:'GET',cache:'no-store',headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error('Quotes unavailable');
  const d=await r.json();
  if(Array.isArray(d))return d;if(Array.isArray(d?.quotes))return d.quotes;
  return Object.entries(d||{}).map(([symbol,v])=>typeof v==='object'?{symbol,...v}:{symbol,price:v});
}
function pickSymbol(sym){
  sym=norm(sym);if(!valid(sym))return;
  const input=$('#tradeSymbol');
  if(input){input.value=sym;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
  try{if(typeof window.selectChartSymbol==='function')window.selectChartSymbol(sym,'quote-window');else window.SBCActiveSymbolV1?.emit?.(sym,'quote-window')}catch(_){}
  window.dispatchEvent(new CustomEvent('sbc:active-symbol-change',{detail:{symbol:sym,source:'quote-window'}}));
}
async function refreshQuotes(){
  const root=$('#sbcQuoteRowsV1');if(!root||!symbols.length)return;
  root.innerHTML='<div class="sbc-quote-loading-v1">UPDATING QUOTES…</div>';
  try{
    const rows=await fetchQuotes(symbols),by=new Map(rows.map(q=>[norm(q.symbol||q.ticker),q]));
    root.innerHTML=symbols.map(sym=>{const q=by.get(sym)||{},p=quotePrice(q),c=quoteChange(q),cls=c==null?'':c>=0?'pos':'neg';return `<button type="button" class="sbc-quote-row-v1" data-sbc-quote-symbol="${sym}" aria-label="Load ${sym} into Order Entry"><b>${sym}</b><span>${p==null?'—':'$'+p.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span><em class="${cls}">${c==null?'—':(c>=0?'+':'')+c.toFixed(2)+'%'}</em></button>`}).join('');
    $$('[data-sbc-quote-symbol]',root).forEach(b=>b.onclick=()=>pickSymbol(b.dataset.sbcQuoteSymbol));
  }catch(e){root.innerHTML=`<div class="sbc-quote-loading-v1">${String(e.message||e)}</div>`}
}
function buildQuotePanel(){
  if(window.matchMedia('(min-width:901px)').matches)return;
  const v=$('#view-portfolio'),ticket=$('.quick-trade-clean',v);if(!v||!ticket||$('#sbcQuotePanelV1',v))return false;
  let grid=ticket.closest('.sbc-quote-oe-grid-v1');
  if(!grid){grid=document.createElement('div');grid.className='sbc-quote-oe-grid-v1';ticket.parentNode.insertBefore(grid,ticket);grid.appendChild(ticket)}
  const panel=document.createElement('section');panel.id='sbcQuotePanelV1';panel.className='panel sbc-quote-panel-v1';panel.dataset.quoteOnly='true';
  panel.innerHTML=`<div class="sbc-quote-head-v1"><div><small>QUOTE ONLY</small><h2>MARKET QUOTES</h2></div><button type="button" id="sbcQuoteRefreshV1">REFRESH</button></div><div class="sbc-quote-controls-v1"><input id="sbcQuoteInputV1" autocomplete="off" spellcheck="false" placeholder="AAPL or AAPL|MSFT|NVDA" aria-label="Quote symbols"><button type="button" id="sbcQuoteAddV1">LOAD SYMBOLS</button><button type="button" id="sbcQuoteBasketV1">LOAD BASKET</button></div><div class="sbc-quote-cols-v1"><span>SYMBOL</span><span>LAST</span><span>CHANGE</span></div><div id="sbcQuoteRowsV1" class="sbc-quote-rows-v1"></div><p>Quotes never submit orders. Click a stock only to populate Order Entry.</p>`;
  grid.appendChild(panel);
  $('#sbcQuoteAddV1',panel).onclick=()=>{const next=parseSymbols($('#sbcQuoteInputV1',panel).value);if(next.length){symbols=next;refreshQuotes()}};
  $('#sbcQuoteBasketV1',panel).onclick=()=>{const next=savedBasketSymbols();if(next.length){symbols=next;$('#sbcQuoteInputV1',panel).value=next.join('|');refreshQuotes()}};
  $('#sbcQuoteRefreshV1',panel).onclick=refreshQuotes;
  $('#sbcQuoteInputV1',panel).addEventListener('keydown',e=>{if(e.key==='Enter')$('#sbcQuoteAddV1',panel).click()});
  refreshQuotes();clearInterval(timer);timer=setInterval(()=>{if($('#view-portfolio')?.offsetParent)refreshQuotes()},5000);return true;
}
function installRenderRecovery(){
  const fn=window.renderPortfolio;if(typeof fn!=='function'||fn.__sbcContestRecoveryV1)return false;
  const wrapped=function(){
    try{return fn.apply(this,arguments)}catch(err){
      console.error('SBC portfolio render recovery',err);const v=$('#view-portfolio');
      if(v){v.style.display='';v.classList.add('active');let box=$('#sbcPortfolioRecoveryV1',v);if(!box){box=document.createElement('div');box.id='sbcPortfolioRecoveryV1';box.className='panel sbc-portfolio-recovery-v1';v.prepend(box)}box.innerHTML='<h2>CONTEST LOADED</h2><p>The portfolio shell recovered from a display error. Refreshing the live workspace…</p>';setTimeout(()=>{try{fn.apply(window,arguments);box.remove()}catch(_){ }},250)}
      return null;
    }
  };
  wrapped.__sbcContestRecoveryV1=true;wrapped.__sbcOriginal=fn;window.renderPortfolio=wrapped;return true;
}
function ensure(){normalizePortraits();buildQuotePanel();installRenderRecovery()}
window.__SBC_TRADING_WORKSTATION_TEST=Object.freeze({parseSymbols,savedBasketSymbols,fetchQuotes,quotePrice,quoteChange,QUOTE_ROUTE});
function start(){ensure();[80,250,700,1500].forEach(ms=>setTimeout(ensure,ms));let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;ensure()})}).observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
