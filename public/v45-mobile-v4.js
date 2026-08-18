(()=>{
  'use strict';
  if(window.__sbcMobileV4Loader)return;window.__sbcMobileV4Loader=true;
  const mq=window.matchMedia('(max-width:760px)');

  function stripLegacyMobileArtifacts(){
    document.querySelectorAll('.mobile-floor-icons,.mobile-book-tabs,.mobile-exchange-focus,.mobile-recent-toggle').forEach(x=>x.remove());
    document.querySelectorAll('.mobile-book-active,.mobile-collapsed').forEach(x=>x.classList.remove('mobile-book-active','mobile-collapsed'));
    const summary=document.querySelector('#view-exchange .market-summary');if(summary)summary.style.removeProperty('display');
  }
  function addCss(href,key){if(document.querySelector(`link[data-${key}]`))return;const l=document.createElement('link');l.rel='stylesheet';l.href=href;l.setAttribute(`data-${key}`,'1');document.head.appendChild(l)}
  function loadRefine(){
    addCss('/v45-mobile-native-refine-v44.css?v=44','sbc-mobile-native-refine-v44');
    if(!window.__sbcMobileNativeRefineV44&&!document.querySelector('script[data-sbc-mobile-native-refine-v44]')){const s=document.createElement('script');s.src='/v45-mobile-native-refine-v44.js?v=44';s.dataset.sbcMobileNativeRefineV44='1';document.head.appendChild(s)}
  }
  function loadNativeMobile(){
    if(!mq.matches)return;
    stripLegacyMobileArtifacts();
    addCss('/v45-mobile-native-v43.css?v=43','sbc-mobile-native-v43');
    if(window.__sbcMobileNativeV43){loadRefine();return}
    let s=document.querySelector('script[data-sbc-mobile-native-v43]');
    if(!s){s=document.createElement('script');s.src='/v45-mobile-native-v43.js?v=43';s.dataset.sbcMobileNativeV43='1';document.head.appendChild(s)}
    s.addEventListener('load',loadRefine,{once:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadNativeMobile,{once:true});else loadNativeMobile();
  mq.addEventListener?.('change',e=>{if(e.matches)loadNativeMobile()});
})();