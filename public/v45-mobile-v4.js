(()=>{
  'use strict';
  if(window.__sbcMobileV4Loader)return;window.__sbcMobileV4Loader=true;
  const mq=window.matchMedia('(max-width:760px)');

  function stripLegacyMobileArtifacts(){
    document.querySelectorAll('.mobile-floor-icons,.mobile-book-tabs,.mobile-exchange-focus,.mobile-recent-toggle').forEach(x=>x.remove());
    document.querySelectorAll('.mobile-book-active,.mobile-collapsed').forEach(x=>x.classList.remove('mobile-book-active','mobile-collapsed'));
    const summary=document.querySelector('#view-exchange .market-summary');if(summary)summary.style.removeProperty('display');
  }

  function loadNativeMobile(){
    if(!mq.matches)return;
    stripLegacyMobileArtifacts();
    if(!document.querySelector('link[data-sbc-mobile-native-v43]')){
      const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-mobile-native-v43.css?v=43';l.dataset.sbcMobileNativeV43='1';document.head.appendChild(l);
    }
    if(!window.__sbcMobileNativeV43&&!document.querySelector('script[data-sbc-mobile-native-v43]')){
      const s=document.createElement('script');s.src='/v45-mobile-native-v43.js?v=43';s.dataset.sbcMobileNativeV43='1';document.head.appendChild(s);
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadNativeMobile,{once:true});else loadNativeMobile();
  mq.addEventListener?.('change',e=>{if(e.matches)loadNativeMobile()});
})();