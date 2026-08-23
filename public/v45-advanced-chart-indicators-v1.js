// v45-advanced-chart-indicators-v1.js
// Stage 4 additive indicator engine. Own rendering layer; Stage 2/3 chart engine remains authoritative.
(() => {
  'use strict';

  const CORE = [
    { id:'sma', name:'Simple Moving Average', short:'SMA', category:'Trend', implemented:true },
    { id:'ema', name:'Exponential Moving Average', short:'EMA', category:'Trend', implemented:true },
    { id:'rsi', name:'Relative Strength Index', short:'RSI', category:'Momentum', implemented:true, pane:true },
    { id:'macd', name:'Moving Average Convergence Divergence', short:'MACD', category:'Momentum', implemented:true, pane:true },
    { id:'bb', name:'Bollinger Bands', short:'BB', category:'Volatility', implemented:true },
    { id:'vwap', name:'Volume Weighted Average Price', short:'VWAP', category:'Volume', implemented:true },
    { id:'supertrend', name:'Supertrend', short:'Supertrend', category:'Trend', implemented:true },
  ];

  const CATALOG = CORE.concat([
    ['atr','Average True Range','ATR','Volatility'],['adx','Average Directional Index','ADX','Trend'],['cci','Commodity Channel Index','CCI','Momentum'],
    ['roc','Rate of Change','ROC','Momentum'],['stoch','Stochastic Oscillator','Stochastic','Momentum'],['stochrsi','Stochastic RSI','Stoch RSI','Momentum'],
    ['wma','Weighted Moving Average','WMA','Trend'],['hma','Hull Moving Average','HMA','Trend'],['dema','Double EMA','DEMA','Trend'],['tema','Triple EMA','TEMA','Trend'],
    ['keltner','Keltner Channels','Keltner','Volatility'],['donchian','Donchian Channels','Donchian','Volatility'],['psar','Parabolic SAR','PSAR','Trend'],
    ['ichimoku','Ichimoku Cloud','Ichimoku','Trend'],['obv','On Balance Volume','OBV','Volume'],['mfi','Money Flow Index','MFI','Volume'],
    ['cmf','Chaikin Money Flow','CMF','Volume'],['adl','Accumulation/Distribution Line','A/D','Volume'],['ao','Awesome Oscillator','AO','Momentum'],
    ['trix','TRIX','TRIX','Momentum'],['ultimate','Ultimate Oscillator','Ultimate','Momentum'],['williamsr','Williams %R','Williams %R','Momentum'],
    ['pivot','Pivot Points','Pivots','Support/Resistance'],['fib','Fibonacci Levels','Fib','Support/Resistance'],['zigzag','Zig Zag','Zig Zag','Pattern'],
    ['chop','Choppiness Index','CHOP','Trend'],['vortex','Vortex Indicator','Vortex','Trend'],['elder','Elder Ray Index','Elder Ray','Momentum'],
    ['ppo','Percentage Price Oscillator','PPO','Momentum'],['dpo','Detrended Price Oscillator','DPO','Momentum'],['klinger','Klinger Oscillator','Klinger','Volume'],
    ['force','Force Index','Force','Volume'],['eom','Ease of Movement','EOM','Volume'],['mass','Mass Index','Mass','Volatility'],
  ].map(([id,name,short,category]) => ({id,name,short,category,implemented:false})));

  const COLORS = { sma:'#ffc928', ema:'#2ab5ff', vwap:'#d979ff', bb:'#a8b3c2', supertrend:'#2ee6a6', rsi:'#ffc928', macd:'#2ab5ff', signal:'#ff8e3c', hist:'#8a97a3' };

  const n = v => Number(v);
  const finite = v => Number.isFinite(Number(v));
  const close = bars => bars.map(b => n(b.close));

  function sma(values, period=20) {
    const p=Math.max(1,Math.floor(period)), out=Array(values.length).fill(null); let sum=0;
    for(let i=0;i<values.length;i++){ const v=n(values[i]); sum+=v; if(i>=p) sum-=n(values[i-p]); if(i>=p-1) out[i]=sum/p; }
    return out;
  }

  function ema(values, period=20) {
    const p=Math.max(1,Math.floor(period)), out=Array(values.length).fill(null); if(!values.length)return out;
    const k=2/(p+1); let seed=0;
    for(let i=0;i<values.length;i++){
      const v=n(values[i]);
      if(i<p){ seed+=v; if(i===p-1) out[i]=seed/p; }
      else out[i]=v*k+out[i-1]*(1-k);
    }
    if(values.length<p){ let prev=n(values[0]); out[0]=prev; for(let i=1;i<values.length;i++){prev=n(values[i])*k+prev*(1-k);out[i]=prev;} }
    return out;
  }

  function rsi(values, period=14) {
    const p=Math.max(1,Math.floor(period)), out=Array(values.length).fill(null); if(values.length<=p)return out;
    let gain=0,loss=0;
    for(let i=1;i<=p;i++){ const d=n(values[i])-n(values[i-1]); gain+=Math.max(0,d); loss+=Math.max(0,-d); }
    let ag=gain/p, al=loss/p; out[p]=al===0?100:100-(100/(1+ag/al));
    for(let i=p+1;i<values.length;i++){ const d=n(values[i])-n(values[i-1]); ag=(ag*(p-1)+Math.max(0,d))/p; al=(al*(p-1)+Math.max(0,-d))/p; out[i]=al===0?100:100-(100/(1+ag/al)); }
    return out;
  }

  function macd(values, fast=12, slow=26, signal=9) {
    const f=ema(values,fast), s=ema(values,slow), line=values.map((_,i)=>finite(f[i])&&finite(s[i])?f[i]-s[i]:null);
    const compact=line.filter(finite), sigCompact=ema(compact,signal), sig=Array(values.length).fill(null); let j=0;
    for(let i=0;i<line.length;i++) if(finite(line[i])) sig[i]=sigCompact[j++];
    const hist=line.map((v,i)=>finite(v)&&finite(sig[i])?v-sig[i]:null);
    return { line, signal:sig, histogram:hist };
  }

  function bollinger(values, period=20, mult=2) {
    const mid=sma(values,period), upper=Array(values.length).fill(null), lower=Array(values.length).fill(null), p=Math.max(1,Math.floor(period));
    for(let i=p-1;i<values.length;i++){ const m=mid[i]; let ss=0; for(let j=i-p+1;j<=i;j++){const d=n(values[j])-m;ss+=d*d;} const sd=Math.sqrt(ss/p); upper[i]=m+mult*sd; lower[i]=m-mult*sd; }
    return { middle:mid, upper, lower };
  }

  function vwap(bars) {
    const out=Array(bars.length).fill(null); let pv=0,vol=0;
    for(let i=0;i<bars.length;i++){ const b=bars[i],v=Math.max(0,n(b.volume)||0),typ=(n(b.high)+n(b.low)+n(b.close))/3; pv+=typ*v; vol+=v; out[i]=vol>0?pv/vol:(i?out[i-1]:typ); }
    return out;
  }

  function trueRange(bars) {
    return bars.map((b,i)=> i===0 ? n(b.high)-n(b.low) : Math.max(n(b.high)-n(b.low),Math.abs(n(b.high)-n(bars[i-1].close)),Math.abs(n(b.low)-n(bars[i-1].close))));
  }

  function atr(bars, period=10) {
    const tr=trueRange(bars), out=Array(bars.length).fill(null),p=Math.max(1,Math.floor(period)); if(!bars.length)return out;
    let seed=0; for(let i=0;i<bars.length;i++){ if(i<p){seed+=tr[i];if(i===p-1)out[i]=seed/p;} else out[i]=(out[i-1]*(p-1)+tr[i])/p; }
    return out;
  }

  function supertrend(bars, period=10, mult=3) {
    const a=atr(bars,period), line=Array(bars.length).fill(null), direction=Array(bars.length).fill(null); let finalUpper=null,finalLower=null,dir=1;
    for(let i=0;i<bars.length;i++){
      if(!finite(a[i]))continue; const hl2=(n(bars[i].high)+n(bars[i].low))/2, basicUpper=hl2+mult*a[i], basicLower=hl2-mult*a[i];
      if(i===0||!finite(finalUpper)){ finalUpper=basicUpper;finalLower=basicLower; }
      else { finalUpper=(basicUpper<finalUpper||n(bars[i-1].close)>finalUpper)?basicUpper:finalUpper; finalLower=(basicLower>finalLower||n(bars[i-1].close)<finalLower)?basicLower:finalLower; }
      if(i>0){ if(dir<0&&n(bars[i].close)>finalUpper)dir=1; else if(dir>0&&n(bars[i].close)<finalLower)dir=-1; }
      direction[i]=dir; line[i]=dir>0?finalLower:finalUpper;
    }
    return { line,direction };
  }

  function computeIndicator(id,bars,params={}) {
    const c=close(bars);
    switch(id){
      case 'sma': return { lines:[{name:'SMA',values:sma(c,params.period||20)}] };
      case 'ema': return { lines:[{name:'EMA',values:ema(c,params.period||20)}] };
      case 'rsi': return { pane:'rsi', lines:[{name:'RSI',values:rsi(c,params.period||14)}] };
      case 'macd': { const m=macd(c,params.fast||12,params.slow||26,params.signal||9); return {pane:'macd',lines:[{name:'MACD',values:m.line},{name:'Signal',values:m.signal}],histogram:m.histogram}; }
      case 'bb': { const b=bollinger(c,params.period||20,params.mult||2); return {lines:[{name:'Upper',values:b.upper},{name:'Middle',values:b.middle},{name:'Lower',values:b.lower}]}; }
      case 'vwap': return {lines:[{name:'VWAP',values:vwap(bars)}]};
      case 'supertrend': {const s=supertrend(bars,params.period||10,params.mult||3);return {lines:[{name:'Supertrend',values:s.line}],direction:s.direction};}
      default:return null;
    }
  }

  function filterCatalog(query='', favorites=new Set()) {
    const q=String(query).trim().toLowerCase();
    return [...CATALOG].sort((a,b)=>(favorites.has(b.id)?1:0)-(favorites.has(a.id)?1:0)||a.name.localeCompare(b.name)).filter(x=>!q||`${x.name} ${x.short} ${x.category}`.toLowerCase().includes(q));
  }

  function drawSeries(ctx,view,bars,values,color,width=1.4){
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();let begun=false;
    for(let i=0;i<bars.length;i++){if(!finite(values[i]))continue;const x=view.timeToX(bars[i].t);if(x<view.state.pad.l-2||x>view.state.w-view.state.pad.r+2)continue;const y=view.priceToY(values[i]);begun?(ctx.lineTo(x,y)):(ctx.moveTo(x,y),begun=true);} if(begun)ctx.stroke();ctx.lineWidth=1;
  }

  function paneBounds(view,index,total){ const full=Math.min(180,Math.max(90,(view.state.h-view.state.pad.t-view.state.pad.b)*.24)), h=full/Math.max(1,total), bottom=view.state.h-view.state.pad.b-index*h; return {top:bottom-h,bottom,height:h}; }
  function paneY(value,min,max,b){ return b.bottom-4-((value-min)/(max-min||1))*(b.height-8); }

  function drawPaneLine(ctx,view,bars,values,b,min,max,color){ctx.strokeStyle=color;ctx.lineWidth=1.2;ctx.beginPath();let begun=false;for(let i=0;i<bars.length;i++){if(!finite(values[i]))continue;const x=view.timeToX(bars[i].t);if(x<view.state.pad.l||x>view.state.w-view.state.pad.r)continue;const y=paneY(values[i],min,max,b);begun?ctx.lineTo(x,y):(ctx.moveTo(x,y),begun=true);}if(begun)ctx.stroke();ctx.lineWidth=1;}

  function createRenderer({ctx,canvas,view,getBars,getActive}){
    return function render(){
      const bars=getBars(),active=[...getActive()];ctx.clearRect(0,0,view.state.w,view.state.h);if(!bars.length||!active.length)return;
      const paneIds=active.filter(id=>id==='rsi'||id==='macd');
      for(const id of active){const r=computeIndicator(id,bars);if(!r)continue;
        if(!r.pane){const palette=id==='bb'?[COLORS.bb,COLORS.sma,COLORS.bb]:[COLORS[id]||COLORS.sma];r.lines.forEach((l,i)=>drawSeries(ctx,view,bars,l.values,palette[i%palette.length],i===1&&id==='bb'?1:1.4));}
        else {const pi=paneIds.indexOf(id),b=paneBounds(view,pi,paneIds.length);ctx.fillStyle='rgba(13,17,23,.82)';ctx.fillRect(view.state.pad.l,b.top,view.state.w-view.state.pad.l-view.state.pad.r,b.height);ctx.strokeStyle='rgba(138,151,163,.22)';ctx.strokeRect(view.state.pad.l,b.top,view.state.w-view.state.pad.l-view.state.pad.r,b.height);
          if(id==='rsi'){drawPaneLine(ctx,view,bars,r.lines[0].values,b,0,100,COLORS.rsi);for(const level of [30,70]){const y=paneY(level,0,100,b);ctx.strokeStyle='rgba(138,151,163,.3)';ctx.beginPath();ctx.moveTo(view.state.pad.l,y);ctx.lineTo(view.state.w-view.state.pad.r,y);ctx.stroke();}}
          if(id==='macd'){const vals=[...r.lines[0].values,...r.lines[1].values,...r.histogram].filter(finite),mx=Math.max(1e-9,...vals.map(v=>Math.abs(v)));const zero=paneY(0,-mx,mx,b);ctx.strokeStyle='rgba(138,151,163,.3)';ctx.beginPath();ctx.moveTo(view.state.pad.l,zero);ctx.lineTo(view.state.w-view.state.pad.r,zero);ctx.stroke();drawPaneLine(ctx,view,bars,r.lines[0].values,b,-mx,mx,COLORS.macd);drawPaneLine(ctx,view,bars,r.lines[1].values,b,-mx,mx,COLORS.signal);ctx.fillStyle='rgba(138,151,163,.55)';for(let i=0;i<bars.length;i++){const v=r.histogram[i];if(!finite(v))continue;const x=view.timeToX(bars[i].t);if(x<view.state.pad.l||x>view.state.w-view.state.pad.r)continue;const y=paneY(v,-mx,mx,b);ctx.fillRect(x-1,Math.min(y,zero),2,Math.max(1,Math.abs(zero-y)));}}
          ctx.fillStyle='#8a97a3';ctx.font='10px Inter,system-ui,sans-serif';ctx.fillText(id.toUpperCase(),view.state.pad.l+6,b.top+12);
        }
      }
    };
  }

  function initBrowser(){
    const wait=()=>{const api=window.__advChartV1Internals,overlay=document.getElementById('advChartOverlay');if(!api||!overlay)return setTimeout(wait,80);setup(api,overlay);};wait();
  }

  function setup(api,overlay){
    if(window.__sbcIndicatorStage4)return;window.__sbcIndicatorStage4=true;
    const wrap=overlay.querySelector('.adv-chart-wrap'),fg=overlay.querySelector('#advChartOverlayCanvas'),bg=overlay.querySelector('#advChartCanvas'),toolbar=overlay.querySelector('.adv-toolbar'),status=overlay.querySelector('#advChartStatus');
    const canvas=document.createElement('canvas');canvas.id='advChartIndicatorCanvas';canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';fg.style.zIndex='2';wrap.insertBefore(canvas,fg);const ctx=canvas.getContext('2d');
    const active=new Set(), favorites=new Set(JSON.parse(localStorage.getItem('sbcChartIndicatorFavorites')||'[]'));let bars=[];let dataKey='';let panelOpen=false;
    const render=createRenderer({ctx,canvas,view:api.view,getBars:()=>bars,getActive:()=>active});
    const oldScene=api.layers.renderScene.bind(api.layers),oldCross=api.layers.renderCrosshair.bind(api.layers);
    api.layers.renderScene=()=>{oldScene();syncCanvas();render();}; api.layers.renderCrosshair=()=>{oldCross();};
    function syncCanvas(){const rect=bg.getBoundingClientRect(),dpr=window.devicePixelRatio||1;if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));canvas.style.width=rect.width+'px';canvas.style.height=rect.height+'px';ctx.setTransform(dpr,0,0,dpr,0,0);}}
    function parseStatus(){const parts=String(status.textContent||'').split('·').map(s=>s.trim());return {symbol:(parts[0]||'AAPL').replace(/^Loading\s+/,'').split(/\s+/)[0],interval:parts[1]||overlay.querySelector('[data-tf].active')?.dataset.tf||'5m'};}
    async function syncData(){const {symbol,interval}=parseStatus(),key=symbol+'|'+interval;if(!symbol||!interval||key===dataKey&&bars.length)return;dataKey=key;bars=await api.fetchBars(symbol,interval);render();}
    const button=document.createElement('button');button.dataset.action='indicators';button.textContent='Indicators';const grow=toolbar.querySelector('.grow');toolbar.insertBefore(button,grow);
    const panel=document.createElement('div');panel.id='advIndicatorPanel';panel.style.cssText='position:absolute;z-index:8;top:46px;left:12px;width:min(390px,calc(100vw - 24px));max-height:min(560px,75vh);display:none;flex-direction:column;background:#11151d;border:1px solid #232b36;border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.5);overflow:hidden';panel.innerHTML='<div style="display:flex;gap:8px;padding:10px;border-bottom:1px solid #232b36"><input id="advIndicatorSearch" autocomplete="off" placeholder="Search indicators" style="flex:1;background:#0d1117;color:#f7f9fb;border:1px solid #232b36;border-radius:7px;padding:9px"><button id="advIndicatorClose" style="background:#1a2029;color:#f7f9fb;border:1px solid #232b36;border-radius:7px">✕</button></div><div id="advIndicatorList" style="overflow:auto;padding:6px"></div>';overlay.appendChild(panel);
    const search=panel.querySelector('#advIndicatorSearch'),list=panel.querySelector('#advIndicatorList');
    function drawList(){const items=filterCatalog(search.value,favorites);list.innerHTML=items.map(x=>`<div data-ind-row="${x.id}" style="display:grid;grid-template-columns:30px 1fr auto;gap:8px;align-items:center;padding:8px;border-radius:7px;${active.has(x.id)?'background:#1a2029':''}"><button data-fav="${x.id}" title="Favorite" style="background:transparent;border:0;color:${favorites.has(x.id)?'#ffc928':'#8a97a3'};font-size:16px;cursor:pointer">★</button><button data-ind="${x.id}" ${x.implemented?'':'disabled'} style="text-align:left;background:transparent;border:0;color:${x.implemented?'#f7f9fb':'#65717e'};cursor:${x.implemented?'pointer':'not-allowed'}"><b>${x.short}</b><br><span style="font-size:10px;color:#8a97a3">${x.name} · ${x.category}</span></button><span style="font-size:9px;color:${x.implemented?'#2ee6a6':'#65717e'}">${x.implemented?(active.has(x.id)?'ON':'READY'):'COMING'}</span></div>`).join('');}
    function togglePanel(force){panelOpen=typeof force==='boolean'?force:!panelOpen;panel.style.display=panelOpen?'flex':'none';button.classList.toggle('active',panelOpen);if(panelOpen){drawList();setTimeout(()=>search.focus(),0);}}
    button.addEventListener('click',e=>{e.stopPropagation();togglePanel();});panel.querySelector('#advIndicatorClose').onclick=()=>togglePanel(false);search.addEventListener('input',drawList);
    list.addEventListener('click',e=>{const fav=e.target.closest('[data-fav]');if(fav){const id=fav.dataset.fav;favorites.has(id)?favorites.delete(id):favorites.add(id);localStorage.setItem('sbcChartIndicatorFavorites',JSON.stringify([...favorites]));drawList();return;}const b=e.target.closest('[data-ind]');if(!b||b.disabled)return;active.has(b.dataset.ind)?active.delete(b.dataset.ind):active.add(b.dataset.ind);drawList();render();});
    new MutationObserver(()=>syncData()).observe(status,{childList:true,characterData:true,subtree:true});
    toolbar.addEventListener('click',e=>{if(e.target.closest('[data-tf]'))setTimeout(syncData,0);});
    window.addEventListener('resize',()=>{syncCanvas();render();});syncCanvas();syncData();
    window.__advChartStage4Indicators={active,favorites,getBars:()=>bars,render,syncData,filterCatalog,computeIndicator};
  }

  const exported={CATALOG,sma,ema,rsi,macd,bollinger,vwap,atr,supertrend,computeIndicator,filterCatalog};
  if(typeof module!=='undefined'&&module.exports)module.exports=exported;
  if(typeof window!=='undefined'&&typeof document!=='undefined')initBrowser();
})();
