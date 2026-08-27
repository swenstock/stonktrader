'use strict';
const assert = require('assert');
const { seedPrototypeAccount, PROTOTYPE_EMAIL } = require('./seedPrototypeAccount');

function response(status, body){return {ok:status>=200&&status<300,status,async json(){return body;}};}

async function run(){
  const state={user:false,portfolio:null,entryPosts:0};
  const calls=[];
  const fetchImpl=async (url,opts={})=>{
    const path=new URL(url).pathname;
    calls.push({path,method:opts.method||'GET',auth:opts.headers?.Authorization||null});
    if(path==='/api/auth/signup'){
      if(state.user)return response(409,{error:'Email already registered'});
      state.user=true; return response(200,{token:'seed-token'});
    }
    if(path==='/api/auth/login')return response(200,{token:'seed-token'});
    if(path==='/api/portfolios'){
      const body=state.portfolio?[{id:state.portfolio,context:{type:'satellite',tierId:'weekly_qualifier',priceLevel:'free'}}]:[];
      return response(200,body);
    }
    if(path==='/api/satellites')return response(200,{categories:[{id:'weekly_qualifier',levels:[{id:501,priceLevel:'free',status:'open'}]}]});
    if(path==='/api/satellites/501/enter'){
      state.entryPosts++; state.portfolio=77; return response(200,{ok:true,portfolioId:77});
    }
    throw new Error(`unexpected ${path}`);
  };

  const first=await seedPrototypeAccount({baseUrl:'http://127.0.0.1:3000',fetchImpl});
  assert.deepStrictEqual(first,{createdUser:true,createdEntry:true,portfolioId:77,email:PROTOTYPE_EMAIL});
  assert.strictEqual(state.entryPosts,1,'first boot must create one real entry');
  assert(calls.some(c=>c.path==='/api/auth/signup'&&c.method==='POST'));
  assert(calls.some(c=>c.path==='/api/satellites/501/enter'&&c.method==='POST'&&c.auth==='Bearer seed-token'));

  calls.length=0;
  const second=await seedPrototypeAccount({baseUrl:'http://127.0.0.1:3000',fetchImpl});
  assert.deepStrictEqual(second,{createdUser:false,createdEntry:false,portfolioId:77,email:PROTOTYPE_EMAIL});
  assert.strictEqual(state.entryPosts,1,'second boot in same db lifetime must not duplicate entry');
  assert(calls.some(c=>c.path==='/api/auth/login'&&c.method==='POST'),'existing prototype user must use real login route');
  assert(!calls.some(c=>c.path==='/api/satellites/501/enter'),'existing real weekly portfolio must prevent duplicate entry');

  console.log('Prototype Account Seed V1: PASS — real signup/login + real weekly entry route, real portfolio id, restart idempotency.');
}
run().catch(e=>{console.error(e);process.exit(1);});
