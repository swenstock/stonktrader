const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');

const workspaceSrc=fs.readFileSync(path.join(__dirname,'../public/v45-workspace-portfolio-v1.js'),'utf8');
const desktopSrc=fs.readFileSync(path.join(__dirname,'../public/v45-desktop-trading-v45.js'),'utf8');

function between(start,next){
  const a=desktopSrc.indexOf(start),b=desktopSrc.indexOf(next,a);
  assert(a>=0&&b>a,`production function not found: ${start}`);
  return desktopSrc.slice(a,b);
}
const sellSrc=[
  between('async function realSellAllSnapshot()','function sellAllPositions'),
  between('function sellAllPositions','async function submitSellAllOrdersV46'),
  between('async function submitSellAllOrdersV46','async function openSellAll')
].join('\n');

(async()=>{
  const store=new Map([['token','stage.b.token']]);
  const calls=[],submitted=[];
  let legacyIdentityCalls=0;
  const portfolio={id:77,label:'Full Day — Clerk (Entry 2)',context:{type:'satellite',tierId:'full_day',priceLevel:'low',status:'open',startsAt:'2026-08-27T13:30:00Z'}};
  const snapshot={...portfolio,cash:70000,positions:[{symbol:'NVDA',quantity:170.86},{symbol:'BA',quantity:9},{symbol:'VZ',quantity:0}]};
  const orders={
    portfolioId(){legacyIdentityCalls++;return null;},
    async portfolioSnapshot(){legacyIdentityCalls++;throw new Error('legacy resolver must not run');},
    async submitOrder(body){submitted.push(body);return{id:submitted.length,...body};}
  };
  const sandbox={
    window:{SBCAdvancedOrdersV15:orders},
    localStorage:{get length(){return store.size},getItem:k=>store.get(k)||null,key:i=>[...store.keys()][i]||null},
    activePortfolioContext:{session:'DAILY CHALLENGE',tier:'clerk',mode:'live',entry:2},
    currentPortfolio:()=>({starting:100000,holdings:{}}),
    fetch:async url=>{calls.push(url);let body,status=200;if(url==='/api/portfolios')body=[portfolio];else if(url==='/api/portfolios/77')body=snapshot;else{body={error:'unexpected'};status=404}return{ok:status<400,status,json:async()=>body}},
    console,setTimeout,clearTimeout,RegExp,Date,Number,String,Object,Array,Map,Set,Promise
  };
  sandbox.window.window=sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(workspaceSrc,sandbox);
  vm.runInContext(`${sellSrc}\nwindow.__stageB={realSellAllSnapshot,sellAllPositions,submitSellAllOrdersV46};`,sandbox);
  const api=sandbox.window.__stageB;

  const loaded=await api.realSellAllSnapshot();
  assert.strictEqual(loaded.id,77,'Sell All must resolve the real My Contests portfolio through Stage A');
  assert.deepStrictEqual(calls,['/api/portfolios','/api/portfolios/77'],'Sell All must make the owned-list then resolved-snapshot backend reads');
  assert.strictEqual(legacyIdentityCalls,0,'legacy AdvancedOrders identity helpers must not be consulted');
  assert.strictEqual(api.sellAllPositions(loaded).length,2,'only real positive backend positions are sellable');

  const result=await api.submitSellAllOrdersV46(orders,loaded);
  assert.strictEqual(result.accepted.length,2);
  assert.strictEqual(result.failed.length,0);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(submitted)),[
    {portfolioId:77,symbol:'NVDA',side:'sell',orderType:'market',quantity:170.86},
    {portfolioId:77,symbol:'BA',side:'sell',orderType:'market',quantity:9}
  ],'Sell All must submit the exact backend portfolio ID and exact backend position quantities');

  console.log('Workspace Consolidation Stage B — Sell All: PASS');
  console.log('No numeric hint -> GET /api/portfolios -> GET /api/portfolios/77 -> exact NVDA/BA market sell bodies; legacy identity calls = 0.');
})().catch(e=>{console.error(e);process.exit(1)});
