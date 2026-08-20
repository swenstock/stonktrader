(()=>{
'use strict';
if(window.__sbcPriceSyncV1)return;window.__sbcPriceSyncV1=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let cfg=null,loading=null;
const keyForName=name=>{const n=String(name||'').trim().toUpperCase();if(n.includes('FREE'))return'freeroll';if(n.includes('JR.')||n.includes('JUNIOR'))return'junior';if(n.includes('TRADER'))return'trader';if(n.includes('CLERK'))return'clerk';if(n.includes('RUNNER'))return'runner';return null;};
const priceText=t=>!t||Number(t.playerPrice)===0?'FREE':`${Number(t.playerPrice).toLocaleString()} STONK`;
const usdText=t=>!t||Number(t.playerPrice)===0?'Zero-risk entry':`≈ $${Number(t.playerPriceUsd||0).toFixed(2)} today`;
const comboText=t=>!t||Number(t.playerPrice)===0?'FREE':`${Number(t.playerPrice).toLocaleString()} STONK ≈ $${Number(t.playerPriceUsd||0).toFixed(2)}`;
function patchTierData(){
  try{
    if(typeof TIER_DATA==='undefined'||!cfg?.tiers)return;
    const map={freeroll:'freeroll',runner:'runner',clerk:'clerk',trader:'trader',junior:'junior'};
    Object.entries(map).forEach(([shellKey,cfgKey])=>{const d=TIER_DATA[shellKey],t=cfg.tiers[cfgKey];if(!d||!t)return;d.price=Number(t.playerPrice||0);d.usd=Number(t.playerPrice)===0?'FREE':`$${Number(t.playerPriceUsd||0).toFixed(2)}`;});
  }catch(_){ }
}
function patchDom(){
  if(!cfg?.tiers)return;
  $$('.mini-tier').forEach(row=>{const k=keyForName($('b',row)?.textContent);const t=cfg.tiers[k];const span=$('span',row);if(t&&span)span.textContent=comboText(t);});
  $$('.floor-clean-card').forEach(card=>{const k=keyForName($('h3',card)?.textContent);const t=cfg.tiers[k];if(!t)return;const p=$('.price',card),u=$('.usd',card);if(p)p.textContent=priceText(t);if(u)u.textContent=usdText(t);});
  $$('.tier-tile').forEach(card=>{const k=keyForName(card.textContent);const t=cfg.tiers[k];if(!t)return;const p=$('.price',card),u=$('.usd',card);if(p)p.textContent=priceText(t);if(u)u.textContent=usdText(t);});
  const ref=$('.price-ref b');if(ref&&Number.isFinite(Number(cfg.stonkUsdPrice)))ref.textContent=`$${Number(cfg.stonkUsdPrice).toFixed(5)}/STONK`;
}
function installRenderHooks(){
  ['showView','renderTradingFloor','renderSessions','renderMyContests'].forEach(name=>{const fn=window[name];if(typeof fn!=='function'||fn.__priceSyncV1)return;const wrapped=function(){const out=fn.apply(this,arguments);setTimeout(patchDom,0);return out;};wrapped.__priceSyncV1=true;window[name]=wrapped;});
}
async function sync(){
  if(loading)return loading;
  loading=fetch('/api/config',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('config');return r.json();}).then(d=>{cfg=d;patchTierData();patchDom();installRenderHooks();return d;}).catch(()=>null).finally(()=>{loading=null;});
  return loading;
}
function start(){sync();setTimeout(sync,1200);setInterval(sync,60000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
