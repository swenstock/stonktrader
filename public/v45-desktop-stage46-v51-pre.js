(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches)return;
// Stage 46 prevents the retired Stage 44 interaction engine from binding duplicate wheel/pan handlers.
window.__sbcDesktopStage44V49=true;
// Stage 50 single-owner lock: Stage 47/48 JavaScript must not run. Their CSS may remain for sizing only.
window.__sbcDesktopStage47V52=true;
window.__sbcDesktopStage48V53=true;
if(!document.querySelector('link[data-sbc-stage47-v52]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-desktop-stage47-v52.css?v=52';l.dataset.sbcStage47V52='1';document.head.appendChild(l);}
if(!document.querySelector('link[data-sbc-stage48-v53]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-desktop-stage48-v53.css?v=53';l.dataset.sbcStage48V53='1';document.head.appendChild(l);}
// Stage 49 is the sole runtime owner for physically rehoming the real analytics controls.
if(!document.querySelector('link[data-sbc-stage49-v54]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-desktop-stage49-v54.css?v=54';l.dataset.sbcStage49V54='1';document.head.appendChild(l);}
if(!document.querySelector('script[data-sbc-stage49-v54]')){const s=document.createElement('script');s.src='/v45-desktop-stage49-v54.js?v=54';s.dataset.sbcStage49V54='1';s.defer=true;document.head.appendChild(s);}
})();