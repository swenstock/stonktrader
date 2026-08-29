(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches||window.__sbcChartWorkstationV1)return;window.__sbcChartWorkstationV1=true;
const $=(s,r=document)=>r?.querySelector?.(s)||null,$$=(s,r=document)=>r?[...r.querySelectorAll(s)]:[];
const clean=s=>String(s||'').replace(/\s+/g,' ').trim(),norm=s=>clean(s).toUpperCase();
const state={tool:'pan',draw:null,seq:0};
function card(){return $('#view-portfolio .chart-trade-card')}
function viewport(c=card()){return $('.stage45-chart-viewport-v50',c)}
function nativeButton(label,c=card()){
  const want=norm(label);
  return $$('button',c).find(b=>!b.closest('.chart-workstation-v1')&&!b.closest('.chart-drawing-rail-v1')&&norm(b.textContent)===want)||null;
}
function clickNative(label){const b=nativeButton(label);if(!b)return false;b.click();return true;}
function clickTime(label){const c=card(),tb=$('.chart-toolbar',c);if(!tb)return false;const b=$$('button',tb).find(x=>norm(x.textContent)===norm(label));if(!b)return false;b.click();setTimeout(sync,20);return true;}
function sync(){
  const c=card(),bar=$('.chart-workstation-v1',c);if(!c||!bar)return;
  const tb=$('.chart-toolbar',c);
  $$('[data-cw-time]',bar).forEach(b=>{const n=tb&&$$('button',tb).find(x=>norm(x.textContent)===norm(b.dataset.cwTime));b.classList.toggle('active',!!n&&(n.classList.contains('active')||n.getAttribute('aria-pressed')==='true'||n.dataset.active==='true'));});
  ['CANDLES','LINE','VOLUME','MA','EMA','CROSSHAIR'].forEach(k=>{const n=nativeButton(k==='VOLUME'?'VOL':k,c)||nativeButton(k,c);$$(`[data-cw-native="${k}"]`,c).forEach(b=>b.classList.toggle('active',!!n&&(n.classList.contains('active')||n.getAttribute('aria-pressed')==='true'||n.dataset.active==='true')));});
}
function installTopbar(c){
  const native=$('.chart-toolbar',c);if(!native||$('.chart-workstation-v1',c))return;
  native.classList.add('cw-native-toolbar-v1');
  const bar=document.createElement('div');bar.className='chart-workstation-v1';bar.dataset.chartPresentationOwner='workstation-v1';
  bar.innerHTML=`<div class="cw-timeframes-v1">${['TICK','1m','5m','15m','1h','1D'].map(x=>`<button type="button" data-cw-time="${x}">${x==='TICK'?'1s':x}</button>`).join('')}</div><span class="cw-separator-v1"></span><details class="cw-menu-v1"><summary>STYLE <span>⌄</span></summary><div class="cw-pop-v1 cw-style-pop-v1"><button type="button" data-cw-native="CANDLES">Candles</button><button type="button" data-cw-native="LINE">Line</button></div></details><details class="cw-menu-v1 cw-indicators-v1"><summary>INDICATORS <span>⌄</span></summary><div class="cw-pop-v1 cw-indicator-pop-v1"><input type="search" data-cw-indicator-search placeholder="Search indicators" aria-label="Search indicators"><button type="button" data-cw-native="VOLUME" data-cw-indicator="volume"><b>Volume</b><small>Trading volume</small></button><button type="button" data-cw-native="MA" data-cw-indicator="moving average"><b>Moving Average</b><small>MA overlay</small></button><button type="button" data-cw-native="EMA" data-cw-indicator="exponential moving average"><b>Exponential MA</b><small>EMA overlay</small></button></div></details><button type="button" data-cw-native="CROSSHAIR" title="Toggle crosshair">CROSSHAIR</button><button type="button" class="cw-fit-v1" data-cw-fit>FIT</button><button type="button" class="cw-full-v1" data-cw-full>FULL SCREEN</button>`;
  native.before(bar);
  $$('[data-cw-time]',bar).forEach(b=>b.onclick=()=>clickTime(b.dataset.cwTime));
  $$('[data-cw-native]',bar).forEach(b=>b.onclick=()=>{const k=b.dataset.cwNative;clickNative(k==='VOLUME'?'VOL':k)||clickNative(k);setTimeout(sync,20)});
  $('[data-cw-fit]',bar).onclick=()=>{window.SBCChartViewportV50?.fit?.();};
  $('[data-cw-full]',bar).onclick=()=>{$('[data-stage67-chart-expand]',c)?.click();};
  const search=$('[data-cw-indicator-search]',bar);search.oninput=()=>{const q=norm(search.value);$$('[data-cw-indicator]',bar).forEach(b=>b.hidden=!!q&&!norm(b.dataset.cwIndicator+' '+b.textContent).includes(q));};
  bar.addEventListener('click',e=>{if(e.target.closest('button[data-cw-native]'))e.target.closest('details')?.removeAttribute('open');});
}
function svgEl(name,attrs={}){const e=document.createElementNS('http://www.w3.org/2000/svg',name);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));return e;}
function overlay(v){return $('.chart-drawing-overlay-v1',v)}
function pt(e,v){const r=v.getBoundingClientRect();return{x:Math.max(0,Math.min(r.width,e.clientX-r.left)),y:Math.max(0,Math.min(r.height,e.clientY-r.top)),w:r.width,h:r.height};}
function setTool(tool,c=card()){
  state.tool=tool;$$('[data-cw-tool]',c).forEach(b=>b.classList.toggle('active',b.dataset.cwTool===tool));
  const ov=overlay(viewport(c));if(ov)ov.classList.toggle('drawing-active-v1',tool!=='pan'&&tool!=='crosshair');
  if(tool==='crosshair'){clickNative('CROSSHAIR');state.tool='pan';setTimeout(()=>{$$('[data-cw-tool]',c).forEach(b=>b.classList.toggle('active',b.dataset.cwTool==='pan'));sync();},20);}
}
function clearDrawings(v){const g=$('.cw-drawings-v1',overlay(v));if(g)g.replaceChildren();state.draw=null;}
function finishDraw(v){state.draw=null;setTool('pan');}
function beginDraw(e,v){
  if(state.tool==='pan'||state.tool==='crosshair')return;const p=pt(e,v),ov=overlay(v),g=$('.cw-drawings-v1',ov);if(!g)return;e.preventDefault();e.stopPropagation();
  if(state.tool==='hline'){const line=svgEl('line',{x1:0,y1:p.y,x2:p.w,y2:p.y,class:'cw-line-v1'});g.appendChild(line);finishDraw(v);return;}
  const group=svgEl('g',{'data-cw-drawing':++state.seq});const line=svgEl('line',{x1:p.x,y1:p.y,x2:p.x,y2:p.y,class:'cw-line-v1'});group.appendChild(line);
  let label=null;if(state.tool==='measure'){label=svgEl('text',{x:p.x+8,y:p.y-8,class:'cw-measure-label-v1'});label.textContent='MEASURE';group.appendChild(label);}
  g.appendChild(group);state.draw={tool:state.tool,p0:p,group,line,label};ov.setPointerCapture?.(e.pointerId);
}
function moveDraw(e,v){if(!state.draw)return;const p=pt(e,v),d=state.draw;e.preventDefault();e.stopPropagation();d.line.setAttribute('x2',p.x);d.line.setAttribute('y2',p.y);if(d.label){const dx=((p.x-d.p0.x)/Math.max(1,p.w))*100,dy=((d.p0.y-p.y)/Math.max(1,p.h))*100;d.label.setAttribute('x',Math.min(p.x,d.p0.x)+8);d.label.setAttribute('y',Math.min(p.y,d.p0.y)-8);d.label.textContent=`ΔX ${Math.abs(dx).toFixed(1)}% • ΔY ${Math.abs(dy).toFixed(1)}%`;}}
function endDraw(e,v){if(!state.draw)return;e.preventDefault();e.stopPropagation();finishDraw(v);}
function installDrawingLayer(c){
  const v=viewport(c);if(!v)return;
  if(!$('.chart-drawing-overlay-v1',v)){
    const ov=svgEl('svg',{class:'chart-drawing-overlay-v1','aria-hidden':'true'});ov.innerHTML='<g class="cw-drawings-v1"></g>';v.appendChild(ov);ov.addEventListener('pointerdown',e=>beginDraw(e,v));ov.addEventListener('pointermove',e=>moveDraw(e,v));ov.addEventListener('pointerup',e=>endDraw(e,v));ov.addEventListener('pointercancel',e=>endDraw(e,v));
  }
  if(!$('.chart-drawing-rail-v1',v)){
    const rail=document.createElement('div');rail.className='chart-drawing-rail-v1';rail.innerHTML='<button type="button" data-cw-tool="pan" title="Pan / zoom">↔</button><button type="button" data-cw-tool="crosshair" data-cw-native="CROSSHAIR" title="Crosshair">＋</button><button type="button" data-cw-tool="trend" title="Trend line">╱</button><button type="button" data-cw-tool="hline" title="Horizontal line">—</button><button type="button" data-cw-tool="measure" title="Measure">⌁</button><button type="button" data-cw-clear title="Clear drawings">⌫</button>';v.appendChild(rail);$$('[data-cw-tool]',rail).forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();setTool(b.dataset.cwTool,c)});$('[data-cw-clear]',rail).onclick=e=>{e.preventDefault();e.stopPropagation();clearDrawings(v);setTool('pan',c)};
  }
  setTool(state.tool,c);
}
function ensure(){const c=card();if(!c)return;installTopbar(c);installDrawingLayer(c);sync();}
function hook(name){const fn=window[name];if(typeof fn!=='function'||fn.__chartWorkstationV1)return;const w=function(){const out=fn.apply(this,arguments);setTimeout(ensure,0);return out};w.__chartWorkstationV1=true;w.__chartWorkstationOriginal=fn;window[name]=w;}
function installHooks(){['renderSymbolChart','renderPortfolio','showView'].forEach(hook);}
function start(){installHooks();ensure();setTimeout(()=>{installHooks();ensure()},300);setTimeout(()=>{installHooks();ensure()},1200);setTimeout(()=>{installHooks();ensure()},2500);window.addEventListener('resize',()=>setTimeout(ensure,60),{passive:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();