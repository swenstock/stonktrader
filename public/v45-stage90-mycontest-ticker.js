(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches||window.__sbcStage90MyContestTicker)return;window.__sbcStage90MyContestTicker=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const money=n=>`$${Math.round(Number(n)||0).toLocaleString()}`;
let config=null;
function installStyle(){if($('#stage90MyContestTickerStyle'))return;const s=document.createElement('style');s.id='stage90MyContestTickerStyle';s.textContent=`
@media(min-width:901px){
#view-my .stage90-market-strip{display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:7px 12px 0;margin:0 0 4px}.stage90-stonk-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #8a6818;border-radius:999px;background:#1a1607;color:#ffd84f;padding:6px 10px;font-size:9px;font-weight:1000;letter-spacing:.035em;white-space:nowrap}.stage90-pv{display:inline-flex;align-items:center;border:1px solid #2f5d74;border-radius:999px;background:#071923;color:#65d7ff;padding:5px 8px;font-size:8px;font-weight:1000;white-space:nowrap;margin-top:5px}.stage90-selected-pv{margin-left:8px;color:#fff}.entry-chip .stage90-pv{width:max-content}.trade-head .stage90-stonk-chip{margin-left:8px}
}
`;document.head.appendChild(s)}
function parseReturn(text){const hits=[...String(text||'').matchAll(/([+-]?\d+(?:\.\d+)?)%/g)];if(!hits.length)return null;const n=Number(hits[hits.length-1][1]);return Number.isFinite(n)?n:null}
function derivedValue(el){const ret=parseReturn(clean(el?.textContent));return ret==null?null:100000*(1+ret/100)}
function actualCurrentValue(){try{const p=typeof currentPortfolio==='function'?currentPortfolio():null;if(!p)return null;let market=0;for(const [sym,h] of Object.entries(p.holdings||{})){let px=0;try{px=Number(STOCKS?.[sym]?.price||0)}catch(_){}if(!(px>0))px=Number(h.avg||0);market+=Number(h.shares||0)*px}return Number(p.cash||0)+market}catch(_){return null}}
function attachPv(host,value,cls=''){if(!host||!(value>0))return;let tag=$('.stage90-pv',host);if(!tag){tag=document.createElement('span');tag.className=`stage90-pv ${cls}`.trim();host.appendChild(tag)}tag.textContent=`PV ${money(value)}`}
function hydrateMyContests(){const view=$('#view-my');if(!view||getComputedStyle(view).display==='none')return;for(const chip of $$('.entry-chip',view)){const old=$('.mc-value-v89',chip);if(old)old.remove();const v=derivedValue(chip);if(v!=null)attachPv(chip,v)}const selected=$('.selected-entry-banner',view)||$$('div,section',view).find(x=>/^NOW VIEWING\b/i.test(clean(x.textContent))&&clean(x.textContent).length<220);if(selected){const old=$('.mycontest-selected-value-v89',selected);if(old)old.remove();const actual=actualCurrentValue(),fallback=derivedValue(selected);const v=actual>0?actual:fallback;if(v>0)attachPv(selected,v,'stage90-selected-pv')}}
async function loadConfig(){if(config)return config;try{const r=await fetch('/api/config',{cache:'no-store'});if(!r.ok)return null;config=await r.json();return config}catch(_){return null}}
async function hydrateTicker(){const cfg=await loadConfig();const price=Number(cfg?.stonkUsdPrice);if(!Number.isFinite(price))return;const text=`$STONKBROKER  $${price.toFixed(5)}`;const my=$('#view-my');if(my){let strip=$('.stage90-market-strip',my);if(!strip){strip=document.createElement('div');strip.className='stage90-market-strip';my.prepend(strip)}let chip=$('.stage90-stonk-chip',strip);if(!chip){chip=document.createElement('span');chip.className='stage90-stonk-chip';strip.appendChild(chip)}chip.textContent=text}const head=$('#view-portfolio .trade-head');if(head){let chip=$('.stage90-stonk-chip',head);if(!chip){chip=document.createElement('span');chip.className='stage90-stonk-chip';head.appendChild(chip)}chip.textContent=text}const oldMy=$('#view-my>.stonkbroker-price-v89');if(oldMy)oldMy.remove();const ref=$('.price-ref b');if(ref)ref.textContent=text}
async function sync(){installStyle();hydrateMyContests();await hydrateTicker()}
function start(){installStyle();sync();setInterval(sync,3000);document.addEventListener('click',()=>setTimeout(sync,40),false);window.addEventListener('focus',sync)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
