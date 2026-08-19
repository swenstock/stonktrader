(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches)return;
// Stage 46 prevents the retired Stage 44 interaction engine from binding duplicate wheel/pan handlers.
window.__sbcDesktopStage44V49=true;
// Stage 47 is bootstrapped from this already-served prelock so production wiring cannot silently omit it.
if(!document.querySelector('link[data-sbc-stage47-v52]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-desktop-stage47-v52.css?v=52';l.dataset.sbcStage47V52='1';document.head.appendChild(l);}
if(!document.querySelector('script[data-sbc-stage47-v52]')){const s=document.createElement('script');s.src='/v45-desktop-stage47-v52.js?v=52';s.dataset.sbcStage47V52='1';s.defer=true;document.head.appendChild(s);}
})();