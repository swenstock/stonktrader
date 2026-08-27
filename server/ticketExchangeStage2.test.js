'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

async function frontendBehaviorTests() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'v45-ticket-market-v36.js'), 'utf8');
  const nodes = new Map();
  function makeClassList() {
    const s = new Set();
    return { add(...xs){xs.forEach(x=>s.add(x));}, remove(...xs){xs.forEach(x=>s.delete(x));}, contains(x){return s.has(x);} };
  }
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      id, textContent:'', innerHTML:'', value:'', dataset:{}, style:{}, isConnected:true,
      classList:makeClassList(), firstElementChild:null,
      setAttribute(){}, addEventListener(){}, appendChild(){}, prepend(){},
      querySelector(){return null;}, querySelectorAll(){return [];},
    });
    return nodes.get(id);
  };
  ['marketTicketTitle','summaryBid','summaryAsk','summaryLast','askBook','bidBook','recentTicketSales',
   'sellChoiceTitle','sellChoiceIntro','sellChoiceSummary','hitBidBtn','sellChoiceModal'].forEach(node);
  nodes.get('sellChoiceModal').firstElementChild = nodes.get('sellChoiceModal');

  let localWrites = 0;
  const storage = new Map([['token','aaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.ccc']]);
  const localStorage = {
    get length(){return storage.size;}, key(i){return [...storage.keys()][i]??null;},
    getItem(k){return storage.has(k)?storage.get(k):null;},
    setItem(k,v){localWrites++;storage.set(k,String(v));}, removeItem(k){storage.delete(k);},
  };
  const document = {
    readyState:'complete', documentElement:{},
    getElementById:id=>nodes.get(id)||null,
    querySelector(sel){ if(sel==='#view-exchange')return null; if(sel==='#marketTicketTitle')return nodes.get('marketTicketTitle'); return null; },
    querySelectorAll(){return [];}, addEventListener(){}, createElement(){return node(`created-${nodes.size}`);},
  };

  let fetchImpl = async()=>makeResponse({});
  const fetchCalls=[];
  const fetchFn=async(input,init={})=>{fetchCalls.push({input:String(input),init});return fetchImpl(input,init);};
  const alerts=[];
  const TICKET_MARKETS={Runner:{bids:[901],asks:[999],last:950}};
  const sandbox={
    console,document,localStorage,MutationObserver:class{observe(){}},setTimeout:()=>0,clearTimeout(){},
    alert:m=>alerts.push(String(m)),confirm:()=>true,prompt:()=>null,Headers:class{},CustomEvent:class{},
    activeTicketMarket:'Runner',TICKET_MARKETS,
    ticketOrder:{side:'SELL',name:'Runner',price:777,listingId:424242},
    ownedTicketContext:{name:'Runner',ticketId:424242},
    exchangeVisualHTML:()=>'<div class="book-tier-art"></div>',hydrateExchangeTierIcons(){},
  };
  sandbox.window=sandbox;sandbox.fetch=fetchFn;sandbox.window.fetch=fetchFn;
  sandbox.ticketMarket=sandbox.window.ticketMarket=()=>TICKET_MARKETS.Runner;
  sandbox.renderTicketMarket=sandbox.window.renderTicketMarket=()=>{};
  sandbox.openMarketSell=sandbox.window.openMarketSell=()=>sandbox.ownedTicketContext.ticketId;
  vm.createContext(sandbox); vm.runInContext(source,sandbox,{filename:'v45-ticket-market-v36.js'});
  const s1=sandbox.window.__SBC_TICKET_EXCHANGE_STAGE1_TEST;
  const s2=sandbox.window.__SBC_TICKET_EXCHANGE_STAGE2_TEST;
  assert(s1&&s2,'Stage 1 and Stage 2 real behavior hooks must both exist');

  fetchImpl=async input=>{
    assert(String(input).includes('/api/ticket-market/book/runner'));
    return makeResponse({ticketType:'runner',highestBid:733,lowestAsk:null,
      bids:[{id:77,side:'bid',ticketType:'runner',bidPrice:733,isMine:false,buyerDisplayName:'Account B'}],offers:[]});
  };
  await s1.fetchRealBook('runner');

  sandbox.ownedTicketContext={name:'Runner',ticketId:424242};
  const pending=s2.prepareSpecificBid(999999,77);
  assert(pending,'cached real bid should prepare an accept flow');
  assert.strictEqual(Number(pending.bid.id),77);
  assert.strictEqual(Number(pending.bid.bidPrice),733);
  assert(nodes.get('sellChoiceSummary').innerHTML.includes('733 STONK'),'confirmation must display cached real bid price');
  assert(!nodes.get('sellChoiceSummary').innerHTML.includes('999,999'),'caller/display price must not define the bid');

  let acceptBody=null;
  fetchImpl=async(input,init)=>{
    if(String(input).includes('/bids/77/sell')){acceptBody=JSON.parse(init.body);return makeResponse({ok:true,ticketId:424242,ticketType:'runner',soldFor:733,sellerReceived:733,platformFee:0});}
    if(String(input).includes('/book/runner')) return makeResponse({ticketType:'runner',highestBid:null,lowestAsk:null,bids:[],offers:[]});
    return makeResponse({});
  };
  const callsBeforeAccept=fetchCalls.length;
  await s2.realHitBestBid();
  const acceptCalls=fetchCalls.slice(callsBeforeAccept).filter(c=>c.input.includes('/bids/77/sell'));
  assert.strictEqual(acceptCalls.length,1,'accept must issue exactly one sell-to-bid POST using cached real bid ID');
  assert.deepStrictEqual(acceptBody,{ticketId:424242},'accept must send exact real owned ticket ID');
  const firstPostOffset=fetchCalls.slice(callsBeforeAccept).findIndex(c=>c.input.includes('/bids/77/sell'));
  const prePostBookCalls=fetchCalls.slice(callsBeforeAccept,callsBeforeAccept+firstPostOffset).filter(c=>c.input.includes('/book/')).length;
  assert.strictEqual(prePostBookCalls,0,'Stage 2 must not fetch a book to discover the bid before accepting it');
  assert(nodes.get('sellChoiceSummary').innerHTML.includes('✓'),'success may appear only after confirmed backend response');

  fetchImpl=async()=>makeResponse({ticketType:'runner',highestBid:733,lowestAsk:null,bids:[{id:77,side:'bid',ticketType:'runner',bidPrice:733,isMine:false}],offers:[]});
  await s1.fetchRealBook('runner');
  sandbox.ownedTicketContext={name:'Runner',ticketId:424242};
  s2.prepareSpecificBid(733,77);
  const summaryBeforeFailure=nodes.get('sellChoiceSummary').innerHTML;
  const writesBeforeFailure=localWrites;
  fetchImpl=async()=>makeResponse({error:'forced accept failure'},false,500);
  await assert.rejects(()=>s2.realHitBestBid(),/forced accept failure/);
  assert.strictEqual(nodes.get('sellChoiceSummary').innerHTML,summaryBeforeFailure,'failed accept must not append success UI');
  assert.strictEqual(localWrites,writesBeforeFailure,'failed accept must not create local order/fill state');

  sandbox.ownedTicketContext={name:'Runner',ticketId:424242};
  const hitBidButton={id:'',textContent:'SELL TO BID',dataset:{sbcBidId:'77',sbcBidPrice:'733'},classList:{contains:x=>x==='hit-bid'},
    closest(sel){return sel==='button'?hitBidButton:null;}};
  let p1=false,s1p=false,i1=false;
  s2.captureNativeOrder({target:{closest:sel=>sel==='button'?hitBidButton:null},preventDefault(){p1=true;},stopPropagation(){s1p=true;},stopImmediatePropagation(){i1=true;}});
  assert(p1&&s1p&&i1,'displayed SELL TO BID capture must block inline placeholder handler');

  const modal=nodes.get('sellChoiceModal'); modal.id='sellChoiceModal';
  const confirmButton={id:'hitBidBtn',textContent:'ACCEPT 733 STONK BID',dataset:{},classList:{contains:()=>false},
    closest(sel){if(sel==='button')return confirmButton;if(sel.includes('#sellChoiceModal'))return modal;return null;}};
  let p2=false,s2p=false,i2=false;
  s2.captureNativeOrder({target:{closest:sel=>sel==='button'?confirmButton:null},preventDefault(){p2=true;},stopPropagation(){s2p=true;},stopImmediatePropagation(){i2=true;}});
  assert(p2&&s2p&&i2,'accept confirmation capture must block exact-shell fake-success hitBestBid');

  sandbox.ownedTicketContext={name:'Runner',ticketId:'OWNED-RUN'};
  assert.strictEqual(s2.realOwnedTicketId(),null,'synthetic shell ticket IDs must never be posted to the backend');

  console.log('Ticket Exchange Stage 2 frontend: PASS');
  console.log('cached bid id=77 @ 733; ticketId=424242; no pre-accept book fetch; failed accept=no premature success');
}

