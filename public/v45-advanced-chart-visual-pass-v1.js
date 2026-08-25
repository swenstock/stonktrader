(()=>{
'use strict';
if(typeof window==='undefined'||typeof document==='undefined'||window.__sbcAdvancedChartVisualPassV1)return;
window.__sbcAdvancedChartVisualPassV1=true;

// NOTE: this file previously duplicated hover state, whole-line dragging,
// and creation preview - all of that already exists, tested, in the core
// chart file (v45-advanced-chart-v1.js). Running two independent
// implementations of the same gesture on the same DOM elements is exactly
// what caused the trendline-body drag to misbehave. This file now does
// ONLY what it uniquely provides: icon styling and toolbar polish CSS.

const ICONS={
  pointer:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l5.5 15 2-6.2L19 9.7z"/></svg>',
  trend:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M6.6 16.6L17.4 7.4"/></svg>',
  horizontal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="4.5" cy="12" r="2"/><path d="M8 12h13"/></svg>',
  clear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/></svg>',
  candles:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 4v4M6 14v6M18 4v6M18 16v4"/><rect x="4" y="8" width="4" height="6" rx=".5"/><rect x="16" y="10" width="4" height="6" rx=".5"/></svg>',
  line:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16l5-7 4 4 7-9"/></svg>',
  indicators:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 12h3l2-6 4 12 2-6h5"/></svg>'
};
const GOLD='#ffc928';
let overlay=null;

function addStyles(){
  if(document.getElementById('sbcChartVisualPassV1Style'))return;
  const s=document.createElement('style');s.id='sbcChartVisualPassV1Style';s.textContent=`
    #advChartOverlay{background:radial-gradient(circle at 50% -25%,rgba(42,181,255,.055),transparent 44%),#0d1117!important}
    #advChartOverlay .adv-toolbar{min-height:46px;padding:7px 10px!important;gap:5px!important;background:rgba(17,21,29,.96)!important;backdrop-filter:blur(10px);box-shadow:0 1px 0 rgba(255,255,255,.025);flex-wrap:nowrap!important;overflow-x:auto}
    #advChartOverlay .adv-toolbar::-webkit-scrollbar{display:none}
    #advChartOverlay .adv-toolbar button{height:30px;min-width:30px;padding:0 9px!important;border-radius:6px!important;background:transparent!important;border-color:transparent!important;color:#aeb9c4!important;font-weight:650!important;transition:background .12s ease,color .12s ease,border-color .12s ease,transform .12s ease}
    #advChartOverlay .adv-toolbar button:hover{background:#19212b!important;color:#f7f9fb!important;border-color:#2a3542!important}
    #advChartOverlay .adv-toolbar button.active{background:rgba(255,201,40,.12)!important;color:${GOLD}!important;border-color:rgba(255,201,40,.34)!important}
    #advChartOverlay .adv-toolbar button.sbc-chart-icon-btn{width:32px;min-width:32px;padding:0!important;display:inline-flex;align-items:center;justify-content:center}
    #advChartOverlay .adv-toolbar button.sbc-chart-icon-btn svg{width:16px;height:16px;display:block}
    #advChartOverlay .adv-toolbar .sep{height:18px!important;background:#28323e!important;margin:0 3px!important}
    #advChartOverlay .adv-close{font-size:17px!important;color:#8d99a5!important}
    #advChartOverlay .adv-close:hover{color:#fff!important;background:#202832!important}
    #advChartOverlay .adv-chart-wrap{background:#0d1117}
    #advChartOverlay #advChartStatus{top:10px!important;bottom:auto!important;left:12px!important;padding:5px 8px;border:1px solid rgba(255,255,255,.06);border-radius:5px;background:rgba(13,17,23,.76);backdrop-filter:blur(5px);letter-spacing:.01em;color:#9ba7b3!important}
  `;document.head.appendChild(s);
}

function iconize(btn,key,label){
  if(!btn||btn.dataset.sbcIconized)return;
  btn.dataset.sbcIconized='1';btn.classList.add('sbc-chart-icon-btn');btn.title=label;btn.setAttribute('aria-label',label);btn.innerHTML=ICONS[key];
}
function iconizeToolbar(){
  if(!overlay)return;
  iconize(overlay.querySelector('[data-type="candles"]'),'candles','Candles');
  iconize(overlay.querySelector('[data-type="line"]'),'line','Line');
  iconize(overlay.querySelector('[data-tool="pointer"]'),'pointer','Pointer');
  iconize(overlay.querySelector('[data-tool="trend"]'),'trend','Trend Line');
  iconize(overlay.querySelector('[data-tool="horizontal"]'),'horizontal','Horizontal Line');
  iconize(overlay.querySelector('[data-action="clear"]'),'clear','Clear Drawings');
  iconize(overlay.querySelector('[data-action="indicators"]'),'indicators','Indicators');
}

function install(){
  overlay=document.getElementById('advChartOverlay');
  const toolbar=overlay?.querySelector('.adv-toolbar');
  if(!overlay||!toolbar)return false;
  addStyles();iconizeToolbar();
  new MutationObserver(()=>iconizeToolbar()).observe(toolbar,{childList:true,subtree:true});
  return true;
}

let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>120)clearInterval(timer);},50);
})();
