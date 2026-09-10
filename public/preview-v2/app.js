(()=>{
'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const state={catalog:null,tier:'runner',category:'hourly',prize:'ai',symbols:[],activeSymbol:'NVDA',interval:'5m',chart:null,series:null};
const fmtUsd=n=>`$${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2})}`;
const norm=s=>String(s||'').trim().toUpperCase();
const unique=arr=>[...new Set(arr)];
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.hidden=true,2600)}
function showView(id){$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${id}`));$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));if(id==='floor')setTimeout(()=>{state.chart?.applyOptions({width:$('#chart').clientWidth,height:$('#chart').clientHeight});loadBars()},40)}
function choiceButton(kind,item,meta){const id=item.id,on=state[kind]===id;return `<button class="choice ${on?'active':''}" data-choice-kind="${kind}" data-choice-id="${id}"><b>${item.name}</b><small>${meta}</small></button>`}
function selected(kind){const list=kind==='tier'?state.catalog.tiers:kind==='category'?state.catalog.categories:state.catalog.prizeAssets;return list.find(x=>x.id===state[kind])||list[0]}
function renderSelectors(){
  $('#tierChoices').innerHTML=state.catalog.tiers.map(x=>choiceButton('tier',x,fmtUsd(x.entryUsd))).join('');
  $('#categoryChoices').innerHTML=state.catalog.categories.map(x=>choiceButton('category',x,x.free?'FREE':x.durationLabel)).join('');
  $('#prizeChoices').innerHTML=state.catalog.prizeAssets.filter(x=>x.enabled).map(x=>choiceButton('prize',x,x.assetClass)).join('');
  const t=selected('tier'),c=selected('category'),p=selected('prize'),entry=c.free?0:t.entryUsd;
  $('#selectionSummary').textContent=`${t.name} • ${c.name} • ${p.symbol} • ${entry?fmtUsd(entry):'FREE'}`;
  $('#floorContestTitle').textContent=`${t.name} • ${c.name} • ${p.symbol}`;
  $('#floorEntry').textContent=entry?fmtUsd(entry):'FREE';
  $('#floorPrize').textContent=p.symbol;
  $$('[data-choice-kind]').forEach(b=>b.onclick=()=>{state[b.dataset.choiceKind]=b.dataset.choiceId;renderSelectors();renderContests()});
}
function renderPools(){
  const sample={runner:100,clerk:500,trader:1500,broker:5000};
  $('#featuredPools').innerHTML=state.catalog.prizeAssets.filter(x=>x.enabledForPrizes).map(x=>`<div class="pool"><div><strong>${x.symbol}</strong><span>${x.name} prize asset</span></div><b>${fmtUsd(sample[state.tier]||500)} target</b></div>`).join('');
}
function contestRows(){
  const t=selected('tier'),p=selected('prize');
  const cats=state.catalog.categories;
  return cats.map((c,i)=>({tier:t,cat:c,prize:p,players:[38,112,284,641][i],ends:['42m','6h 18m','4d 3h','5d 22h'][i]}));
}
function renderContests(){
  const rows=contestRows();
  $('#liveContests').innerHTML=rows.map(x=>{const entry=x.cat.free?0:x.tier.entryUsd;return `<button class="contest-row" data-open-contest="${x.cat.id}"><div><b>${x.tier.name} • ${x.cat.name} • ${x.prize.symbol}</b><small>${entry?fmtUsd(entry):'FREE'} entry • ${x.players} players • ${x.ends}</small></div><strong>${x.prize.symbol}</strong></button>`}).join('');
  $$('[data-open-contest]').forEach(b=>b.onclick=()=>{state.category=b.dataset.openContest;renderSelectors();showView('floor')});
}
async function fetchJson(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);return r.json()}
function quoteChange(q){const n=Number(q?.changePct??q?.percentChange??q?.changePercent??q?.pctChange);return Number.isFinite(n)?n:null}
function quotePrice(q){const n=Number(q?.price??q?.last??q?.lastPrice??q?.close);return Number.isFinite(n)?n:null}
async function loadQuotes(){
  if(!state.symbols.length)return;
  const root=$('#quoteRows');root.innerHTML='<div class="empty-state">Loading quotes…</div>';
  try{
    const data=await fetchJson('/api/quotes?symbols='+encodeURIComponent(state.symbols.join(',')));
    const rows=Array.isArray(data)?data:(data.quotes||[]),map=new Map(rows.map(x=>[norm(x.symbol||x.ticker),x]));
    root.innerHTML=state.symbols.map(sym=>{const q=map.get(sym)||{},p=quotePrice(q),c=quoteChange(q);return `<button class="quote-row ${sym===state.activeSymbol?'active':''}" data-quote-symbol="${sym}"><b>${sym}</b><span>${p==null?'—':fmtUsd(p)}</span><em class="${c==null?'':c>=0?'pos':'neg'}">${c==null?'—':`${c>=0?'+':''}${c.toFixed(2)}%`}</em></button>`}).join('');
    $$('[data-quote-symbol]').forEach(b=>b.onclick=()=>selectSymbol(b.dataset.quoteSymbol));
  }catch(e){root.innerHTML=`<div class="empty-state">Quotes unavailable: ${e.message}</div>`}
}
function selectSymbol(sym){state.activeSymbol=norm(sym);$('#activeSymbolTitle').textContent=state.activeSymbol;$('#oeSymbol').value=state.activeSymbol;loadQuotes();loadBars();log('SYMBOL',`${state.activeSymbol} loaded into chart and order entry`)}
function parseBasket(raw){return unique(String(raw||'').split(/[|,;\s]+/).map(norm).filter(x=>/^[A-Z][A-Z0-9.\-]{0,9}$/.test(x))).slice(0,30)}
function loadBasket(){const syms=parseBasket($('#basketInput').value);$('#basketRows').innerHTML=syms.map(s=>`<button class="basket-row" data-basket-symbol="${s}"><b>${s}</b><span>LOAD INTO OE</span></button>`).join('');$$('[data-basket-symbol]').forEach(b=>b.onclick=()=>selectSymbol(b.dataset.basketSymbol));log('BASKET',`${syms.length} symbols loaded`)}
function chartTheme(){const light=document.documentElement.dataset.theme==='light';return{layout:{background:{type:'solid',color:light?'#ffffff':'#0b1620'},textColor:light?'#425b6b':'#94aebb'},grid:{vertLines:{color:light?'#edf2f6':'#19303e'},horzLines:{color:light?'#edf2f6':'#19303e'}},timeScale:{borderColor:light?'#d7e2ea':'#284455'},rightPriceScale:{borderColor:light?'#d7e2ea':'#284455'}}}
function ensureChart(){if(state.chart)return;const el=$('#chart');if(!window.LightweightCharts||!el)return;state.chart=window.LightweightCharts.createChart(el,{width:el.clientWidth,height:el.clientHeight,...chartTheme()});state.series=state.chart.addCandlestickSeries({upColor:'#1eae61',downColor:'#db5757',borderVisible:false,wickUpColor:'#1eae61',wickDownColor:'#db5757'});window.addEventListener('resize',()=>state.chart?.applyOptions({width:el.clientWidth,height:el.clientHeight}));}
async function loadBars(){ensureChart();if(!state.series)return;try{const d=await fetchJson(`/api/quotes/bars?symbol=${encodeURIComponent(state.activeSymbol)}&interval=${encodeURIComponent(state.interval)}`);const bars=(d.bars||[]).map(b=>({time:Math.floor(new Date(b.time).getTime()/1000),open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close)})).filter(b=>Number.isFinite(b.time)&&Number.isFinite(b.close));state.series.setData(bars);state.chart.timeScale().fitContent()}catch(e){toast(`Chart unavailable: ${e.message}`)}}
function log(kind,text){const root=$('#activityLog'),row=document.createElement('div');row.innerHTML=`<span>${kind}</span><b>${text}</b>`;root.prepend(row)}
function setupWallets(){
  $('#walletChoices').innerHTML=state.catalog.walletAdapters.map(w=>`<div class="wallet-option"><div><b>${w.name}</b><span>${w.kind}</span></div><button class="secondary" data-wallet="${w.id}">SIMULATE</button></div>`).join('');
  $$('[data-wallet]').forEach(b=>b.onclick=()=>{toast(`${b.dataset.wallet} adapter simulated — no real custody`);$('#walletButton').textContent='WALLET SIMULATED';$('#walletModal').hidden=true});
}
function bind(){
  $$('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
  $('#themeToggle').onclick=()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=next;localStorage.setItem('sbcPreviewTheme',next);state.chart?.applyOptions(chartTheme())};
  $('#walletButton').onclick=()=>$('#walletModal').hidden=false;$('#walletClose').onclick=()=>$('#walletModal').hidden=true;
  $('#findContest').onclick=()=>showView('floor');$('[data-freeroll]').onclick=()=>{state.category='weekly-freeroll';renderSelectors();showView('floor')};
  $('#loadQuotes').onclick=()=>{const next=parseBasket($('#quoteInput').value);if(next.length){state.symbols=next;loadQuotes()}};
  $('#loadDefaultQuotes').onclick=()=>{state.symbols=[...state.catalog.quoteDefaults];$('#quoteInput').value=state.symbols.join('|');loadQuotes()};
  $('#loadBasket').onclick=loadBasket;$('#previewOrder').onclick=()=>log('ORDER',`${$('#orderType').value} BUY ${$('#quantity').value} ${$('#oeSymbol').value} — preview only`);
  $$('[data-interval]').forEach(b=>b.onclick=()=>{$$('[data-interval]').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.interval=b.dataset.interval;loadBars()});
}
async function start(){
  const saved=localStorage.getItem('sbcPreviewTheme');if(saved)document.documentElement.dataset.theme=saved;
  try{state.catalog=await fetchJson('/api/v2/catalog')}catch(e){document.body.innerHTML=`<pre>Preview catalog failed: ${e.message}</pre>`;return}
  state.symbols=[...state.catalog.quoteDefaults];$('#quoteInput').value=state.symbols.join('|');renderSelectors();renderPools();renderContests();setupWallets();bind();ensureChart();loadQuotes();loadBars();loadBasket();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
