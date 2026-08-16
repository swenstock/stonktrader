(() => {
  'use strict';
  const rootNode=r=>typeof r==='string'?document.querySelector(r):r;
  const $=(s,r=document)=>rootNode(r).querySelector(s), $$=(s,r=document)=>[...rootNode(r).querySelectorAll(s)];
  const token=localStorage.getItem('token')||'';
  const params=new URLSearchParams(location.search);
  const portfolioId=params.get('id');
  const PREF_KEY='sbcChartPrefsV45';
  const TUTORIAL_KEY='sbcDisableViewTutorialV45Web:portfolio';
  const state={
    portfolio:null,symbols:[],symbol:'NVDA',quote:null,bars:[],trades:[],
    interval:'5m',chartType:'candles',showMA:false,showEMA:false,showVolume:true,showCrosshair:true,
    side:'buy',mode:'percent',hoverIndex:null,
  };

  try{Object.assign(state,JSON.parse(localStorage.getItem(PREF_KEY)||'{}'));}catch(_){}
  if(!['candles','line'].includes(state.chartType))state.chartType='candles';
  if(!['tick','1m','5m','15m','1h','1D'].includes(state.interval))state.interval='5m';

  function authHeaders(){return token?{Authorization:`Bearer ${token}`}:{}}
  async function api(path,opts={}){
    const r=await fetch(`/api${path}`,{...opts,headers:{'Content-Type':'application/json',...authHeaders(),...(opts.headers||{})}});
    const out=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(out.error||`Request failed (${r.status})`);
    return out;
  }
  function fmt(n,d=2){return Number(n||0).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d})}
  function toast(msg){const e=$('#toast');e.textContent=msg;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2800)}
  function savePrefs(){localStorage.setItem(PREF_KEY,JSON.stringify({symbol:state.symbol,interval:state.interval,chartType:state.chartType,showMA:state.showMA,showEMA:state.showEMA,showVolume:state.showVolume,showCrosshair:state.showCrosshair}))}
  function minutesForInterval(i){return ({tick:30,'1m':180,'5m':780,'15m':2340,'1h':10080,'1D':43200})[i]||780}
  function colorClass(n){return Number(n)>=0?'up':'down'}

  async function loadPortfolio(){
    state.portfolio=await api(`/portfolios/${portfolioId}`);
    if(!state.symbol||!state.symbols.some(s=>s.symbol===state.symbol)) state.symbol=state.portfolio.positions[0]?.symbol||state.symbol||'NVDA';
    renderPortfolio();
  }
  async function loadSymbols(){
    state.symbols=await api('/quotes/symbols');
    $('#symbolList').innerHTML=state.symbols.map(s=>`<option value="${s.symbol}">${escapeHtml(s.name)}</option>`).join('');
  }
  async function loadMarket(){
    const [quotes,bars]=await Promise.all([
      api(`/quotes?symbols=${encodeURIComponent(state.symbol)}`),
      api(`/sim-market/bars/${encodeURIComponent(state.symbol)}?interval=${encodeURIComponent(state.interval)}&minutes=${minutesForInterval(state.interval)}`),
    ]);
    state.quote=quotes[0]||null; state.bars=bars.bars||[];
    renderMarketHeader();drawChart();renderPositionStrip();
  }
  async function loadTrades(){state.trades=await api(`/portfolios/${portfolioId}/trades`);renderTrades()}
  async function refreshAll(){
    try{await Promise.all([loadPortfolio(),loadTrades()]);await loadMarket();}catch(e){toast(e.message)}
  }

  function escapeHtml(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function renderPortfolio(){
    const p=state.portfolio;if(!p)return;
    $('#portfolioTitle').textContent=p.label;
    $('#contestMeta').textContent=`${String(p.context?.tierId||p.context?.type||'contest').toUpperCase()} • ${String(p.context?.status||'').toUpperCase()}`;
    $('#portfolioValue').textContent=`$${fmt(p.totalValue)}`;
    $('#portfolioPL').textContent=`${p.pl>=0?'+':''}$${fmt(p.pl)}`;$('#portfolioPL').className=colorClass(p.pl);
    $('#portfolioCash').textContent=`$${fmt(p.cash)}`;$('#positionCount').textContent=p.positions.length;
    $('#ruleSet').textContent=p.isDegenHours?'DEGEN • NO 10% CAP':'STANDARD • 10%';
    $('#tradeStatus').textContent=p.tradingAllowed?'TRADING OPEN':'TRADING CLOSED';$('#tradeStatus').className=p.tradingAllowed?'up':'down';
    $('#serverNow').textContent=new Date(p.serverNow).toLocaleString('en-US',{weekday:'short',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'});
    $('#marketMode').textContent='SIM DATA • SERVER DRIVEN';
    $('#tradeRuleNote').textContent=p.isDegenHours?'Degen BUY % uses available cash. No 10% position cap.':'Standard BUY % means a percentage of the 10% max cost-basis allocation.';
    const closed=$('#tradeClosedMsg');closed.classList.toggle('hidden',p.tradingAllowed);closed.textContent=p.tradingMessage||'';
    $$('.quick-trade button,.quick-trade input').forEach(el=>{if(!['buySide','sellSide','percentMode','sharesMode'].includes(el.id))el.disabled=!p.tradingAllowed});
    renderPositions();updateQuickMeaning();
  }

  function renderPositions(){
    const positions=state.portfolio?.positions||[];
    $('#positionsList').innerHTML=positions.length?positions.map(x=>`<button class="position-row ${x.symbol===state.symbol?'active':''}" data-symbol="${x.symbol}"><div><b>${x.symbol}</b><span>${fmt(x.quantity,2)} sh @ $${fmt(x.avgCost)}</span><small>VALUE $${fmt(x.value)}</small></div><div class="pos-pnl ${colorClass(x.unrealizedPL)}">${x.unrealizedPL>=0?'+':''}$${fmt(x.unrealizedPL)}</div></button>`).join(''):'<div class="empty-state">100% CASH<br><small>Choose a symbol below to make your first trade.</small></div>';
    $$('[data-symbol]','#positionsList').forEach(b=>b.onclick=()=>setSymbol(b.dataset.symbol));
  }
  function currentPosition(){return state.portfolio?.positions?.find(p=>p.symbol===state.symbol)||null}
  function renderPositionStrip(){
    const p=currentPosition();
    $('#positionStrip').textContent=p?`${p.symbol} POSITION • ${fmt(p.quantity,2)} SHARES • AVG $${fmt(p.avgCost)} • VALUE $${fmt(p.value)} • P&L ${p.unrealizedPL>=0?'+':''}$${fmt(p.unrealizedPL)}`:`NO POSITION IN ${state.symbol}`;
  }
  function renderMarketHeader(){
    const q=state.quote;if(!q)return;
    $('#chartSymbol').textContent=q.symbol;$('#chartCompany').textContent=q.name||'';$('#chartPrice').textContent=`$${fmt(q.price)}`;
    $('#chartChange').textContent=`${q.changePct>=0?'+':''}${fmt(q.changePct)}%`;$('#chartChange').className=colorClass(q.changePct);
    $('#quickTitle').textContent=`TRADE ${state.symbol}`;$('#symbolInput').value=state.symbol;
    renderPositions();
  }

  function movingAverage(values,n=10){return values.map((_,i)=>i<n-1?null:values.slice(i-n+1,i+1).reduce((a,b)=>a+b,0)/n)}
  function ema(values,n=10){const k=2/(n+1);let prev=null;return values.map(v=>{prev=prev==null?v:v*k+prev*(1-k);return prev})}
  function drawChart(){
    const canvas=$('#marketChart'),wrap=canvas.parentElement,bars=state.bars;if(!bars.length)return;
    const dpr=window.devicePixelRatio||1,w=Math.max(300,wrap.clientWidth),h=Math.max(260,wrap.clientHeight);canvas.width=w*dpr;canvas.height=h*dpr;
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const left=12,right=58,top=14,bottom=state.showVolume?72:30,plotW=w-left-right,plotH=h-top-bottom;
    let low=Math.min(...bars.map(b=>b.low)),high=Math.max(...bars.map(b=>b.high));const pad=(high-low||1)*.08;low-=pad;high+=pad;
    const y=p=>top+(high-p)/(high-low)*plotH,x=i=>left+(i+.5)/bars.length*plotW;
    ctx.strokeStyle='#17303b';ctx.lineWidth=1;ctx.font='9px monospace';ctx.fillStyle='#718b98';
    for(let g=0;g<=5;g++){const yy=top+plotH*g/5;ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(left+plotW,yy);ctx.stroke();const price=high-(high-low)*g/5;ctx.fillText(price.toFixed(2),left+plotW+7,yy+3)}
    for(let g=0;g<=6;g++){const xx=left+plotW*g/6;ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,top+plotH);ctx.stroke()}

    const step=plotW/bars.length,cw=Math.max(1,Math.min(9,step*.62));
    if(state.chartType==='line'){
      ctx.strokeStyle='#59bff7';ctx.lineWidth=2;ctx.beginPath();bars.forEach((b,i)=>{const xx=x(i),yy=y(b.close);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});ctx.stroke();
    }else{
      bars.forEach((b,i)=>{const xx=x(i),up=b.close>=b.open;ctx.strokeStyle=up?'#55e75b':'#ff6e64';ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(xx,y(b.high));ctx.lineTo(xx,y(b.low));ctx.stroke();const y1=y(Math.max(b.open,b.close)),y2=y(Math.min(b.open,b.close));ctx.fillRect(xx-cw/2,y1,cw,Math.max(1,y2-y1));});
    }
    const closes=bars.map(b=>b.close);
    function drawSeries(vals,color){ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();let started=false;vals.forEach((v,i)=>{if(v==null)return;const xx=x(i),yy=y(v);if(!started){ctx.moveTo(xx,yy);started=true}else ctx.lineTo(xx,yy)});ctx.stroke()}
    if(state.showMA)drawSeries(movingAverage(closes),'#ffc400');if(state.showEMA)drawSeries(ema(closes),'#a679ff');
    if(state.showVolume){const maxV=Math.max(...bars.map(b=>b.volume||0),1),base=h-22,volH=38;bars.forEach((b,i)=>{ctx.fillStyle=b.close>=b.open?'rgba(85,231,91,.35)':'rgba(255,110,100,.35)';const vh=(b.volume/maxV)*volH;ctx.fillRect(x(i)-Math.max(1,cw/2),base-vh,Math.max(2,cw),vh)})}
    const idx=state.hoverIndex==null?bars.length-1:Math.max(0,Math.min(bars.length-1,state.hoverIndex));const b=bars[idx];
    $('#ohlcStrip').textContent=`O ${fmt(b.open)}   H ${fmt(b.high)}   L ${fmt(b.low)}   C ${fmt(b.close)}   VOL ${Number(b.volume||0).toLocaleString()}`;
    if(state.showCrosshair&&state.hoverIndex!=null){const xx=x(idx),yy=y(b.close);ctx.strokeStyle='#7c94a0';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,top+plotH);ctx.moveTo(left,yy);ctx.lineTo(left+plotW,yy);ctx.stroke();ctx.setLineDash([])}
  }

  function handleChartMouse(e){
    if(!state.showCrosshair||!state.bars.length)return;
    const rect=e.currentTarget.getBoundingClientRect(),px=e.clientX-rect.left;const left=12,right=58,plotW=rect.width-left-right;
    state.hoverIndex=Math.max(0,Math.min(state.bars.length-1,Math.floor(((px-left)/plotW)*state.bars.length)));
    const b=state.bars[state.hoverIndex],tip=$('#chartTip');tip.classList.remove('hidden');tip.textContent=`${new Date(b.time).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})} • $${fmt(b.close)}`;
    tip.style.left=`${Math.min(rect.width-150,Math.max(8,e.clientX-rect.left+12))}px`;tip.style.top=`${Math.max(8,e.clientY-rect.top-25)}px`;drawChart();
  }
  function clearHover(){state.hoverIndex=null;$('#chartTip').classList.add('hidden');drawChart()}

  async function setSymbol(symbol){
    const s=String(symbol||'').trim().toUpperCase();if(!state.symbols.some(x=>x.symbol===s)){toast('That symbol is not in the current SBC feed.');return}
    state.symbol=s;savePrefs();await loadMarket();updateQuickMeaning();
  }

  function setSide(side){state.side=side;$('#buySide').classList.toggle('active',side==='buy');$('#sellSide').classList.toggle('active',side==='sell');updateQuickMeaning()}
  function setMode(mode){state.mode=mode;$('#percentMode').classList.toggle('active',mode==='percent');$('#sharesMode').classList.toggle('active',mode==='shares');$('#percentControls').classList.toggle('hidden',mode!=='percent');$('#sharesControls').classList.toggle('hidden',mode!=='shares');updateQuickMeaning()}
  function updateQuickMeaning(percent=25){
    const p=state.portfolio;if(!p)return;const pos=currentPosition();let text='';
    if(state.mode==='shares')text=`Enter an exact share quantity. Server executes at the current simulated quote and rechecks all SBC rules.`;
    else if(state.side==='sell')text=`SELL ${percent}% means ${pos?`sell ${percent}% of your current ${state.symbol} position`:`you need to own ${state.symbol} first`}.`;
    else if(p.isDegenHours)text=`BUY ${percent}% means use ${percent}% of your currently available cash. Degen Hours has no 10% position cap.`;
    else text=`BUY ${percent}% means target ${(percent/10).toFixed(1)}% of total portfolio value in ${state.symbol} — ${percent}% of the standard 10% max.`;
    $('#quickMeaning').textContent=text;
  }

  async function executeTrade(payload){
    if(!state.portfolio?.tradingAllowed)return toast(state.portfolio?.tradingMessage||'Trading is closed.');
    try{
      const r=await api(`/portfolios/${portfolioId}/trades`,{method:'POST',body:JSON.stringify({symbol:state.symbol,side:state.side,...payload})});
      toast(`${state.side.toUpperCase()} ${fmt(r.quantity,2)} ${state.symbol} @ $${fmt(r.price)}`);await refreshAll();
    }catch(e){toast(e.message)}
  }
  function renderTrades(){
    $('#tradeHistory').innerHTML=state.trades.length?state.trades.map(t=>`<div class="trade-row"><b>${escapeHtml(t.symbol)}</b><b class="${t.side}">${String(t.side).toUpperCase()}</b><span>${fmt(t.quantity,2)} shares</span><span>$${fmt(t.price)}</span><span>${new Date(t.timestamp).toLocaleString()}</span></div>`).join(''):'<div class="empty-state">NO TRADES YET</div>';
  }

  function bind(){
    $('#homeBtn').onclick=()=>location.href='./';$('#backBtn').onclick=()=>history.length>1?history.back():location.href='./';$('#refreshBtn').onclick=refreshAll;
    $('#loadSymbol').onclick=()=>setSymbol($('#symbolInput').value);$('#symbolInput').addEventListener('keydown',e=>{if(e.key==='Enter')setSymbol(e.target.value)});
    $$('[data-chart-type]').forEach(b=>b.onclick=()=>{state.chartType=b.dataset.chartType;$$('[data-chart-type]').forEach(x=>x.classList.toggle('active',x===b));savePrefs();drawChart()});
    $$('[data-interval]').forEach(b=>b.onclick=async()=>{state.interval=b.dataset.interval;$$('[data-interval]').forEach(x=>x.classList.toggle('active',x===b));savePrefs();await loadMarket()});
    $('#maToggle').onchange=e=>{state.showMA=e.target.checked;savePrefs();drawChart()};$('#emaToggle').onchange=e=>{state.showEMA=e.target.checked;savePrefs();drawChart()};$('#volumeToggle').onchange=e=>{state.showVolume=e.target.checked;savePrefs();drawChart()};$('#crosshairToggle').onchange=e=>{state.showCrosshair=e.target.checked;savePrefs();clearHover()};
    $('#buySide').onclick=()=>setSide('buy');$('#sellSide').onclick=()=>setSide('sell');$('#percentMode').onclick=()=>setMode('percent');$('#sharesMode').onclick=()=>setMode('shares');
    $$('[data-percent]').forEach(b=>b.onclick=()=>{const p=Number(b.dataset.percent);updateQuickMeaning(p);executeTrade({percent:p})});$('#submitShares').onclick=()=>{const q=Number($('#shareQty').value);if(!(q>0))return toast('Enter a positive share quantity.');executeTrade({quantity:q})};
    $('#marketChart').addEventListener('mousemove',handleChartMouse);$('#marketChart').addEventListener('mouseleave',clearHover);window.addEventListener('resize',drawChart);
  }

  const tutorialSteps=[
    ['.positions-panel','YOUR POSITIONS','Click any holding to load it directly into the chart and execution controls.'],
    ['.chart-panel','TRADE FROM THE CHART','Candles or line, multiple intervals, volume, MA/EMA and crosshair preferences are saved locally.'],
    ['.quick-trade','QUICK EXECUTION','Shares are exact. Percentage buys use SBC semantics: standard = slice of the 10% cap; Degen = available cash.'],
  ];
  let tutTarget=null,tutOld='';
  function endTutorial(){if(tutTarget)tutTarget.style.outline=tutOld;$('#portfolioTutorial')?.remove()}
  function showTutorial(i=0){
    endTutorial();if(i>=tutorialSteps.length)return;
    const [sel,title,text]=tutorialSteps[i],target=$(sel);if(!target)return;target.scrollIntoView({block:'center',behavior:'smooth'});tutTarget=target;tutOld=target.style.outline;target.style.outline='3px solid #ffc400';
    const pop=document.createElement('div');pop.id='portfolioTutorial';Object.assign(pop.style,{position:'fixed',zIndex:500,width:'min(420px,calc(100vw - 36px))',background:'#07121a',border:'1px solid #a07d12',borderRadius:'14px',padding:'18px',boxShadow:'0 20px 80px #000'});pop.innerHTML=`<small style="color:#ffc400;font-weight:900">${i+1} OF ${tutorialSteps.length}</small><h2 style="margin:7px 0">${title}</h2><p style="color:#b5c6ce;font-size:12px">${text}</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:7px"><button id="ptSkip" class="ghost">SKIP FOR NOW</button><button id="ptNext" class="green">${i===tutorialSteps.length-1?'DONE':'NEXT →'}</button></div><button id="ptDisable" class="danger" style="width:100%;padding:10px;border-radius:8px;margin-top:7px;font-weight:900">DON'T SHOW THIS AGAIN</button>`;document.body.appendChild(pop);
    const r=target.getBoundingClientRect(),safe=innerWidth<620?12:18,gap=12,w=Math.min(420,innerWidth-safe*2);pop.style.width=`${w}px`;let top=r.bottom+gap;const h=pop.offsetHeight;if(top+h>innerHeight-safe)top=r.top-h-gap;if(top<safe)top=safe;pop.style.left=`${Math.max(safe,Math.min(innerWidth-w-safe,r.left))}px`;pop.style.top=`${top}px`;
    $('#ptSkip').onclick=endTutorial;$('#ptNext').onclick=()=>showTutorial(i+1);$('#ptDisable').onclick=()=>{localStorage.setItem(TUTORIAL_KEY,'1');endTutorial()};
  }
  function addHelp(){const b=document.createElement('button');b.className='ghost';b.textContent='?';b.title='Replay portfolio tutorial';b.onclick=()=>showTutorial(0);$('.top-actions').prepend(b)}

  async function boot(){
    if(!token||!portfolioId){alert('Sign in and open a portfolio from My Contests.');location.href='./';return}
    bind();addHelp();
    $('#maToggle').checked=!!state.showMA;$('#emaToggle').checked=!!state.showEMA;$('#volumeToggle').checked=state.showVolume!==false;$('#crosshairToggle').checked=state.showCrosshair!==false;
    $$('[data-chart-type]').forEach(b=>b.classList.toggle('active',b.dataset.chartType===state.chartType));$$('[data-interval]').forEach(b=>b.classList.toggle('active',b.dataset.interval===state.interval));
    try{await loadSymbols();if(!state.symbols.some(s=>s.symbol===state.symbol))state.symbol='NVDA';await refreshAll();if(localStorage.getItem(TUTORIAL_KEY)!=='1')setTimeout(()=>showTutorial(0),450)}catch(e){toast(e.message)}
    setInterval(async()=>{try{await loadPortfolio();await loadMarket()}catch(_){}},5000);
  }
  boot();
})();
