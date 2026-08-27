const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../public/v45-workspace-portfolio-v1.js'),'utf8');

function makeRuntime({ctx,localPortfolio,activeId=null,portfolios,snapshot}){
  const store=new Map([['token','test.token']]);
  const calls=[];
  const localStorage={get length(){return store.size;},getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),key:i=>[...store.keys()][i]||null};
  const sandbox={
    window:{activePortfolioId:activeId},localStorage,
    activePortfolioContext:ctx,currentPortfolio:()=>localPortfolio,
    fetch:async(url)=>{calls.push(url);let body,status=200;if(url==='/api/portfolios')body=portfolios;else if(/^\/api\/portfolios\/\d+$/.test(url)){const id=Number(url.split('/').pop());body=id===snapshot.id?snapshot:{error:'Portfolio not found'};if(id!==snapshot.id)status=404;}else{body={error:'unexpected'};status=404;}return{ok:status<400,status,json:async()=>body};},
    console,setTimeout,clearTimeout,RegExp,Date,Number,String,Object,Array,Map,Set,Promise
  };
  sandbox.window.window=sandbox.window;
  vm.createContext(sandbox);vm.runInContext(src,sandbox);
  return{api:sandbox.window.SBCWorkspacePortfolioV1,calls};
}

(async()=>{
  const real={id:77,label:'Full Day — Clerk (Entry 2)',context:{type:'satellite',tierId:'full_day',priceLevel:'low',status:'open',startsAt:'2026-08-27T13:30:00Z'}};
  const older={id:66,label:'Full Day — Clerk (Entry 2)',context:{type:'satellite',tierId:'full_day',priceLevel:'low',status:'resolved',startsAt:'2026-08-26T13:30:00Z'}};
  const other={id:88,label:'Full Day — Trader (Entry 1)',context:{type:'satellite',tierId:'full_day',priceLevel:'mid',status:'open',startsAt:'2026-08-27T13:30:00Z'}};
  const portfolios=[other,older,real];
  const snapshot={...real,cash:50000,positions:[{symbol:'NVDA',quantity:170.86}]};
  const ctx={session:'DAILY CHALLENGE',tier:'clerk',mode:'live',entry:2};

  const fromMy=makeRuntime({ctx,localPortfolio:{starting:100000,holdings:{}},portfolios,snapshot});
  assert.strictEqual(await fromMy.api.resolvePortfolioId(),77,'My Contests context must resolve the real owned portfolio');
  assert.deepStrictEqual(await fromMy.api.portfolioSnapshot(),snapshot,'snapshot must be fetched from the resolved backend portfolio');

  const fromBlotter=makeRuntime({ctx,localPortfolio:{portfolioId:77},portfolios,snapshot});
  assert.strictEqual(await fromBlotter.api.resolvePortfolioId(),77,'existing blotter-style portfolioId hint must resolve to same owned portfolio');

  const fromCtx=makeRuntime({ctx:{...ctx,portfolio_id:77},localPortfolio:{},portfolios,snapshot});
  assert.strictEqual(await fromCtx.api.resolvePortfolioId(),77,'context portfolio_id must resolve to same owned portfolio');

  const fromWindow=makeRuntime({ctx,localPortfolio:{},activeId:77,portfolios,snapshot});
  assert.strictEqual(await fromWindow.api.resolvePortfolioId(),77,'window activePortfolioId must resolve to same owned portfolio');

  const unownedHint=makeRuntime({ctx,localPortfolio:{portfolioId:999},portfolios,snapshot});
  assert.strictEqual(await unownedHint.api.resolvePortfolioId(),77,'unowned/stale direct hint must fall back to active entry mapping');

  const reserveRows=[{id:91,label:'Degen Race to the Close — Runner (Entry 1)',context:{type:'satellite',tierId:'race_to_close',priceLevel:'runner',status:'scheduled',startsAt:'2026-08-27T21:30:00Z'}}];
  const reserve=makeRuntime({ctx:{session:'DEGEN RACE TO THE CLOSE',tier:'runner',mode:'reserve',entry:1},localPortfolio:{},portfolios:reserveRows,snapshot:{...reserveRows[0],positions:[]}});
  assert.strictEqual(await reserve.api.resolvePortfolioId(),91,'reserve context must resolve scheduled backend portfolio');

  console.log('Workspace Consolidation Stage A: PASS');
  console.log('My Contests, blotter hint, context hint, and window hint all resolved portfolio 77; stale unowned hint fell back safely; reserve resolved portfolio 91.');
})().catch(e=>{console.error(e);process.exit(1)});