async function backendBehaviorTests(){
  const express=require('express');
  const dbPath='/tmp/sbc-ticket-exchange-stage2.db';
  try{fs.unlinkSync(dbPath);}catch(_){}
  process.env.DB_PATH=dbPath;
  process.env.SESSION_SECRET='ticket-exchange-stage2-secret';

  const db=require('./db'); require('./schemaV45').run();
  const {sign}=require('./auth'); const router=require('./routes/ticketMarket');
  const mkAccount=(email,display,code,balance)=>{
    const userId=Number(db.prepare('INSERT INTO users(email,password_hash,display_name,referral_code) VALUES(?,?,?,?)').run(email,'x:y',display,code).lastInsertRowid);
    const accountId=Number(db.prepare('INSERT INTO accounts(user_id,stonk_balance) VALUES(?,?)').run(userId,balance).lastInsertRowid);
    return {userId,accountId,token:sign({userId})};
  };
  const A=mkAccount('stage2-a@test','Account A','STAGE2A',5000);
  const B=mkAccount('stage2-b@test','Account B','STAGE2B',5000);
  const runnerId=Number(db.prepare("INSERT INTO tickets(account_id,value_stonk,status,ticket_type,backing_stonk) VALUES(?,85,'unredeemed','runner',85)").run(A.accountId).lastInsertRowid);
  const clerkId=Number(db.prepare("INSERT INTO tickets(account_id,value_stonk,status,ticket_type,backing_stonk) VALUES(?,390,'unredeemed','clerk',390)").run(A.accountId).lastInsertRowid);

  const app=express();app.use(express.json());app.use('/api/ticket-market',router);
  const server=app.listen(0,'127.0.0.1'); await new Promise((resolve,reject)=>{if(server.listening)return resolve();server.once('listening',resolve);server.once('error',reject);});
  const call=async(path,token,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/ticket-market${path}`,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {r,d:await r.json()};};
  try{
    const listed=await call('/offers',A.token,'POST',{ticketId:runnerId,askPrice:1200});
    assert.strictEqual(listed.r.status,200,JSON.stringify(listed.d));
    const listingId=Number(listed.d.id);
    const bid=await call('/bids',B.token,'POST',{ticketType:'runner',bidPrice:1000});
    assert.strictEqual(bid.r.status,200,JSON.stringify(bid.d));
    const bidId=Number(bid.d.id);
    const aBalanceBefore=Number(db.prepare('SELECT stonk_balance FROM accounts WHERE id=?').get(A.accountId).stonk_balance);

    const sold=await call(`/bids/${bidId}/sell`,A.token,'POST',{ticketId:runnerId});
    assert.strictEqual(sold.r.status,200,JSON.stringify(sold.d));
    assert.strictEqual(sold.d.soldFor,1000); assert.strictEqual(sold.d.platformFee,50); assert.strictEqual(sold.d.sellerReceived,950);
    const ticket=db.prepare('SELECT * FROM tickets WHERE id=?').get(runnerId);
    const bidRow=db.prepare('SELECT * FROM ticket_bids WHERE id=?').get(bidId);
    const listing=db.prepare('SELECT * FROM ticket_listings WHERE id=?').get(listingId);
    const aBalanceAfter=Number(db.prepare('SELECT stonk_balance FROM accounts WHERE id=?').get(A.accountId).stonk_balance);
    assert.strictEqual(ticket.account_id,B.accountId,'runner ticket must transfer to distinct Account B');
    assert.strictEqual(ticket.status,'unredeemed');
    assert.strictEqual(bidRow.status,'filled');
    assert.strictEqual(Number(bidRow.filled_ticket_id),runnerId);
    assert.strictEqual(listing.status,'cancelled','same-ticket active listing must be atomically cancelled');
    assert.strictEqual(aBalanceAfter-aBalanceBefore,950,'seller balance must rise by bid minus canonical 5% fee');

    const bid2=await call('/bids',B.token,'POST',{ticketType:'runner',bidPrice:700});
    assert.strictEqual(bid2.r.status,200,JSON.stringify(bid2.d));
    const wrong=await call(`/bids/${bid2.d.id}/sell`,A.token,'POST',{ticketId:clerkId});
    assert.strictEqual(wrong.r.status,400); assert.match(wrong.d.error,/runner ticket/i);
    assert.strictEqual(db.prepare('SELECT status FROM ticket_bids WHERE id=?').get(bid2.d.id).status,'active');
    const clerk=db.prepare('SELECT account_id,status FROM tickets WHERE id=?').get(clerkId);
    assert.strictEqual(clerk.account_id,A.accountId); assert.strictEqual(clerk.status,'unredeemed');

    console.log('Ticket Exchange Stage 2 backend: PASS');
    console.log(`A sold listed Runner ticket ${runnerId} to distinct B bid ${bidId}: 1000 gross / 950 seller / 50 fee; listing ${listingId}=cancelled; wrong Clerk->Runner bid rejected`);
  } finally { await new Promise(resolve=>server.close(resolve)); }
}

(async()=>{await frontendBehaviorTests();await backendBehaviorTests();})().catch(err=>{console.error(err);process.exitCode=1;});
