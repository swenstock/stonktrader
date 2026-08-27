const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../public/v45-backend-authority-v1.js'),'utf8');

(async()=>{
  const store=new Map([['token','real-session-token']]);
  const calls=[];
  const root={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  const rules={classList:{remove(){}}};
  const document={
    getElementById(id){if(id==='myContestList')return root;if(id==='rulesGate')return rules;return null;},
    querySelector(){return null;},
    querySelectorAll(){return[];}
  };
  const portfolios=[{id:77,label:'Weekly Qualifier Free (Entry 1)',cash:85000,totalValue:101250,pl:1250,positionCount:1,context:{type:'satellite',tierId:'weekly_qualifier',priceLevel:'free',status:'open',startsAt:'2026-08-24T13:30:00Z'}}];
  const snapshot={id:77,label:'Weekly Qualifier Free (Entry 1)',cash:85000,totalValue:101250,pl:1250,positions:[{symbol:'NVDA',quantity:12.5,avgCost:100,price:130,value:1625,unrealizedPL:375}],context:portfolios[0].context};
  const satellites={categories:[{id:'weekly_qualifier',name:'Weekly Qualifier',levels:[{id:501,tierId:'weekly_qualifier',priceLevel:'free',status:'open',joined:false,myEntryCount:0,maxEntriesPerAccount:1,myPortfolioId:null}]}]};
  const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
  const sandbox={
    window:{},document,localStorage,console,alert(){},setTimeout(fn){fn();},
    myTab:'live',activePortfolioContext:null,pendingPortfolioContext:null,portfolioReturnView:'tier',tradeSide:'sell',tradeInputMode:'percent',selectedTradePercent:25,quickTradePercent:100,
    PORTFOLIOS:{},portfolioKey:ctx=>`${ctx.session}|${ctx.tier}|${ctx.entry}|${ctx.mode}`,
    renderPortfolioCalls:0,showViewCalls:[],renderPortfolio(){sandbox.renderPortfolioCalls++;},showView(name){sandbox.showViewCalls.push(name);},
    confirmRulesGate(){throw new Error('legacy confirm must not run for real floor/tier entry');},
    fetch:async(url,opts={})=>{
      calls.push({url,method:opts.method||'GET',body:opts.body,auth:opts.headers?.Authorization});
      assert.strictEqual(opts.headers?.Authorization,'Bearer real-session-token');
      if(url==='/api/satellites')return ok(satellites);
      if(url==='/api/satellites/501/enter'){
        assert.strictEqual(opts.method,'POST');
        return ok({ok:true,portfolioId:77});
      }
      if(url==='/api/portfolios')return ok(portfolios);
      if(url==='/api/portfolios/77')return ok(snapshot);
      throw new Error('Unexpected '+url);
    },
    Promise,Number,String,Object,Array,Map,Set,Date,RegExp,JSON,Math
  };
  sandbox.window.window=sandbox.window;
  function ok(body){return{ok:true,status:200,json:async()=>body};}
  vm.createContext(sandbox);
  vm.runInContext(src,sandbox);
  const api=sandbox.window.SBCBackendAuthorityV1;
  assert(api,'backend authority module must install');

  // No MC_LIVE / MC_ARCHIVE globals are defined in this sandbox. Rendering must still work.
  await api.renderMyContestsReal();
  assert(root.innerHTML.includes('Weekly Qualifier Free (Entry 1)'));
  assert(root.innerHTML.includes('REAL BACKEND PORTFOLIO #77'));
  assert(!root.innerHTML.includes('WEEKLY PORTFOLIO'), 'static demo portfolio must not be injected');

  sandbox.pendingPortfolioContext={session:'WEEKLY PORTFOLIO',tier:'freeroll',mode:'live',returnView:'tier',entry:1,degen:false,race:false};
  await sandbox.window.confirmRulesGate();
  assert.strictEqual(sandbox.activePortfolioContext.portfolioId,77);
  assert.strictEqual(sandbox.activePortfolioContext.portfolio_id,77);
  assert.strictEqual(sandbox.window.activePortfolioId,77);
  assert.strictEqual(sandbox.pendingPortfolioContext,null);
  const key='WEEKLY PORTFOLIO|free|1|live';
  assert.strictEqual(sandbox.PORTFOLIOS[key].portfolioId,77);
  assert.strictEqual(sandbox.PORTFOLIOS[key].holdings.NVDA.shares,12.5);
  assert.strictEqual(sandbox.PORTFOLIOS[key].holdings.NVDA.avg,100);
  assert(sandbox.showViewCalls.includes('portfolio'));

  assert.deepStrictEqual(calls.map(x=>`${x.method} ${x.url}`),[
    'GET /api/portfolios',
    'GET /api/satellites',
    'POST /api/satellites/501/enter',
    'GET /api/portfolios/77'
  ]);
  console.log('Workspace Backend Authority V1: PASS');
  console.log('No demo ownership globals -> GET real portfolios; rules confirm -> real satellite enter -> backend portfolio 77 -> exact context ID + local display hydration.');
})().catch(e=>{console.error(e);process.exit(1)});
