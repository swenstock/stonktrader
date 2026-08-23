(()=>{
'use strict';
if(window.__sbcPriceSyncV1)return;window.__sbcPriceSyncV1=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let cfg=null,loading=null;
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const keyForName=name=>{const n=String(name||'').trim().toUpperCase();if(n.includes('FREE'))return'freeroll';if(n.includes('JR.')||n.includes('JUNIOR'))return'junior';if(n.includes('TRADER'))return'trader';if(n.includes('CLERK'))return'clerk';if(n.includes('RUNNER'))return'runner';return null;};
const priceText=t=>!t||Number(t.playerPrice)===0?'FREE':`${Number(t.playerPrice).toLocaleString()} STONK`;
const usdText=t=>!t||Number(t.playerPrice)===0?'Zero-risk entry':`≈ $${Number(t.playerPriceUsd||0).toFixed(2)} today`;
const comboText=t=>!t||Number(t.playerPrice)===0?'FREE':`${Number(t.playerPrice).toLocaleString()} STONK ≈ $${Number(t.playerPriceUsd||0).toFixed(2)}`;
const money=n=>`$${Math.round(Number(n)||0).toLocaleString()}`;
function installExtraStyle(){if($('#priceSyncV3Style'))return;const s=document.createElement('style');s.id='priceSyncV3Style';s.textContent=`@media(min-width:901px){#view-my .price-sync-market-strip-v3{display:flex;justify-content:flex-end;align-items:center;padding:7px 12px 0;margin:0 0 4px}.price-sync-stonk-v3{display:inline-flex;align-items:center;gap:6px;border:1px solid #8a6818;border-radius:999px;background:#1a1607;color:#ffd84f;padding:6px 10px;font-size:9px;font-weight:1000;letter-spacing:.035em;white-space:nowrap}.price-sync-pv-v3{display:inline-flex;align-items:center;border:1px solid #2f5d74;border-radius:999px;background:#071923;color:#65d7ff;padding:5px 8px;font-size:8px;font-weight:1000;white-space:nowrap;margin-top:5px}.entry-chip .price-sync-pv-v3{width:max-content}.trade-head .price-sync-stonk-v3{margin-left:8px}}`;document.head.appendChild(s)}
function parseReturn(text){const hits=[...String(text||'').matchAll(/([+-]?\d+(?:\.\d+)?)%/g)];if(!hits.length)return null;const n=Number(hits[hits.length-1][1]);return Number.isFinite(n)?n:null}
function visibleEntryValue(el){const ret=parseReturn(clean(el?.textContent));return ret==null?null:100000*(1+ret/100)}
function attachPv(host,value){if(!host||!(value>0))return;let tag=$('.price-sync-pv-v3',host);if(!tag){tag=document.createElement('span');tag.className='price-sync-pv-v3';host.appendChild(tag)}tag.textContent=`PV ${money(value)}`}
function patchMyContestValues(){const view=$('#view-my');if(!view)return;for(const chip of $$('.entry-chip',view)){const old=$('.mc-value-v89',chip);if(old)old.remove();const v=visibleEntryValue(chip);if(v!=null)attachPv(chip,v)}const selected=$('.selected-entry-banner',view)||$$('div,section',view).find(x=>/^NOW VIEWING\b/i.test(clean(x.textContent))&&clean(x.textContent).length<240);if(selected){const old=$('.mycontest-selected-value-v89',selected);if(old)old.remove();const v=visibleEntryValue(selected);if(v!=null)attachPv(selected,v)}}
function patchStonkTicker(){const price=Number(cfg?.stonkUsdPrice);if(!Number.isFinite(price))return;installExtraStyle();const text=`$STONKBROKER  $${price.toFixed(5)}`;const my=$('#view-my');if(my){let strip=$('.price-sync-market-strip-v3',my);if(!strip){strip=document.createElement('div');strip.className='price-sync-market-strip-v3';my.prepend(strip)}let chip=$('.price-sync-stonk-v3',strip);if(!chip){chip=document.createElement('span');chip.className='price-sync-stonk-v3';strip.appendChild(chip)}chip.textContent=text}const head=$('#view-portfolio .trade-head');if(head){let chip=$('.price-sync-stonk-v3',head);if(!chip){chip=document.createElement('span');chip.className='price-sync-stonk-v3';head.appendChild(chip)}chip.textContent=text}const oldMy=$('#view-my>.stonkbroker-price-v89');if(oldMy)oldMy.remove();const ref=$('.price-ref b');if(ref)ref.textContent=text}
function patchTierData(){
  try{
    if(typeof TIER_DATA==='undefined'||!cfg?.tiers)return;
    const map={freeroll:'freeroll',runner:'runner',clerk:'clerk',trader:'trader',junior:'junior'};
    Object.entries(map).forEach(([shellKey,cfgKey])=>{const d=TIER_DATA[shellKey],t=cfg.tiers[cfgKey];if(!d||!t)return;d.price=Number(t.playerPrice||0);d.usd=Number(t.playerPrice)===0?'FREE':`$${Number(t.playerPriceUsd||0).toFixed(2)}`;});
  }catch(_){ }
}
function patchDom(){
  if(!cfg?.tiers)return;
  installExtraStyle();
  $$('.mini-tier').forEach(row=>{const k=keyForName($('b',row)?.textContent);const t=cfg.tiers[k];const span=$('span',row);if(t&&span)span.textContent=comboText(t);});
  $$('.floor-clean-card').forEach(card=>{const k=keyForName($('h3',card)?.textContent);const t=cfg.tiers[k];if(!t)return;const p=$('.price',card),u=$('.usd',card);if(p)p.textContent=priceText(t);if(u)u.textContent=usdText(t);});
  $$('.tier-tile').forEach(card=>{const k=keyForName(card.textContent);const t=cfg.tiers[k];if(!t)return;const p=$('.price',card),u=$('.usd',card);if(p)p.textContent=priceText(t);if(u)u.textContent=usdText(t);});
  patchMyContestValues();
  patchStonkTicker();
}
function installRenderHooks(){
  ['showView','renderTradingFloor','renderSessions','renderMyContests'].forEach(name=>{const fn=window[name];if(typeof fn!=='function'||fn.__priceSyncV1)return;const wrapped=function(){const out=fn.apply(this,arguments);setTimeout(patchDom,0);setTimeout(patchDom,80);return out;};wrapped.__priceSyncV1=true;window[name]=wrapped;});
}
async function sync(){
  if(loading)return loading;
  loading=fetch('/api/config',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('config');return r.json();}).then(d=>{cfg=d;patchTierData();patchDom();installRenderHooks();return d;}).catch(()=>null).finally(()=>{loading=null;});
  return loading;
}
function start(){installExtraStyle();sync();setTimeout(sync,1200);setInterval(()=>{patchDom();sync();},60000);document.addEventListener('click',()=>setTimeout(patchDom,40),false);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
