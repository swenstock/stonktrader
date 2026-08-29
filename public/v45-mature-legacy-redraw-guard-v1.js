(()=>{
'use strict';
if(window.__sbcMatureLegacyRedrawGuardV1)return;window.__sbcMatureLegacyRedrawGuardV1=true;
function matureReady(){
  const host=document.querySelector('.sbc-mature-chart-host-v1.is-ready');
  return !!(host&&host.isConnected);
}
function install(){
  const current=window.renderSymbolChart;
  if(typeof current!=='function'||current.__matureLegacyRedrawGuardV1)return false;
  const wrapped=function(){
    if(matureReady())return false;
    return current.apply(this,arguments);
  };
  wrapped.__matureLegacyRedrawGuardV1=true;
  wrapped.__legacyRenderSymbolChart=current;
  window.renderSymbolChart=wrapped;
  return true;
}
install();
setTimeout(install,0);setTimeout(install,250);setTimeout(install,1000);
window.SBCMatureLegacyRedrawGuardV1={matureReady,install};
})();
