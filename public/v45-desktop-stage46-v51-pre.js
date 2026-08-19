(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches)return;
// Stage 46 prevents the retired Stage 44 interaction engine from binding duplicate wheel/pan handlers.
window.__sbcDesktopStage44V49=true;
// Stage 51 is the sole owner of desktop analytics header placement.
window.__sbcDesktopStage47V52=true;
window.__sbcDesktopStage48V53=true;
window.__sbcDesktopStage49V54=true;
if(!document.querySelector('link[data-sbc-stage51-v55]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-desktop-stage51-v55.css?v=55';l.dataset.sbcStage51V55='1';document.head.appendChild(l);}
if(!document.querySelector('script[data-sbc-stage51-v55]')){const s=document.createElement('script');s.src='/v45-desktop-stage51-v55.js?v=55';s.dataset.sbcStage51V55='1';s.defer=true;document.head.appendChild(s);}
})();