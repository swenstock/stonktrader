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
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      id, textContent: '', innerHTML: '', value: '', dataset: {}, isConnected: true,
      classList: { add() {}, remove() {}, contains() { return false; } },
      setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    });
    return nodes.get(id);
  };
  ['marketTicketTitle','summaryBid','summaryAsk','summaryLast','askBook','bidBook','recentTicketSales'].forEach(node);

  let localWrites = 0;
  const storage = new Map([['token', 'aaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.ccc']]);
  const localStorage = {
    get length() { return storage.size; },
    key(i) { return [...storage.keys()][i] ?? null; },
    getItem(k) { return storage.has(k) ? storage.get(k) : null; },
    setItem(k,v) { localWrites += 1; storage.set(k,String(v)); },
    removeItem(k) { storage.delete(k); },
  };

  const document = {
    readyState: 'complete', documentElement: {},
    getElementById: id => nodes.get(id) || null,
    querySelector(sel) {
      if (sel === '#view-exchange') return null;
      if (sel === '#marketTicketTitle') return nodes.get('marketTicketTitle');
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement() { return node(`created-${nodes.size}`); },
  };

  let fetchImpl = async () => makeResponse({});
  const fetchCalls = [];
  const fetchFn = async (input, init = {}) => {
    fetchCalls.push({ input: String(input), init });
    return fetchImpl(input, init);
  };
  let fallbackRenders = 0;
  const TICKET_MARKETS = { Runner: { bids:[901], asks:[999], last:950 } };
  const sandbox = {
    console, document, localStorage, MutationObserver: class { observe() {} },
    setTimeout: () => 0, clearTimeout() {}, alert() {}, confirm: () => true, prompt: () => null,
    Headers: class {}, CustomEvent: class {},
    activeTicketMarket: 'Runner',
    TICKET_MARKETS,
    ticketOrder: { side:'SELL', name:'Runner', price:777, listingId: 424242 },
    ownedTicketContext: { name:'Runner', ticketId: 424242 },
    exchangeVisualHTML: () => '<div class="book-tier-art"></div>',
    hydrateExchangeTierIcons() {},
  };
  sandbox.window = sandbox;
  sandbox.fetch = fetchFn;
  sandbox.window.fetch = fetchFn;
  sandbox.ticketMarket = sandbox.window.ticketMarket = () => TICKET_MARKETS.Runner;
  sandbox.renderTicketMarket = sandbox.window.renderTicketMarket = () => { fallbackRenders += 1; };
  sandbox.openMarketSell = sandbox.window.openMarketSell = () => sandbox.ownedTicketContext.ticketId;

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'v45-ticket-market-v36.js' });
  const stage = sandbox.window.__SBC_TICKET_EXCHANGE_STAGE1_TEST;
  assert(stage, 'Stage 1 browser behavior hooks must be available');

  // Acceptance 1: real backend book is primary; static book is fallback only on fetch failure.
  fetchImpl = async input => {
    assert(String(input).includes('/api/ticket-market/book/runner'));
    return makeResponse({
      ticketType:'runner', highestBid:733, lowestAsk:777,
      bids:[{id:1,side:'bid',ticketType:'runner',bidPrice:733,buyerDisplayName:'Account B'}],
      offers:[{id:2,side:'offer',ticketType:'runner',ticketId:424242,askPrice:777,sellerDisplayName:'Account A'}],
    });
  };
  await sandbox.window.renderTicketMarket();
  assert.strictEqual(fallbackRenders, 0, 'successful real book fetch must not render TICKET_MARKETS fallback');
  assert(nodes.get('bidBook').innerHTML.includes('733 STONK'), 'rendered bid book must reflect backend bid');
  assert(nodes.get('askBook').innerHTML.includes('777 STONK'), 'rendered ask book must reflect backend ask');
  assert(!nodes.get('askBook').innerHTML.includes('999 STONK'), 'static fallback ask must not be primary');

  fetchImpl = async () => makeResponse({error:'offline'}, false, 503);
  await sandbox.window.renderTicketMarket();
  assert.strictEqual(fallbackRenders, 1, 'failed real book fetch must invoke existing fallback renderer exactly once');

  // Acceptance 3: the exact owned ticket ID survives into POST /offers unchanged.
  sandbox.ticketOrder = { side:'SELL', name:'Runner', price:777, listingId: 424242 };
  sandbox.ownedTicketContext = { name:'Runner', ticketId: 424242 };
  const preserved = sandbox.window.openMarketSell();
  assert.strictEqual(preserved, 424242, 'openMarketSell must preserve the real owned ticket ID');
  let offerBody;
  fetchImpl = async (input, init) => {
    if (String(input).endsWith('/api/ticket-market/offers')) offerBody = JSON.parse(init.body);
    return makeResponse({ok:true,id:9,ticketType:'runner',askPrice:777});
  };
  await stage.submitCurrentOffer(777);
  assert.strictEqual(offerBody.ticketId, 424242, 'POST /offers must receive byte-for-byte same numeric ticket ID');
  assert.strictEqual(offerBody.askPrice, 777);

  // Acceptance 4: backend failure cannot become a local fake success.
  const writesBeforeFailure = localWrites;
  fetchImpl = async () => makeResponse({error:'forced failure'}, false, 500);
  await assert.rejects(() => stage.submitCurrentOffer(888), /forced failure/);
  assert.strictEqual(localWrites, writesBeforeFailure, 'failed real order must not write an active order to localStorage');

  let prevented = false, stopped = false, immediate = false;
  const root = {
    id:'ticketOrderModal',
    querySelector(sel) { return sel === '#ticketOrderPrice' ? { value:'888' } : null; },
  };
  const button = {
    textContent:'POST ASK', classList:{contains(){return false;}},
    closest(sel) { if (sel === 'button') return button; if (sel.includes('#ticketOrderModal')) return root; return null; },
  };
  stage.captureNativeOrder({
    target:{closest(sel){return sel === 'button' ? button : null;}},
    preventDefault(){prevented=true;}, stopPropagation(){stopped=true;}, stopImmediatePropagation(){immediate=true;},
  });
  assert(prevented && stopped && immediate, 'real order capture must block the old local-only/fake success handler before submission');
  assert.strictEqual(localWrites, writesBeforeFailure, 'capture path must not optimistically write local order state');

  console.log('Ticket Exchange Stage 1 frontend: PASS');
  console.log('book=real backend with fallback-on-failure; ID=424242 preserved; failed POST=no local echo');
}

