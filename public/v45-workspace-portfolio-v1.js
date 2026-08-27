(()=>{
'use strict';
if(window.SBCWorkspacePortfolioV1)return;
const CATEGORY_BY_SESSION=Object.freeze({
  'WEEKLY PORTFOLIO':'weekly_qualifier',
  'WEEKLY QUALIFIER':'weekly_qualifier',
  'DAILY CHALLENGE':'full_day',
  'FULL DAY':'full_day',
  'MORNING MARKET':'morning',
  'MORNING':'morning',
  'AFTERNOON MARKET':'afternoon',
  'AFTERNOON':'afternoon',
  'DEGEN HOURS':'hourly',
  'DEGEN RACE TO THE CLOSE':'race_to_close'
});
const PRICE_LEVEL_BY_TIER=Object.freeze({free:'free',freeroll:'free',runner:'runner',clerk:'low',trader:'mid',junior:'high'});
function token(){const direct=['token','authToken','sbcToken','sessionToken'].map(k=>localStorage.getItem(k)).find(Boolean);if(direct)return direct;for(let i=0;i<localStorage.length;i++){const v=localStorage.getItem(localStorage.key(i))||'';if(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v))return v;}return'';}
async function api(path){const t=token();const r=await fetch(`/api${path}`,{headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})},cache:'no-store'});const out=await r.json().catch(()=>({}));if(!r.ok)throw new Error(out.error||`Request failed (${r.status})`);return out;}
function activeCtx(){try{return typeof activePortfolioContext!=='undefined'?activePortfolioContext:null}catch(_){return null}}
function localPortfolio(){try{return typeof currentPortfolio==='function'?currentPortfolio():null}catch(_){return null}}
function numeric(v){const n=Number(v);return Number.isInteger(n)&&n>0?n:null;}
function directCandidate(){const p=localPortfolio(),c=activeCtx();return numeric(p?.id)||numeric(p?.portfolioId)||numeric(c?.portfolioId)||numeric(c?.portfolio_id)||numeric(window.activePortfolioId);}
function normalize(s){return String(s||'').replace(/\s+/g,' ').trim().toUpperCase();}
function categoryFor(ctx){const explicit=String(ctx?.categoryId||ctx?.tierId||'').trim();if(['weekly_qualifier','full_day','morning','afternoon','hourly','race_to_close'].includes(explicit))return explicit;return CATEGORY_BY_SESSION[normalize(ctx?.session)]||null;}
function priceLevelFor(ctx){const explicit=String(ctx?.priceLevel||'').trim().toLowerCase();if(['free','runner','low','mid','high'].includes(explicit))return explicit;return PRICE_LEVEL_BY_TIER[String(ctx?.tier||'').trim().toLowerCase()]||null;}
function entryNumberFor(ctx){const n=Number(ctx?.entry);return Number.isInteger(n)&&n>0?n:1;}
function statusMatches(mode,status){status=String(status||'').toLowerCase();if(mode==='reserve')return status==='scheduled';if(mode==='live')return status==='open';return status==='open'||status==='scheduled';}
function entryMatches(label,n){return new RegExp(`\\(Entry\\s+${n}\\)\\s*$`,'i').test(String(label||''));}
function rankCandidates(list,ctx){const category=categoryFor(ctx),priceLevel=priceLevelFor(ctx),entry=entryNumberFor(ctx),mode=String(ctx?.mode||'').toLowerCase();if(!category||!priceLevel)return[];return (Array.isArray(list)?list:[]).filter(p=>{
  const c=p?.context||{};
  return String(c.type)==='satellite'&&String(c.tierId)===category&&String(c.priceLevel)===priceLevel&&statusMatches(mode,c.status)&&entryMatches(p?.label,entry);
}).sort((a,b)=>new Date(b?.context?.startsAt||0)-new Date(a?.context?.startsAt||0)||Number(b?.id||0)-Number(a?.id||0));}
async function ownedPortfolios(){const rows=await api('/portfolios');return Array.isArray(rows)?rows:[];}
async function resolvePortfolioId(options={}){const rows=Array.isArray(options.portfolios)?options.portfolios:await ownedPortfolios();const direct=directCandidate();if(direct&&rows.some(p=>numeric(p?.id)===direct))return direct;const matches=rankCandidates(rows,options.context||activeCtx());if(!matches.length)return null;const first=matches[0],second=matches[1];if(second&&new Date(first?.context?.startsAt||0).getTime()===new Date(second?.context?.startsAt||0).getTime())return null;return numeric(first.id);}
async function portfolioSnapshot(options={}){const id=await resolvePortfolioId(options);if(!id)throw new Error('This portfolio could not be identified from the active contest entry.');const p=await api(`/portfolios/${id}`);if(numeric(p?.id)!==id)throw new Error('Portfolio identity changed while loading the active contest entry.');return p;}
window.SBCWorkspacePortfolioV1=Object.freeze({resolvePortfolioId,portfolioSnapshot,ownedPortfolios,directCandidate,categoryFor,priceLevelFor,rankCandidates});
})();
