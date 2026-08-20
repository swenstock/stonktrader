(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches)return;
// Stage 46 prevents the retired Stage 44 interaction engine from binding duplicate wheel/pan handlers.
window.__sbcDesktopStage44V49=true;
// Stage 51 remains the sole owner of desktop analytics header placement; Stage 53 corrects which native panels it owns.
window.__sbcDesktopStage47V52=true;
window.__sbcDesktopStage48V53=true;
window.__sbcDesktopStage49V54=true;
if(!document.querySelector('link[data-sbc-stage51-v55]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-desktop-stage51-v55.css?v=55';l.dataset.sbcStage51V55='1';document.head.appendChild(l);}
if(!document.querySelector('script[data-sbc-stage51-v55]')){const s=document.createElement('script');s.src='/v45-desktop-stage51-v55.js?v=57';s.dataset.sbcStage51V55='1';s.defer=true;document.head.appendChild(s);}
// Stage 52 preserves the compact desktop focus/perspective while Stage 51 owns analytics placement.
if(!document.querySelector('link[data-sbc-stage52-v56]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-desktop-stage52-v56.css?v=56';l.dataset.sbcStage52V56='1';document.head.appendChild(l);}
if(!document.querySelector('script[data-sbc-stage52-v56]')){const s=document.createElement('script');s.src='/v45-desktop-stage52-v56.js?v=56';s.dataset.sbcStage52V56='1';s.defer=true;document.head.appendChild(s);}
// Browser Back follows SBC view history instead of leaving the site after in-app navigation.
if(!document.querySelector('script[data-sbc-browser-history-v1]')){const s=document.createElement('script');s.src='/v45-browser-history-v1.js?v=1';s.dataset.sbcBrowserHistoryV1='1';s.defer=true;document.head.appendChild(s);}
})();