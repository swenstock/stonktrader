const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../public/v45-workspace-portfolio-v1.js'),'utf8');

(async()=>{
  const store=new Map([['authToken','wrong.parallel.token']]);
  const calls=[];
  const realToken='eyJ1c2VySWQiOjc3fQ.realSbcSignature';
  const portfolios=[{id:77,label:'Full Day — Clerk (Entry 2)',context:{type:'satellite',tierId:'full_day',priceLevel:'low',status:'open',startsAt:'2026-08-27T13:30:00Z'}}];
  const storage={
    get length(){return store.size},
    key:i=>[...store.keys()][i]||null,
    getItem:k=>store.has(k)?store.get(k):null,
    setItem:(k,v)=>store.set(k,String(v)),
    removeItem:k=>store.delete(k)
  };
  const sandbox={
    window:{dispatchEvent(){}},
    localStorage:storage,
    activePortfolioContext:{session:'DAILY CHALLENGE',tier:'clerk',mode:'live',entry:2},
    currentPortfolio:()=>({starting:100000,holdings:{}}),
    CustomEvent:function(type,init){this.type=type;this.detail=init?.detail},
    fetch:async(url,opts={})=>{
      calls.push({url,opts});
      if(url==='/api/auth/login'){
        assert.strictEqual(opts.method,'POST');
        assert.deepStrictEqual(JSON.parse(opts.body),{email:'trader@example.com',password:'password123'});
        return{ok:true,status:200,json:async()=>({token:realToken,displayName:'Trader'})};
      }
      if(url==='/api/portfolios'){
        assert.strictEqual(opts.headers.Authorization,`Bearer ${realToken}`,'portfolio request must reuse exact token returned by real auth endpoint');
        return{ok:true,status:200,json:async()=>portfolios};
      }
      throw new Error(`unexpected fetch ${url}`);
    },
    console,Promise,Number,String,Object,Array,Map,Set,Date,RegExp
  };
  sandbox.window.window=sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(src,sandbox);
  const api=sandbox.window.SBCWorkspacePortfolioV1;

  assert.strictEqual(api.token(),'','workspace must not guess alternate token keys; the exact app session key is token');
  const token=await api.authenticate({email:'trader@example.com',password:'password123',mode:'login'});
  assert.strictEqual(token,realToken);
  assert.strictEqual(storage.getItem('token'),realToken,'real login token must be persisted under the existing app session key');
  assert.strictEqual(storage.getItem('displayName'),'Trader');

  const rows=await api.ownedPortfolios();
  assert.strictEqual(rows.length,1);
  assert.strictEqual(rows[0].id,77);
  assert.deepStrictEqual(calls.map(x=>x.url),['/api/auth/login','/api/portfolios']);

  console.log('Workspace Consolidation Stage B.1 — Auth Handoff: PASS');
  console.log('Real auth contract: POST /api/auth/login -> localStorage.token -> Authorization: Bearer <returned token> on GET /api/portfolios; alternate token guessing is disabled.');
})().catch(e=>{console.error(e);process.exit(1)});