async function crossAccountAcceptanceTest() {
  const express = require('express');
  const dbPath = '/tmp/sbc-ticket-exchange-stage1.db';
  try { fs.unlinkSync(dbPath); } catch (_) {}
  process.env.DB_PATH = dbPath;
  process.env.SESSION_SECRET = 'ticket-exchange-stage1-secret';

  // Load DB only after DB_PATH is fixed for this process.
  const db = require('./db');
  require('./schemaV45').run();
  const { sign } = require('./auth');
  const ticketMarketRouter = require('./routes/ticketMarket');

  const mkAccount = (email, display, code, balance) => {
    const userId = Number(db.prepare('INSERT INTO users(email,password_hash,display_name,referral_code) VALUES(?,?,?,?)')
      .run(email,'x:y',display,code).lastInsertRowid);
    const accountId = Number(db.prepare('INSERT INTO accounts(user_id,stonk_balance) VALUES(?,?)').run(userId,balance).lastInsertRowid);
    return { userId, accountId, token: sign({userId}) };
  };
  const accountA = mkAccount('stage1-a@test','Account A','STAGE1A',5000);
  const accountB = mkAccount('stage1-b@test','Account B','STAGE1B',5000);
  const ticketId = Number(db.prepare("INSERT INTO tickets(account_id,value_stonk,status,ticket_type,backing_stonk) VALUES(?,85,'unredeemed','runner',85)")
    .run(accountA.accountId).lastInsertRowid);

  const app = express();
  app.use(express.json());
  app.use('/api/ticket-market', ticketMarketRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve,reject) => {
    if (server.listening) return resolve();
    server.once('listening',resolve); server.once('error',reject);
  });

  try {
    const base = `http://127.0.0.1:${server.address().port}/api/ticket-market`;
    const listResponse = await fetch(`${base}/offers`, {
      method:'POST', headers:{authorization:`Bearer ${accountA.token}`,'content-type':'application/json'},
      body:JSON.stringify({ticketId,askPrice:777}),
    });
    const listed = await listResponse.json();
    assert.strictEqual(listResponse.status, 200, `Account A real listing failed: ${JSON.stringify(listed)}`);
    assert.strictEqual(listed.ok, true);

    // Acceptance 2: genuine Account B request with a different token/session.
    const bookResponse = await fetch(`${base}/book/runner`, {headers:{authorization:`Bearer ${accountB.token}`}});
    const book = await bookResponse.json();
    assert.strictEqual(bookResponse.status, 200);
    const visible = book.offers.find(o => Number(o.ticketId) === ticketId && Number(o.askPrice) === 777);
    assert(visible, 'Account B must see Account A listing in the real backend book');
    assert.strictEqual(visible.sellerDisplayName, 'Account A');
    assert.strictEqual(visible.isMine, false, 'Account B must see the listing as another account, not same-session state');

    const bMineResponse = await fetch(`${base}/mine`, {headers:{authorization:`Bearer ${accountB.token}`}});
    const bMine = await bMineResponse.json();
    assert(!bMine.offers.some(o => Number(o.ticketId) === ticketId), 'Account B mine endpoint must not own Account A listing');

    console.log('Ticket Exchange Stage 1 cross-account: PASS');
    console.log(`Account A listed ticket ${ticketId} @ 777; distinct Account B token saw it in GET /book/runner`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

(async () => {
  await frontendBehaviorTests();
  await crossAccountAcceptanceTest();
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
