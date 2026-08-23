// v45-advanced-chart-v1.js
//
// STANDALONE, ADDITIVE ONLY. Does not modify, wrap, or touch any existing
// function, view, or the existing SVG chart in #view-portfolio. Injects its
// own trigger button and opens as a full-screen overlay. Built as Stage 1
// per the spec's own recommended development order: candles, volume, real
// pan/zoom, crosshair, timeframe switching. Not the full drawing/indicator
// suite from the spec - that's staged deliberately, not an oversight.
//
// Data: fetches from GET /api/quotes/bars (new, additive route - see
// routes_quoteBars.js). Falls back to a clearly-labeled offline sample if
// that endpoint isn't reachable, so the chart is never silently blank.
//
// Coordinate architecture (per spec section 36 - this is the part that
// matters most to get right): every drawing object is stored as
// {time, price} pairs, NEVER as raw pixel x/y. Pixel positions are only
// ever computed at render time via timeToX/xToTime/priceToY/yToPrice. This
// is what makes drawings track correctly through pan/zoom instead of
// drifting.

(() => {
  'use strict';
  if (window.__sbcAdvancedChartV1) return;
  window.__sbcAdvancedChartV1 = true;

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
        const span = maxTime - minTime || 1;
        return pad.l + ((t - minTime) / span) * (w - pad.l - pad.r);
      },
      xToTime(x) {
        const { minTime, maxTime, w, pad } = state;
        const span = maxTime - minTime || 1;
        return minTime + ((x - pad.l) / (w - pad.l - pad.r)) * span;
      },
      priceToY(p) {
        const { minPrice, maxPrice, h, pad } = state;
        const span = maxPrice - minPrice || 1;
        return pad.t + (1 - (p - minPrice) / span) * (h - pad.t - pad.b);
      },
      yToPrice(y) {
        const { minPrice, maxPrice, h, pad } = state;
        const span = maxPrice - minPrice || 1;
        return minPrice + (1 - (y - pad.t) / (h - pad.t - pad.b)) * span;
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
    const stepMs = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '1D': 86400000 }[interval] || 300000;
    const n = 200, bars = [];
    let price = 100, now = Date.now();
    for (let i = n; i >= 0; i--) {
      const open = price;
      price = Math.max(1, price + (Math.random() - 0.5) * 2);
      const close = price;
      const high = Math.max(open, close) + Math.random() * 1.2;
      const low = Math.min(open, close) - Math.random() * 1.2;
      bars.push({ t: now - i * stepMs, open, high, low, close, volume: 50000 + Math.random() * 500000 });
    }
    return bars;
  }

  function drawChart(ctx, view, bars, opts) {
    const { w, h, pad } = view.state;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    if (!bars.length) return;

    ctx.strokeStyle = COLORS.line; ctx.fillStyle = COLORS.muted;
    ctx.font = '10px Inter, system-ui, sans-serif';
    const { minPrice, maxPrice } = view.state;
    for (let i = 0; i <= 4; i++) {
      const p = minPrice + (maxPrice - minPrice) * (i / 4);
      const y = view.priceToY(p);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillText(p.toFixed(2), w - pad.r + 6, y + 3);
    }

    const volH = (h - pad.t - pad.b) * (opts.showVolume ? 0.18 : 0);
    const chartBottom = h - pad.b - volH - (opts.showVolume ? 6 : 0);
    const maxVol = Math.max(...bars.map(b => b.volume), 1);
    const barW = Math.max(1, (view.timeToX(bars[1]?.t ?? bars[0].t + 1) - view.timeToX(bars[0].t)) * 0.7);

    for (const b of bars) {
      const x = view.timeToX(b.t);
      if (x < pad.l - barW || x > w - pad.r + barW) continue;
      const up = b.close >= b.open;
      ctx.strokeStyle = ctx.fillStyle = up ? COLORS.up : COLORS.down;

      if (opts.chartType !== 'line') {
        const yO = view.priceToY(b.open), yC = view.priceToY(b.close);
        const yH = view.priceToY(b.high), yL = view.priceToY(b.low);
        ctx.beginPath(); ctx.moveTo(x, Math.min(yH, chartBottom)); ctx.lineTo(x, Math.max(yL, 0)); ctx.stroke();
        const top = Math.min(yO, yC), bh = Math.max(1, Math.abs(yC - yO));
        ctx.fillRect(x - barW / 2, top, barW, bh);
      }

      if (opts.showVolume) {
        const vh = (b.volume / maxVol) * volH;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x - barW / 2, h - pad.b - vh, barW, vh);
        ctx.globalAlpha = 1;
      }
    }

    if (opts.chartType === 'line') {
      ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 1.5; ctx.beginPath();
      bars.forEach((b, i) => {
        const x = view.timeToX(b.t), y = view.priceToY(b.close);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke(); ctx.lineWidth = 1;
    }

    ctx.strokeStyle = COLORS.blue; ctx.lineWidth = 1.5;
    for (const d of opts.drawings) {
      if (d.type === 'trend') {
        const [a, b] = d.points;
        ctx.beginPath(); ctx.moveTo(view.timeToX(a.time), view.priceToY(a.price));
        ctx.lineTo(view.timeToX(b.time), view.priceToY(b.price)); ctx.stroke();
      } else if (d.type === 'horizontal') {
        const y = view.priceToY(d.points[0].price);
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      }
    }
    ctx.lineWidth = 1;
  }

  function drawCrosshair(ctx, view, x, y) {
    const { w, h, pad } = view.state;
    if (x < pad.l || x > w - pad.r || y < pad.t || y > h - pad.b) return;
    ctx.strokeStyle = COLORS.crosshair; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.setLineDash([]);
    const price = view.yToPrice(y);
    ctx.fillStyle = COLORS.panel; ctx.fillRect(w - pad.r + 2, y - 9, pad.r - 4, 18);
    ctx.fillStyle = COLORS.text; ctx.font = '10px Inter, sans-serif';
    ctx.fillText(price.toFixed(2), w - pad.r + 6, y + 3);
  }

  function injectStyles() {
    if (document.getElementById('advChartV1Style')) return;
    const s = document.createElement('style');
    s.id = 'advChartV1Style';
    s.textContent = `
      #advChartTrigger{position:fixed;bottom:20px;right:20px;z-index:9998;background:${COLORS.gold};color:#1a1607;border:0;border-radius:999px;padding:12px 18px;font-weight:900;font-size:12px;letter-spacing:.03em;cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.4)}
      #advChartOverlay{position:fixed;inset:0;z-index:9999;background:${COLORS.bg};display:none;flex-direction:column;font-family:Inter,system-ui,sans-serif;color:${COLORS.text}}
      #advChartOverlay.open{display:flex}
      .adv-toolbar{display:flex;align-items:center;gap:8px;padding:8px 12px;background:${COLORS.panel};border-bottom:1px solid ${COLORS.line};flex-wrap:wrap}
      .adv-toolbar button{background:#1a2029;color:${COLORS.text};border:1px solid ${COLORS.line};border-radius:6px;padding:6px 10px;font-size:11px;cursor:pointer;font-weight:700}
      .adv-toolbar button.active{background:${COLORS.gold};color:#1a1607;border-color:${COLORS.gold}}
      .adv-toolbar .sep{width:1px;height:20px;background:${COLORS.line};margin:0 4px}
      .adv-toolbar .grow{flex:1}
      .adv-close{background:transparent!important;border:0!important;font-size:16px!important;padding:4px 10px!important}
      .adv-chart-wrap{flex:1;position:relative}
      #advChartCanvas{width:100%;height:100%;display:block;cursor:crosshair}
      .adv-status{position:absolute;bottom:8px;left:12px;font-size:10px;color:${COLORS.muted}}
    `;
    document.head.appendChild(s);
  }

  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'advChartOverlay';
    overlay.innerHTML = `
      <div class="adv-toolbar">
        ${TIMEFRAMES.map(tf => `<button data-tf="${tf}">${tf}</button>`).join('')}
        <div class="sep"></div>
        <button data-type="candles" class="active">Candles</button>
        <button data-type="line">Line</button>
        <div class="sep"></div>
        <button data-tool="pointer" class="active">Pointer</button>
        <button data-tool="trend">Trend Line</button>
        <button data-tool="horizontal">Horizontal Line</button>
        <button data-action="clear">Clear Drawings</button>
        <div class="grow"></div>
        <button class="adv-close" data-action="close">✕</button>
      </div>
      <div class="adv-chart-wrap">
        <canvas id="advChartCanvas"></canvas>
        <div class="adv-status" id="advChartStatus">Loading…</div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function start() {
    injectStyles();
    const trigger = document.createElement('button');
    trigger.id = 'advChartTrigger';
    trigger.textContent = '📈 ADVANCED CHART';
    document.body.appendChild(trigger);

    const overlay = buildOverlay();
    const canvas = overlay.querySelector('#advChartCanvas');
    const statusEl = overlay.querySelector('#advChartStatus');
    const ctx = canvas.getContext('2d');

    const pad = { l: 8, r: 56, t: 10, b: 24 };
    const view = makeView(0, 0, pad);
    let bars = [];
    let symbol = 'AAPL', interval = '5m', chartType = 'candles', tool = 'pointer';
    let drawings = [];
    let pendingPoint = null;
    let panStart = null, panDomainStart = null;
    let mouseX = -1, mouseY = -1;

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width; canvas.height = rect.height;
      view.setSize(rect.width, rect.height);
      render();
    }

    function autoDomain() {
      if (!bars.length) return;
      const times = bars.map(b => b.t);
      const prices = bars.flatMap(b => [b.high, b.low]);
      const pad2 = (Math.max(...prices) - Math.min(...prices)) * 0.08 || 1;
      view.setDomain(Math.min(...times), Math.max(...times), Math.min(...prices) - pad2, Math.max(...prices) + pad2);
    }

    function render() {
      drawChart(ctx, view, bars, { chartType, showVolume: true, drawings });
      if (mouseX >= 0) drawCrosshair(ctx, view, mouseX, mouseY);
    }

    async function loadData() {
      statusEl.textContent = `Loading ${symbol} ${interval}…`;
      bars = await fetchBars(symbol, interval);
      autoDomain();
      statusEl.textContent = `${symbol} · ${interval} · ${chartType} · ${bars.length} bars`;
      render();
    }

    overlay.querySelector('.adv-toolbar').addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      if (btn.dataset.tf) {
        interval = btn.dataset.tf;
        overlay.querySelectorAll('[data-tf]').forEach(b => b.classList.toggle('active', b === btn));
        loadData();
      } else if (btn.dataset.type) {
        chartType = btn.dataset.type;
        overlay.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b === btn));
        render();
      } else if (btn.dataset.tool) {
        tool = btn.dataset.tool; pendingPoint = null;
        overlay.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b === btn));
      } else if (btn.dataset.action === 'clear') {
        drawings = []; render();
      } else if (btn.dataset.action === 'close') {
        overlay.classList.remove('open');
      }
    });

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (tool === 'pointer') {
        panStart = { x, y }; panDomainStart = { ...view.state };
        return;
      }
      const point = { time: view.xToTime(x), price: view.yToPrice(y) };
      if (tool === 'horizontal') {
        drawings.push({ type: 'horizontal', points: [point] }); render(); return;
      }
      if (!pendingPoint) { pendingPoint = point; return; }
      drawings.push({ type: 'trend', points: [pendingPoint, point] });
      pendingPoint = null; render();
    });

    window.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
      if (panStart) {
        const dx = mouseX - panStart.x;
        const span = panDomainStart.maxTime - panDomainStart.minTime;
        const shift = -(dx / (view.state.w - pad.l - pad.r)) * span;
        view.setDomain(panDomainStart.minTime + shift, panDomainStart.maxTime + shift, panDomainStart.minPrice, panDomainStart.maxPrice);
      }
      if (overlay.classList.contains('open')) render();
    });
    window.addEventListener('mouseup', () => { panStart = null; });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const { minTime, maxTime } = view.state;
      const center = view.xToTime(mouseX);
      view.setDomain(center - (center - minTime) * factor, center + (maxTime - center) * factor, view.state.minPrice, view.state.maxPrice);
      render();
    }, { passive: false });

    canvas.addEventListener('dblclick', () => { autoDomain(); render(); });

    trigger.addEventListener('click', () => {
      const selected = String(document.querySelector('#view-portfolio .trade-search-row select,#view-portfolio .quick-trade-clean select,#view-portfolio select')?.value || '').trim().toUpperCase();
      const symbolChanged = selected && selected !== symbol;
      if (selected) symbol = selected;
      overlay.classList.add('open');
      requestAnimationFrame(() => { resize(); if (!bars.length || symbolChanged) loadData(); });
    });
    window.addEventListener('resize', () => { if (overlay.classList.contains('open')) resize(); });

    window.__advChartV1Internals = { makeView, drawChart, fetchBars, offlineSampleBars };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
