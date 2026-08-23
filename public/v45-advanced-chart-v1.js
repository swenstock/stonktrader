// v45-advanced-chart-v1.js
// Standalone additive advanced chart. Stage 3 adds time-axis labels,
// OHLC-under-cursor + crosshair time label, price-scale drag zoom, and
// median visible-bar candle spacing. Stage 2 DPR/layering remains intact.

(() => {
  'use strict';
  if (typeof window !== 'undefined') {
    if (window.__sbcAdvancedChartV1) return;
    window.__sbcAdvancedChartV1 = true;
  }

  const COLORS = {
    bg: '#0d1117', panel: '#11151d', line: '#232b36', text: '#f7f9fb', muted: '#8a97a3',
    up: '#2ee6a6', down: '#ff5d5d', gold: '#ffc928', blue: '#2ab5ff', crosshair: 'rgba(255,255,255,.35)',
  };
  const TIMEFRAMES = ['1m', '5m', '15m', '1h', '1D'];

  function makeView(canvasWidth, canvasHeight, padding) {
    const state = { minTime: 0, maxTime: 1, minPrice: 0, maxPrice: 1, w: canvasWidth, h: canvasHeight, pad: padding };
    return {
      state,
      setDomain(minTime, maxTime, minPrice, maxPrice) {
        state.minTime = minTime; state.maxTime = maxTime;
        state.minPrice = minPrice; state.maxPrice = maxPrice;
      },
      setSize(w, h) { state.w = w; state.h = h; },
      timeToX(t) {
        const { minTime, maxTime, w, pad } = state;
        return pad.l + ((t - minTime) / (maxTime - minTime || 1)) * (w - pad.l - pad.r);
      },
      xToTime(x) {
        const { minTime, maxTime, w, pad } = state;
        return minTime + ((x - pad.l) / (w - pad.l - pad.r)) * (maxTime - minTime || 1);
      },
      priceToY(p) {
        const { minPrice, maxPrice, h, pad } = state;
        return pad.t + (1 - (p - minPrice) / (maxPrice - minPrice || 1)) * (h - pad.t - pad.b);
      },
      yToPrice(y) {
        const { minPrice, maxPrice, h, pad } = state;
        return minPrice + (1 - (y - pad.t) / (h - pad.t - pad.b)) * (maxPrice - minPrice || 1);
      },
    };
  }

  function resizeLayersForDpr({ canvases, contexts, view, width, height, dpr }) {
    const scale = Number(dpr) > 0 ? Number(dpr) : 1;
    for (let i = 0; i < canvases.length; i++) {
      const canvas = canvases[i], ctx = contexts[i];
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }
    view.setSize(width, height);
  }

  function makeLayerRenderer({ drawBackground, drawForeground }) {
    return {
      renderScene() { drawBackground(); drawForeground(); },
      renderCrosshair() { drawForeground(); },
    };
  }

  function median(values) {
    const xs = values.filter(Number.isFinite).sort((a,b)=>a-b);
    if (!xs.length) return 0;
    const m = Math.floor(xs.length / 2);
    return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
  }

  function visibleBars(bars, view) {
    const { minTime, maxTime } = view.state;
    return bars.filter(b => b.t >= minTime && b.t <= maxTime);
  }

  function medianVisibleSpacingMs(bars, view) {
    const vis = visibleBars(bars, view);
    const source = vis.length >= 2 ? vis : bars;
    const gaps = [];
    for (let i = 1; i < source.length; i++) {
      const gap = Number(source[i].t) - Number(source[i - 1].t);
      if (gap > 0) gaps.push(gap);
    }
    return median(gaps);
  }

  function candleWidthPx(bars, view) {
    const spacing = medianVisibleSpacingMs(bars, view);
    if (!(spacing > 0)) return 1;
    return Math.max(1, Math.abs(view.timeToX(view.state.minTime + spacing) - view.timeToX(view.state.minTime)) * 0.7);
  }

  function nearestBarByTime(bars, time) {
    if (!bars.length) return null;
    let lo = 0, hi = bars.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (bars[mid].t < time) lo = mid + 1; else hi = mid;
    }
    const a = bars[lo], b = bars[Math.max(0, lo - 1)];
    return !b || Math.abs(a.t - time) < Math.abs(b.t - time) ? a : b;
  }

  function priceScaleDomainFromDrag(domain, startY, currentY, plotHeight) {
    const min = Number(domain.minPrice), max = Number(domain.maxPrice);
    const span = Math.max(1e-9, max - min);
    const dy = Number(currentY) - Number(startY);
    const factor = Math.exp(dy / Math.max(80, Number(plotHeight) || 1));
    const center = (min + max) / 2;
    const nextSpan = Math.max(1e-9, span * factor);
    return { minPrice: center - nextSpan / 2, maxPrice: center + nextSpan / 2 };
  }

  function formatAxisTime(ms, interval) {
    const d = new Date(ms);
    if (interval === '1D') return d.toLocaleDateString([], { month:'short', day:'numeric' });
    return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
  }

  function formatCrosshairTime(ms, interval) {
    const d = new Date(ms);
    if (interval === '1D') return d.toLocaleDateString([], { year:'numeric', month:'short', day:'numeric' });
    return d.toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
  }

  async function fetchBars(symbol, interval) {
    try {
      const r = await fetch(`/api/quotes/bars?symbol=${encodeURIComponent(symbol)}&interval=${interval}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('bars fetch failed: ' + r.status);
      const d = await r.json();
      return d.bars.map(b => ({ ...b, t: new Date(b.time).getTime() }));
    } catch (e) {
      console.warn('[advanced-chart] falling back to offline sample data:', e.message);
      return offlineSampleBars(interval);
    }
  }

  function offlineSampleBars(interval) {
    const stepMs = { '1m':60000, '5m':300000, '15m':900000, '1h':3600000, '1D':86400000 }[interval] || 300000;
    const bars = []; let price = 100, now = Date.now();
    for (let i = 200; i >= 0; i--) {
      const open = price;
      price = Math.max(1, price + (Math.random() - 0.5) * 2);
      const close = price, high = Math.max(open, close) + Math.random() * 1.2, low = Math.min(open, close) - Math.random() * 1.2;
      bars.push({ t: now - i * stepMs, open, high, low, close, volume:50000 + Math.random() * 500000 });
    }
    return bars;
  }

  function drawTimeAxis(ctx, view, interval) {
    const { w, h, pad, minTime, maxTime } = view.state;
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      const t = minTime + (maxTime - minTime) * (i / 5);
      const x = view.timeToX(t);
      if (x < pad.l || x > w - pad.r) continue;
      ctx.fillText(formatAxisTime(t, interval), x, h - 7);
    }
    ctx.textAlign = 'start';
  }

  function drawChart(ctx, view, bars, opts) {
    const { w, h, pad } = view.state;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, w, h);
    if (!bars.length) return;

    ctx.strokeStyle = COLORS.line; ctx.fillStyle = COLORS.muted;
    ctx.font = '10px Inter, system-ui, sans-serif';
    const { minPrice, maxPrice } = view.state;
    for (let i = 0; i <= 4; i++) {
      const p = minPrice + (maxPrice - minPrice) * (i / 4), y = view.priceToY(p);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.globalAlpha = .5; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillText(p.toFixed(2), w - pad.r + 6, y + 3);
    }

    drawTimeAxis(ctx, view, opts.interval);

    const volH = (h - pad.t - pad.b) * (opts.showVolume ? .18 : 0);
    const chartBottom = h - pad.b - volH - (opts.showVolume ? 6 : 0);
    const maxVol = Math.max(...bars.map(b => b.volume), 1);
    const barW = candleWidthPx(bars, view);

    for (const b of bars) {
      const x = view.timeToX(b.t);
      if (x < pad.l - barW || x > w - pad.r + barW) continue;
      const up = b.close >= b.open;
      ctx.strokeStyle = ctx.fillStyle = up ? COLORS.up : COLORS.down;
      if (opts.chartType !== 'line') {
        const yO=view.priceToY(b.open), yC=view.priceToY(b.close), yH=view.priceToY(b.high), yL=view.priceToY(b.low);
        ctx.beginPath(); ctx.moveTo(x, Math.min(yH, chartBottom)); ctx.lineTo(x, Math.max(yL, 0)); ctx.stroke();
        ctx.fillRect(x - barW/2, Math.min(yO,yC), barW, Math.max(1, Math.abs(yC-yO)));
      }
      if (opts.showVolume) {
        const vh = (b.volume / maxVol) * volH;
        ctx.globalAlpha=.55; ctx.fillRect(x-barW/2, h-pad.b-vh, barW, vh); ctx.globalAlpha=1;
      }
    }

    if (opts.chartType === 'line') {
      ctx.strokeStyle=COLORS.gold; ctx.lineWidth=1.5; ctx.beginPath();
      bars.forEach((b,i)=>{ const x=view.timeToX(b.t), y=view.priceToY(b.close); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
      ctx.stroke(); ctx.lineWidth=1;
    }

    ctx.strokeStyle=COLORS.blue; ctx.lineWidth=1.5;
    for (const d of opts.drawings) {
      if (d.type === 'trend') {
        const [a,b]=d.points; ctx.beginPath(); ctx.moveTo(view.timeToX(a.time),view.priceToY(a.price)); ctx.lineTo(view.timeToX(b.time),view.priceToY(b.price)); ctx.stroke();
      } else if (d.type === 'horizontal') {
        const y=view.priceToY(d.points[0].price); ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(w-pad.r,y); ctx.stroke();
      }
    }
    ctx.lineWidth=1;
  }

  function drawCrosshair(ctx, view, x, y, bars, interval) {
    const { w,h,pad } = view.state;
    if (x < pad.l || x > w-pad.r || y < pad.t || y > h-pad.b) return;
    ctx.strokeStyle=COLORS.crosshair; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(x,pad.t); ctx.lineTo(x,h-pad.b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(w-pad.r,y); ctx.stroke(); ctx.setLineDash([]);

    const price=view.yToPrice(y), t=view.xToTime(x), bar=nearestBarByTime(bars,t);
    ctx.fillStyle=COLORS.panel; ctx.fillRect(w-pad.r+2,y-9,pad.r-4,18);
    ctx.fillStyle=COLORS.text; ctx.font='10px Inter, sans-serif'; ctx.fillText(price.toFixed(2),w-pad.r+6,y+3);

    const timeText=formatCrosshairTime(t, interval);
    ctx.font='10px Inter, sans-serif';
    const tw=Math.min(180,Math.max(74,ctx.measureText(timeText).width+14));
    const tx=Math.min(w-pad.r-tw,Math.max(pad.l,x-tw/2));
    ctx.fillStyle=COLORS.panel; ctx.fillRect(tx,h-pad.b+2,tw,18);
    ctx.fillStyle=COLORS.text; ctx.textAlign='center'; ctx.fillText(timeText,tx+tw/2,h-pad.b+14); ctx.textAlign='start';

    if (bar) {
      const ohlc=`O ${Number(bar.open).toFixed(2)}   H ${Number(bar.high).toFixed(2)}   L ${Number(bar.low).toFixed(2)}   C ${Number(bar.close).toFixed(2)}`;
      ctx.fillStyle='rgba(17,21,29,.92)'; ctx.fillRect(pad.l+6,pad.t+6,Math.min(330,w-pad.l-pad.r-12),22);
      ctx.fillStyle=bar.close>=bar.open?COLORS.up:COLORS.down; ctx.font='11px Inter, sans-serif'; ctx.fillText(ohlc,pad.l+12,pad.t+21);
    }
  }

  function injectStyles() {
    if (document.getElementById('advChartV1Style')) return;
    const s=document.createElement('style'); s.id='advChartV1Style';
    s.textContent=`
      #advChartTrigger{position:fixed;bottom:20px;right:20px;z-index:9998;background:${COLORS.gold};color:#1a1607;border:0;border-radius:999px;padding:12px 18px;font-weight:900;font-size:12px;letter-spacing:.03em;cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.4)}
      #advChartOverlay{position:fixed;inset:0;z-index:9999;background:${COLORS.bg};display:none;flex-direction:column;font-family:Inter,system-ui,sans-serif;color:${COLORS.text}}
      #advChartOverlay.open{display:flex}.adv-toolbar{display:flex;align-items:center;gap:8px;padding:8px 12px;background:${COLORS.panel};border-bottom:1px solid ${COLORS.line};flex-wrap:wrap}
      .adv-toolbar button{background:#1a2029;color:${COLORS.text};border:1px solid ${COLORS.line};border-radius:6px;padding:6px 10px;font-size:11px;cursor:pointer;font-weight:700}.adv-toolbar button.active{background:${COLORS.gold};color:#1a1607;border-color:${COLORS.gold}}
      .adv-toolbar .sep{width:1px;height:20px;background:${COLORS.line};margin:0 4px}.adv-toolbar .grow{flex:1}.adv-close{background:transparent!important;border:0!important;font-size:16px!important;padding:4px 10px!important}
      .adv-chart-wrap{flex:1;position:relative;overflow:hidden}#advChartCanvas,#advChartOverlayCanvas{position:absolute;inset:0;width:100%;height:100%;display:block}#advChartCanvas{pointer-events:none}#advChartOverlayCanvas{z-index:1;cursor:crosshair}.adv-status{position:absolute;z-index:2;bottom:8px;left:12px;font-size:10px;color:${COLORS.muted};pointer-events:none}
      .adv-price-scale-zone{position:absolute;z-index:3;top:0;right:0;bottom:24px;width:56px;cursor:ns-resize;background:transparent}
    `; document.head.appendChild(s);
  }

  function buildOverlay() {
    const overlay=document.createElement('div'); overlay.id='advChartOverlay';
    overlay.innerHTML=`<div class="adv-toolbar">${TIMEFRAMES.map(tf=>`<button data-tf="${tf}">${tf}</button>`).join('')}<div class="sep"></div><button data-type="candles" class="active">Candles</button><button data-type="line">Line</button><div class="sep"></div><button data-tool="pointer" class="active">Pointer</button><button data-tool="trend">Trend Line</button><button data-tool="horizontal">Horizontal Line</button><button data-action="clear">Clear Drawings</button><div class="grow"></div><button class="adv-close" data-action="close">✕</button></div><div class="adv-chart-wrap"><canvas id="advChartCanvas"></canvas><canvas id="advChartOverlayCanvas"></canvas><div class="adv-price-scale-zone" title="Drag price scale to zoom"></div><div class="adv-status" id="advChartStatus">Loading…</div></div>`;
    document.body.appendChild(overlay); return overlay;
  }

  function start() {
    injectStyles();
    const trigger=document.createElement('button'); trigger.id='advChartTrigger'; trigger.textContent='📈 ADVANCED CHART'; document.body.appendChild(trigger);
    const overlay=buildOverlay(), bgCanvas=overlay.querySelector('#advChartCanvas'), fgCanvas=overlay.querySelector('#advChartOverlayCanvas'), priceZone=overlay.querySelector('.adv-price-scale-zone'), statusEl=overlay.querySelector('#advChartStatus');
    const bgCtx=bgCanvas.getContext('2d'), fgCtx=fgCanvas.getContext('2d');
    const pad={l:8,r:56,t:10,b:24}, view=makeView(0,0,pad);
    let bars=[],symbol='AAPL',interval='5m',chartType='candles',tool='pointer',drawings=[],pendingPoint=null,panStart=null,panDomainStart=null,priceDrag=null,mouseX=-1,mouseY=-1;

    const layers=makeLayerRenderer({
      drawBackground(){ drawChart(bgCtx,view,bars,{chartType,showVolume:true,drawings,interval}); },
      drawForeground(){ const {w,h}=view.state; fgCtx.clearRect(0,0,w,h); if(mouseX>=0) drawCrosshair(fgCtx,view,mouseX,mouseY,bars,interval); },
    });

    function resize(){
      const rect=bgCanvas.parentElement.getBoundingClientRect();
      resizeLayersForDpr({canvases:[bgCanvas,fgCanvas],contexts:[bgCtx,fgCtx],view,width:rect.width,height:rect.height,dpr:window.devicePixelRatio||1});
      layers.renderScene();
    }
    function autoDomain(){ if(!bars.length)return; const times=bars.map(b=>b.t),prices=bars.flatMap(b=>[b.high,b.low]),p2=(Math.max(...prices)-Math.min(...prices))*.08||1; view.setDomain(Math.min(...times),Math.max(...times),Math.min(...prices)-p2,Math.max(...prices)+p2); }
    async function loadData(){ statusEl.textContent=`Loading ${symbol} ${interval}…`; bars=await fetchBars(symbol,interval); autoDomain(); statusEl.textContent=`${symbol} · ${interval} · ${chartType} · ${bars.length} bars`; layers.renderScene(); }

    overlay.querySelector('.adv-toolbar').addEventListener('click',e=>{
      const btn=e.target.closest('button'); if(!btn)return;
      if(btn.dataset.tf){ interval=btn.dataset.tf; overlay.querySelectorAll('[data-tf]').forEach(b=>b.classList.toggle('active',b===btn)); loadData(); }
      else if(btn.dataset.type){ chartType=btn.dataset.type; overlay.querySelectorAll('[data-type]').forEach(b=>b.classList.toggle('active',b===btn)); layers.renderScene(); }
      else if(btn.dataset.tool){ tool=btn.dataset.tool; pendingPoint=null; overlay.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b===btn)); }
      else if(btn.dataset.action==='clear'){ drawings=[]; layers.renderScene(); }
      else if(btn.dataset.action==='close') overlay.classList.remove('open');
    });

    fgCanvas.addEventListener('mousedown',e=>{
      const rect=fgCanvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
      if(tool==='pointer'){ panStart={x,y}; panDomainStart={...view.state}; return; }
      const point={time:view.xToTime(x),price:view.yToPrice(y)};
      if(tool==='horizontal'){ drawings.push({type:'horizontal',points:[point]}); layers.renderScene(); return; }
      if(!pendingPoint){ pendingPoint=point; return; }
      drawings.push({type:'trend',points:[pendingPoint,point]}); pendingPoint=null; layers.renderScene();
    });

    priceZone.addEventListener('mousedown',e=>{ e.preventDefault(); e.stopPropagation(); priceDrag={startY:e.clientY,domain:{minPrice:view.state.minPrice,maxPrice:view.state.maxPrice}}; });

    window.addEventListener('mousemove',e=>{
      if(!overlay.classList.contains('open'))return;
      const rect=fgCanvas.getBoundingClientRect(); mouseX=e.clientX-rect.left; mouseY=e.clientY-rect.top;
      if(priceDrag){ const next=priceScaleDomainFromDrag(priceDrag.domain,priceDrag.startY,e.clientY,view.state.h-pad.t-pad.b); view.setDomain(view.state.minTime,view.state.maxTime,next.minPrice,next.maxPrice); layers.renderScene(); return; }
      if(panStart){ const dx=mouseX-panStart.x,span=panDomainStart.maxTime-panDomainStart.minTime,shift=-(dx/(view.state.w-pad.l-pad.r))*span; view.setDomain(panDomainStart.minTime+shift,panDomainStart.maxTime+shift,panDomainStart.minPrice,panDomainStart.maxPrice); layers.renderScene(); }
      else layers.renderCrosshair();
    });
    window.addEventListener('mouseup',()=>{ panStart=null; priceDrag=null; });

    fgCanvas.addEventListener('wheel',e=>{ e.preventDefault(); const factor=e.deltaY>0?1.1:.9,{minTime,maxTime}=view.state,center=view.xToTime(mouseX); view.setDomain(center-(center-minTime)*factor,center+(maxTime-center)*factor,view.state.minPrice,view.state.maxPrice); layers.renderScene(); },{passive:false});
    fgCanvas.addEventListener('dblclick',()=>{autoDomain();layers.renderScene();});

    trigger.addEventListener('click',()=>{ const selected=String(document.querySelector('#view-portfolio .trade-search-row select,#view-portfolio .quick-trade-clean select,#view-portfolio select')?.value||'').trim().toUpperCase(),changed=selected&&selected!==symbol; if(selected)symbol=selected; overlay.classList.add('open'); requestAnimationFrame(()=>{resize();if(!bars.length||changed)loadData();}); });
    window.addEventListener('resize',()=>{if(overlay.classList.contains('open'))resize();});
    window.__advChartV1Internals={makeView,resizeLayersForDpr,makeLayerRenderer,medianVisibleSpacingMs,candleWidthPx,nearestBarByTime,priceScaleDomainFromDrag,drawChart,drawCrosshair,fetchBars,offlineSampleBars,view,layers};
  }

  const exported={makeView,resizeLayersForDpr,makeLayerRenderer,medianVisibleSpacingMs,candleWidthPx,nearestBarByTime,priceScaleDomainFromDrag,formatAxisTime};
  if(typeof module!=='undefined'&&module.exports) module.exports=exported;
  if(typeof document!=='undefined'){ if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true}); else start(); }
})();
