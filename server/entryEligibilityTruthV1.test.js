'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const src=fs.readFileSync(path.join(__dirname,'../public/v45-backend-authority-v1.js'),'utf8');

(async()=>{
  const calls=[];
  const notices=[];
  let legacyBegins=0;
  const store=new Map([['token','real-token']]);
  const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
  const document={
    getElementById(){return null;},
    querySelector(){return null;},
    querySelectorAll(){return[];}
  };
  const satellites={categories:[
    {id:'weekly_qualifier',levels:[{id:501,tierId:'weekly_qualifier',priceLevel:'free',priceLevelName:'Freeroll',entryFee:0,status:'open',joined:false,maxEntriesPerAccount:1}]},
    {id:'hourly',levels:[{id:601,tierId:'hourly',priceLevel:'low',priceLevelName:'Clerk',entryFee:200,status:'open',joined:false,maxEntriesPerAccount:null}]}
  ]};
  const account={stonkBalance:0};
  const tickets={inventory:{runner:{available:0},clerk:{available:0},trader:{available:0},junior:{available:0}}};
  const sandbox={console,document,localStorage,alert:m=>notices.push(String(m)),setTimeout:fn=>fn(),Promise,Number,String,Object,Array,Map,Set,Date,RegExp,JSON,Math};
  sandbox.window=sandbox;
  sandbox.SBCTradeConfirmV42={show:x=>notices.push(`${x.title}|${x.detail}`)};
  sandbox.confirmRulesGate=()=>{};
  sandbox.beginPortfolioFlow=function(){legacyBegins++;return 'legacy-opened';};
  sandbox.showView=()=>{};
  sandbox.fetch=async(url,opts={})=>{
    calls.push({url,method:opts.method||'GET'});
    assert.strictEqual(opts.headers.Authorization,'Bearer real-token');
    const body=url==='/api/satellites'?satellites:url==='/api/account'?account:url==='/api/tickets'?tickets:null;
    if(body)return{ok:true,status:200,json:async()=>body};
    throw new Error(`Unexpected ${url}`);
  };
  vm.createContext(sandbox);
  vm.runInContext(src,sandbox,{filename:'v45-backend-authority-v1.js'});
  const api=sandbox.SBCBackendAuthorityV1;
  assert(api,'backend authority must install');

  const free=await api.entryEligibility({session:'WEEKLY PORTFOLIO',tier:'freeroll'});
  assert.strictEqual(free.isFreeroll,true);
  assert.strictEqual(free.entryFee,0);
  assert.strictEqual(free.balance,0);
  assert.strictEqual(free.canFund,true,'zero-balance authenticated user must be eligible for Free Roll');
  assert.match(free.message,/FREE ROLL.*0 STONK/i);

  const freeOpen=await sandbox.beginPortfolioFlow('WEEKLY PORTFOLIO','freeroll','live','floor',1);
  assert.strictEqual(freeOpen,'legacy-opened');
  assert.strictEqual(legacyBegins,1,'Free Roll must continue into the existing Rules flow');

  const clerk=await api.entryEligibility({session:'DEGEN HOURS',tier:'clerk'});
  assert.strictEqual(clerk.isFreeroll,false);
  assert.strictEqual(clerk.entryFee,200);
  assert.strictEqual(clerk.canFund,false);
  assert.match(clerk.message,/CLERK TICKET OR 200 STONK REQUIRED/i);
  assert.match(clerk.message,/YOUR BALANCE: 0 STONK/i);

  const blocked=await sandbox.beginPortfolioFlow('DEGEN HOURS','clerk','live','floor',1);
  assert.strictEqual(blocked,false);
  assert.strictEqual(legacyBegins,1,'unfunded paid tier must be stopped before the Rules flow');
  assert(notices.some(x=>/ENTRY NOT AVAILABLE.*CLERK TICKET OR 200 STONK REQUIRED/i.test(x)),'paid-tier block must explain exact requirement');

  assert(calls.filter(x=>x.url==='/api/account').length>=4,'preflight must use real account balance, not browser demo state');
  assert(calls.filter(x=>x.url==='/api/tickets').length>=4,'preflight must use real ticket inventory, not browser demo state');
  console.log('Entry Eligibility Truth V1: PASS');
  console.log('Zero-balance Free Roll proceeds; zero-balance Clerk is blocked before Rules with exact ticket/STONK requirement.');
})().catch(e=>{console.error(e);process.exit(1)});
