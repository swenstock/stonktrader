(()=>{
'use strict';
if(window.__sbcPortfolioHeaderV44)return;window.__sbcPortfolioHeaderV44=true;
if(window.matchMedia('(max-width:620px)').matches)return;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let repairing=false,timer=null;
function ctx(){try{return typeof activePortfolioContext!=='undefined'?activePortfolioContext:null}catch(_){return null}}
function stableCopy(head,title,subtitle){
  let copy=subtitle?.parentElement;
  if(copy&&head.contains(copy)&&!copy.classList.contains('trade-head-title-row'))return copy;
  copy=title?.closest('.trade-head-copy');
  while(copy&&copy.classList.contains('trade-head-title-row'))copy=copy.parentElement?.closest('.trade-head-copy')||copy.parentElement;
  if(copy&&head.contains(copy)&&!copy.classList.contains('trade-head-title-row'))return copy;
  return title?.parentElement&&head.contains(title.parentElement)?title.parentElement:null;
}
function artClone(head){
  const arts=$$('.tier-broker-title-art',head);
  const src=arts.find(a=>a.querySelector('img,svg')||a.style.backgroundImage)||arts[0];
  if(!src)return null;
  const c=src.cloneNode(true);c.removeAttribute('id');c.classList.add('header-art-v16');return c;
}
function updateRule(row){
  const degen=!!ctx()?.degen;
  const badge=$('.trade-rule-badge',row);
  if(badge){badge.id='tradeRuleBadge';badge.classList.toggle('degen',degen);badge.textContent=degen?'DEGEN • NO POSITION CAP':'STANDARD • 10% MAX AT ENTRY';}
}
function canonical(head,title,copy){
  const rows=$$('.trade-head-title-row',head).filter(r=>!r.classList.contains('header-row-sentinel-v16'));
  const badges=$$('.trade-rule-badge',head),rules=$$('.trade-rule-review',head),arts=$$('.tier-broker-title-art',head);
  const copies=$$('.trade-head-copy',head);
  return rows.length===1&&rows[0].classList.contains('portfolio-header-v44')&&title.parentElement===rows[0]&&badges.length===1&&rules.length===1&&arts.length===1&&copies.length===1&&copies[0]===copy;
}
function repair(){
  if(repairing)return;
  const head=$('#view-portfolio .trade-head'),title=$('#portfolioTitle'),subtitle=$('#portfolioSubtitle');
  if(!head||!title||!subtitle)return;
  const copy=stableCopy(head,title,subtitle);if(!copy)return;
  if(canonical(head,title,copy)){updateRule(title.parentElement);return;}
  repairing=true;
  try{
    const art=artClone(head);
    if(subtitle.parentElement===copy)copy.insertBefore(title,subtitle);else copy.appendChild(title);
    $$('.trade-head-title-row',head).forEach(r=>r.remove());
    $$('.trade-rule-badge,.trade-rule-review,.tier-broker-title-art',head).forEach(x=>x.remove());
    $$('.trade-head-copy',head).forEach(x=>x.classList.remove('trade-head-copy'));
    copy.classList.add('trade-head-copy');
    const row=document.createElement('div');row.className='trade-head-title-row header-row-v16 portfolio-header-v44';
    copy.insertBefore(row,title);
    const holder=art||document.createElement('span');holder.classList.add('tier-broker-title-art','header-art-v16');row.appendChild(holder);
    row.appendChild(title);
    const badge=document.createElement('span');badge.className='trade-rule-badge header-rule-v16';row.appendChild(badge);
    const rules=document.createElement('button');rules.type='button';rules.className='trade-rule-review header-rules-v16';rules.textContent='RULES';rules.onclick=()=>{try{if(typeof showRulesForCurrentPortfolio==='function')showRulesForCurrentPortfolio();}catch(_){}};row.appendChild(rules);
    const sentinel=document.createElement('span');sentinel.className='trade-head-title-row header-row-sentinel-v16';sentinel.setAttribute('aria-hidden','true');row.appendChild(sentinel);
    updateRule(row);
  }finally{repairing=false;}
}
function schedule(ms=35){clearTimeout(timer);timer=setTimeout(repair,ms)}
function start(){repair();setTimeout(repair,120);setTimeout(repair,500);const obs=new MutationObserver(()=>schedule());obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
