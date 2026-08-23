// v45-advanced-chart-v1.js
// Standalone additive advanced chart. Stage 5 persists layout state per symbol/interval.
// Stage 4 drawing management, Stage 3 axes/OHLC/price-scale, and Stage 2 layering remain intact.

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
  const DRAWING_HIT_PX = 6;
  const LAYOUT_PREFIX = 'sbc-chart-layout:';
  const DEFAULT_CHART_TYPE = 'candles';

  function layoutStorageKey(symbol, interval) {
    return `${LAYOUT_PREFIX}${String(symbol || '').trim().toUpperCase()}:${String(interval || '').trim()}`;
  }

  function defaultLayoutState({ chartType = DEFAULT_CHART_TYPE, interval = '5m' } = {}) {
    return { drawings: [], activeIndicators: [], chartType, interval };
  }

  function cloneDrawings(drawings) {
    return Array.isArray(drawings) ? drawings.map(d => ({
      type: d?.type,
      points: Array.isArray(d?.points) ? d.points.map(point => ({ time: Number(point.time), price: Number(point.price) })) : [],
    })) : [];
  }

  function validDrawing(d) {
    if (!d || !['trend','horizontal'].includes(d.type) || !Array.isArray(d.points)) return false;
    const required = d.type === 'trend' ? 2 : 1;
    if (d.points.length < required) return false;
    return d.points.slice(0, required).every(p => Number.isFinite(Number(p?.time)) && Number.isFinite(Number(p?.price)));
  }

  function createLayoutPayload({ drawings, activeIndicators, chartType, interval } = {}) {
    const indicatorArray = Array.isArray(activeIndicators) ? activeIndicators : [...(activeIndicators || [])];
    return {
      drawings: cloneDrawings(drawings).filter(validDrawing),
      activeIndicators: indicatorArray.filter(id => typeof id === 'string'),
      chartType: ['candles','line'].includes(chartType) ? chartType : DEFAULT_CHART_TYPE,
      interval: typeof interval === 'string' && interval ? interval : '5m',
    };
  }

  function loadLayout(storage, symbol, interval, defaults = {}) {
    const fallback = defaultLayoutState({ chartType: defaults.chartType, interval: defaults.interval || interval });
    try {
      const raw = storage?.getItem?.(layoutStorageKey(symbol, interval));
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
      if (!Array.isArray(parsed.drawings) || !parsed.drawings.every(validDrawing)) return fallback;
      if (!Array.isArray(parsed.activeIndicators) || !parsed.activeIndicators.every(id => typeof id === 'string')) return fallback;
      if (!['candles','line'].includes(parsed.chartType)) return fallback;
      if (parsed.interval !== interval) return fallback;
      return createLayoutPayload(parsed);
    } catch (_) {
      return fallback;
    }
  }

  function saveLayout(storage, symbol, interval, state) {
    try {
      const payload = createLayoutPayload(state);
      storage?.setItem?.(layoutStorageKey(symbol, interval), JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  function makeDebouncedLayoutSaver({ storage, delay = 400, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    let timer = null;
    let pending = null;
    const flush = () => {
      if (timer !== null) clearTimer(timer);
      timer = null;
      if (!pending) return false;
      const next = pending;
      pending = null;
      return saveLayout(storage, next.symbol, next.interval, next.state);
    };
    return {
      schedule(symbol, interval, state) {
        pending = { symbol, interval, state: createLayoutPayload(state) };
        if (timer !== null) clearTimer(timer);
        timer = setTimer(() => { timer = null; const next = pending; pending = null; if (next) saveLayout(storage, next.symbol, next.interval, next.state); }, delay);
      },
      flush,
      cancel() { if (timer !== null) clearTimer(timer); timer = null; pending = null; },
      get hasPending() { return !!pending; },
    };
  }

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

  function pointSegmentDistancePx(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const denom = dx * dx + dy * dy;
    if (!denom) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denom));
    const qx = ax + t * dx, qy = ay + t * dy;
    return Math.hypot(px - qx, py - qy);
  }

  function hitTestDrawing(drawings, view, x, y, threshold = DRAWING_HIT_PX) {
    for (let i = drawings.length - 1; i >= 0; i--) {
      const d = drawings[i];
      if (!d || !Array.isArray(d.points) || !d.points.length) continue;
      if (d.type === 'trend' && d.points.length >= 2) {
        const a = d.points[0], b = d.points[1];
        const dist = pointSegmentDistancePx(
          x, y,
          view.timeToX(a.time), view.priceToY(a.price),
          view.timeToX(b.time), view.priceToY(b.price)
        );
        if (dist <= threshold) return i;
      } else if (d.type === 'horizontal') {
        const dist = Math.abs(y - view.priceToY(d.points[0].price));
        if (dist <= threshold) return i;
      }
    }
    return -1;
  }

  function hitTestHandle(drawings, selectedIndex, view, x, y, threshold = DRAWING_HIT_PX) {
    const d = drawings[selectedIndex];
    if (!d || !Array.isArray(d.points)) return -1;
    for (let i = 0; i < d.points.length; i++) {
      const p = d.points[i];
      const hx = d.type === 'horizontal' ? view.state.w - view.state.pad.r - 16 : view.timeToX(p.time);
      const hy = view.priceToY(p.price);
      if (Math.hypot(x - hx, y - hy) <= threshold + 2) return i;
    }
    return -1;
  }

  function dragDrawingHandle(drawings, selectedIndex, handleIndex, view, x, y) {
    const d = drawings[selectedIndex];
    const p = d?.points?.[handleIndex];
    if (!p) return false;
    p.time = view.xToTime(x);
    p.price = view.yToPrice(y);
    return true;
  }

  function deleteSelectedDrawing(drawings, selectedIndex) {
    if (selectedIndex < 0 || selectedIndex >= drawings.length) return -1;
    drawings.splice(selectedIndex, 1);
    return -1;
  }

  function makeDrawingInteractionController({ drawings, view, layers, threshold = DRAWING_HIT_PX, onChange = () => {} }) {
    let selectedIndex = -1;
    let activeHandle = -1;
    return {
      get selectedIndex() { return selectedIndex; },
      get activeHandle() { return activeHandle; },
      setSelectedIndex(index) { selectedIndex = index; activeHandle = -1; return selectedIndex; },
      pointerDown(x, y) {
        const handle = hitTestHandle(drawings, selectedIndex, view, x, y, threshold);
        if (handle >= 0) {
          activeHandle = handle;
          return { type:'handle', selectedIndex, handleIndex:handle };
        }
        selectedIndex = hitTestDrawing(drawings, view, x, y, threshold);
        activeHandle = -1;
        layers.renderScene();
        return { type:'selection', selectedIndex };
      },
      pointerMove(x, y) {
        if (selectedIndex >= 0 && activeHandle >= 0) {
          dragDrawingHandle(drawings, selectedIndex, activeHandle, view, x, y);
          onChange('drawing-drag');
          layers.renderScene();
          return 'drag';
        }
        layers.renderCrosshair();
        return 'crosshair';
      },
      pointerUp() { activeHandle = -1; },
      deleteSelected() {
        selectedIndex = deleteSelectedDrawing(drawings, selectedIndex);
        activeHandle = -1;
        onChange('drawing-delete');
        layers.renderScene();
        return selectedIndex;
      },
      clearSelection() {
        selectedIndex = -1;
        activeHandle = -1;
        layers.renderScene();
      },
    };
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

  function drawHandle(ctx, x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.bg;
    ctx.fill();
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 2;
    ctx.stroke();
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

    for (let i = 0; i < opts.drawings.length; i++) {
      const d = opts.drawings[i], selected = i === opts.selectedIndex;
      ctx.strokeStyle = selected ? COLORS.gold : COLORS.blue;
      ctx.lineWidth = selected ? 2.75 : 1.5;
      if (d.type === 'trend') {
        const [a,b]=d.points;
        ctx.beginPath(); ctx.moveTo(view.timeToX(a.time),view.priceToY(a.price)); ctx.lineTo(view.timeToX(b.time),view.priceToY(b.price)); ctx.stroke();
        if (selected) {
          drawHandle(ctx, view.timeToX(a.time), view.priceToY(a.price));
          drawHandle(ctx, view.timeToX(b.time), view.priceToY(b.price));
        }
      } else if (d.type === 'horizontal') {
        const p=d.points[0], y=view.priceToY(p.price);
        ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(w-pad.r,y); ctx.stroke();
        if (selected) drawHandle(ctx, w-pad.r-16, y);
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
    let bars=[],symbol='AAPL',interval='5m',chartType=DEFAULT_CHART_TYPE,tool='pointer',pendingPoint=null,panStart=null,panDomainStart=null,priceDrag=null,mouseX=-1,mouseY=-1;
    const drawings=[];
    let interactions;
    let restoredIndicatorIds=[];
    let indicatorBridge=null;
    const layoutSaver=makeDebouncedLayoutSaver({storage:window.localStorage,delay:400});

    const currentLayoutState=()=>({drawings,activeIndicators:indicatorBridge?.getActive?.() ?? restoredIndicatorIds,chartType,interval});
    const scheduleLayoutSave=()=>layoutSaver.schedule(symbol,interval,currentLayoutState());
    const syncToolbarState=()=>{
      overlay.querySelectorAll('[data-tf]').forEach(b=>b.classList.toggle('active',b.dataset.tf===interval));
      overlay.querySelectorAll('[data-type]').forEach(b=>b.classList.toggle('active',b.dataset.type===chartType));
    };
    const applyLayout=(layout)=>{
      drawings.splice(0,drawings.length,...cloneDrawings(layout.drawings));
      interactions?.setSelectedIndex(-1);
      chartType=layout.chartType;
      interval=layout.interval;
      restoredIndicatorIds=[...layout.activeIndicators];
      indicatorBridge?.setActive?.(restoredIndicatorIds);
      syncToolbarState();
    };
    const restoreCurrentLayout=()=>{
      const layout=loadLayout(window.localStorage,symbol,interval,{chartType:DEFAULT_CHART_TYPE,interval});
      applyLayout(layout);
      return layout;
    };
    const registerIndicatorPersistence=bridge=>{
      indicatorBridge=bridge || null;
      if(indicatorBridge?.setActive) indicatorBridge.setActive(restoredIndicatorIds);
      return [...restoredIndicatorIds];
    };

    const layers=makeLayerRenderer({
      drawBackground(){ drawChart(bgCtx,view,bars,{chartType,showVolume:true,drawings,interval,selectedIndex:interactions?.selectedIndex ?? -1}); },
      drawForeground(){ const {w,h}=view.state; fgCtx.clearRect(0,0,w,h); if(mouseX>=0) drawCrosshair(fgCtx,view,mouseX,mouseY,bars,interval); },
    });
    interactions=makeDrawingInteractionController({drawings,view,layers,onChange:scheduleLayoutSave});

    function resize(){
      const rect=bgCanvas.parentElement.getBoundingClientRect();
      resizeLayersForDpr({canvases:[bgCanvas,fgCanvas],contexts:[bgCtx,fgCtx],view,width:rect.width,height:rect.height,dpr:window.devicePixelRatio||1});
      layers.renderScene();
    }
    function autoDomain(){ if(!bars.length)return; const times=bars.map(b=>b.t),prices=bars.flatMap(b=>[b.high,b.low]),p2=(Math.max(...prices)-Math.min(...prices))*.08||1; view.setDomain(Math.min(...times),Math.max(...times),Math.min(...prices)-p2,Math.max(...prices)+p2); }
    async function loadData({restoreLayout=true}={}){ if(restoreLayout)restoreCurrentLayout(); statusEl.textContent=`Loading ${symbol} ${interval}…`; bars=await fetchBars(symbol,interval); autoDomain(); statusEl.textContent=`${symbol} · ${interval} · ${chartType} · ${bars.length} bars`; layers.renderScene(); }

    overlay.querySelector('.adv-toolbar').addEventListener('click',e=>{
      const btn=e.target.closest('button'); if(!btn)return;
      if(btn.dataset.tf){ layoutSaver.flush(); interval=btn.dataset.tf; loadData(); }
      else if(btn.dataset.type){ chartType=btn.dataset.type; overlay.querySelectorAll('[data-type]').forEach(b=>b.classList.toggle('active',b===btn)); scheduleLayoutSave(); layers.renderScene(); }
      else if(btn.dataset.tool){ tool=btn.dataset.tool; pendingPoint=null; if(tool!=='pointer') interactions.setSelectedIndex(-1); overlay.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b===btn)); layers.renderScene(); }
      else if(btn.dataset.action==='clear'){ drawings.splice(0,drawings.length); interactions.setSelectedIndex(-1); scheduleLayoutSave(); layers.renderScene(); }
      else if(btn.dataset.action==='close'){ layoutSaver.flush(); overlay.classList.remove('open'); }
    });

    fgCanvas.addEventListener('mousedown',e=>{
      const rect=fgCanvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
      if(tool==='pointer'){
        const action=interactions.pointerDown(x,y);
        if(action.type==='selection' && action.selectedIndex < 0){ panStart={x,y}; panDomainStart={...view.state}; }
        return;
      }
      const point={time:view.xToTime(x),price:view.yToPrice(y)};
      if(tool==='horizontal'){ drawings.push({type:'horizontal',points:[point]}); interactions.setSelectedIndex(drawings.length-1); scheduleLayoutSave(); layers.renderScene(); return; }
      if(!pendingPoint){ pendingPoint=point; return; }
      drawings.push({type:'trend',points:[pendingPoint,point]}); pendingPoint=null; interactions.setSelectedIndex(drawings.length-1); scheduleLayoutSave(); layers.renderScene();
    });

    priceZone.addEventListener('mousedown',e=>{ e.preventDefault(); e.stopPropagation(); priceDrag={startY:e.clientY,domain:{minPrice:view.state.minPrice,maxPrice:view.state.maxPrice}}; });

    window.addEventListener('mousemove',e=>{
      if(!overlay.classList.contains('open'))return;
      const rect=fgCanvas.getBoundingClientRect(); mouseX=e.clientX-rect.left; mouseY=e.clientY-rect.top;
      if(priceDrag){ const next=priceScaleDomainFromDrag(priceDrag.domain,priceDrag.startY,e.clientY,view.state.h-pad.t-pad.b); view.setDomain(view.state.minTime,view.state.maxTime,next.minPrice,next.maxPrice); layers.renderScene(); return; }
      if(tool==='pointer' && interactions.activeHandle >= 0){ interactions.pointerMove(mouseX,mouseY); return; }
      if(panStart){ const dx=mouseX-panStart.x,span=panDomainStart.maxTime-panDomainStart.minTime,shift=-(dx/(view.state.w-pad.l-pad.r))*span; view.setDomain(panDomainStart.minTime+shift,panDomainStart.maxTime+shift,panDomainStart.minPrice,panDomainStart.maxPrice); layers.renderScene(); }
      else layers.renderCrosshair();
    });
    window.addEventListener('mouseup',()=>{ panStart=null; priceDrag=null; interactions.pointerUp(); });

    window.addEventListener('keydown',e=>{
      if(!overlay.classList.contains('open') || tool!=='pointer') return;
      if((e.key==='Delete'||e.key==='Backspace') && interactions.selectedIndex>=0){ e.preventDefault(); interactions.deleteSelected(); }
    });

    fgCanvas.addEventListener('wheel',e=>{ e.preventDefault(); const factor=e.deltaY>0?1.1:.9,{minTime,maxTime}=view.state,center=view.xToTime(mouseX); view.setDomain(center-(center-minTime)*factor,center+(maxTime-center)*factor,view.state.minPrice,view.state.maxPrice); layers.renderScene(); },{passive:false});
    fgCanvas.addEventListener('dblclick',()=>{autoDomain();layers.renderScene();});

    trigger.addEventListener('click',()=>{ const selected=String(document.querySelector('#view-portfolio .trade-search-row select,#view-portfolio .quick-trade-clean select,#view-portfolio select')?.value||'').trim().toUpperCase(),changed=selected&&selected!==symbol; if(changed)layoutSaver.flush(); if(selected)symbol=selected; overlay.classList.add('open'); requestAnimationFrame(()=>{resize();if(!bars.length||changed)loadData();}); });
    window.addEventListener('resize',()=>{if(overlay.classList.contains('open'))resize();});
    window.addEventListener('beforeunload',()=>layoutSaver.flush());
    window.__advChartV1Internals={makeView,resizeLayersForDpr,makeLayerRenderer,medianVisibleSpacingMs,candleWidthPx,nearestBarByTime,priceScaleDomainFromDrag,hitTestDrawing,hitTestHandle,dragDrawingHandle,deleteSelectedDrawing,makeDrawingInteractionController,drawChart,drawCrosshair,fetchBars,offlineSampleBars,layoutStorageKey,createLayoutPayload,loadLayout,saveLayout,makeDebouncedLayoutSaver,view,layers,drawings,interactions,registerIndicatorPersistence,notifyLayoutChanged:scheduleLayoutSave,restoreCurrentLayout,flushLayout:()=>layoutSaver.flush(),getLayoutState:currentLayoutState};
  }

  const exported={makeView,resizeLayersForDpr,makeLayerRenderer,medianVisibleSpacingMs,candleWidthPx,nearestBarByTime,priceScaleDomainFromDrag,formatAxisTime,hitTestDrawing,hitTestHandle,dragDrawingHandle,deleteSelectedDrawing,makeDrawingInteractionController,layoutStorageKey,defaultLayoutState,createLayoutPayload,loadLayout,saveLayout,makeDebouncedLayoutSaver};
  if(typeof module!=='undefined'&&module.exports) module.exports=exported;
  if(typeof document!=='undefined'){ if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true}); else start(); }
})();
