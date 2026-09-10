'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const v36 = fs.readFileSync('public/v45-ticket-market-v36.js', 'utf8');
const v41 = fs.readFileSync('public/v45-ticket-native-hooks-v41.js', 'utf8');

function between(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Unable to extract ${start}`);
  return source.slice(a, b);
}

function makeData(perType, idBase = 1) {
  const types = ['junior', 'trader', 'clerk', 'runner'];
  const tickets = [];
  let id = idBase;
  for (const type of types) {
    for (let i = 0; i < perType; i++) tickets.push({ id: id++, ticket_type: type, status: 'unredeemed' });
  }
  const inventory = Object.fromEntries(types.map(type => [type, { owned: perType, available: perType }]));
  return { tickets, inventory };
}

class FakeBox {
  constructor() {
    this.rows = [];
    this.empty = null;
    this.back = { className: 'back-floor-cta' };
  }
  querySelectorAll(selector) {
    return selector === '.inv.big-inv' ? [...this.rows] : [];
  }
  querySelector(selector) {
    if (selector === '.back-floor-cta') return this.back;
    if (selector === '#sbcRealMyTicketsEmpty') return this.empty;
    return null;
  }
  insertBefore(node) {
    node.remove = () => {
      this.rows = this.rows.filter(x => x !== node);
      if (this.empty === node) this.empty = null;
    };
    if (node.id === 'sbcRealMyTicketsEmpty') this.empty = node;
    else this.rows.push(node);
  }
}

function makeElement(tag) {
  const actions = { children: [], appendChild(node) { this.children.push(node); } };
  return {
    tagName: String(tag || '').toUpperCase(),
    id: '',
    className: '',
    textContent: '',
    disabled: false,
    onclick: null,
    innerHTML: '',
    querySelector(selector) { return selector === '.tm36-ticket-actions' ? actions : null; },
  };
}

function response(data) {
  return { ok: true, async json() { return data; } };
}

(async () => {
  // V36 must no longer build My Tickets rows itself. It only delegates to V41.
  const v36Delegate = between(v36, 'async function decorateMyTickets()', '\nfunction decorateBook');
  assert(v36Delegate.includes('window.__SBC_TICKET_REAL_OFFER_TEST?.renderAuthoritativeMyTickets?.()'), 'V36 must delegate My Tickets rendering to V41');
  assert(!/document\.|createElement|insertBefore|querySelector|\.innerHTML|api\(/.test(v36Delegate), 'V36 delegate must not retain independent My Tickets DOM/data rendering');
  assert(v36.includes('async function renderBurn()'), 'V36 burn ladder must remain present');
  assert(v36.includes("api('/api/tickets/burn-upgrade'"), 'V36 burn mutation must remain present');
  assert(v36.includes('function renderBookFromBackend(book)'), 'V36 ticket book rendering must remain present');
  assert(v36.includes('function captureNativeOrder(e)'), 'V36 modal/order interception must remain present');

  let delegated = 0;
  const v36Context = {
    window: { __SBC_TICKET_REAL_OFFER_TEST: { renderAuthoritativeMyTickets() { delegated++; return Promise.resolve('delegated'); } } },
  };
  vm.createContext(v36Context);
  vm.runInContext(`${v36Delegate};this.decorateMyTickets=decorateMyTickets;`, v36Context);
  const delegatedResult = await v36Context.decorateMyTickets();
  assert.strictEqual(delegatedResult, 'delegated');
  assert.strictEqual(delegated, 1, 'V36 delegate should call the V41 authoritative renderer exactly once');
  console.log('PASS: V36 no longer independently owns My Tickets rows');

  // Execute the real V41 refresh + authoritative render functions in a controlled fake DOM.
  const refreshFn = between(v41, 'async function refreshSelectorInventory()', '\nasync function mintTestExchangeTickets');
  const renderFn = between(v41, 'async function renderAuthoritativeMyTickets(data)', '\nfunction installOwnedTicketSellGuard');
  assert(v41.includes('let myTicketsRenderGeneration=0;'), 'V41 generation guard declaration missing');

  const box = new FakeBox();
  const selector = { querySelectorAll() { return []; } };
  const context = {
    box,
    window: { openOwnedTicketSell() {} },
    document: {
      createElement: makeElement,
      getElementById(id) { return id === 'ticketTypeSelector' ? selector : null; },
    },
    fetch: null,
    console,
  };
  vm.createContext(context);
  vm.runInContext(`
    const LABEL={junior:'Jr Broker',trader:'Trader',clerk:'Clerk',runner:'Runner'};
    let myTicketsRenderGeneration=0;
    function token(){return 'test-token'}
    function findMyTicketsBox(){return box}
    function typeForButton(){return null}
    function setButtonOwnership(){}
    function normalizeJuniorTierLabels(){}
    function syncTicketTradeAuthState(){}
    ${refreshFn}
    ${renderFn}
    this.api={refreshSelectorInventory,renderAuthoritativeMyTickets};
  `, context);

  // Genuine overlap: direct render A begins and blocks in fetch. Before A resolves,
  // the indirect refreshSelectorInventory path fetches B and invokes the same real renderer.
  // B is the later generation and must win even when A resolves afterward.
  let fetchCalls = 0;
  let releaseA;
  context.fetch = () => {
    fetchCalls++;
    if (fetchCalls === 1) return new Promise(resolve => { releaseA = resolve; });
    return Promise.resolve(response(makeData(1, 100)));
  };

  const renderA = context.api.renderAuthoritativeMyTickets();
  assert.strictEqual(fetchCalls, 1, 'direct render A should be waiting on its real fetch path');
  const renderB = context.api.refreshSelectorInventory();
  await renderB;
  assert.strictEqual(fetchCalls, 2, 'indirect refresh path should perform its own fetch before rendering B');
  assert.strictEqual(box.rows.length, 4, 'later render B must produce exactly one four-tier row set');
  assert(box.rows.every(row => /× 1/.test(row.innerHTML)), 'later render B data must own the visible rows');

  releaseA(response(makeData(2, 200)));
  await renderA;
  assert.strictEqual(box.rows.length, 4, 'stale overlapping render A must not append a second four-row set');
  assert(box.rows.every(row => /× 1/.test(row.innerHTML)), 'stale render A must not overwrite the later render B result');
  console.log('PASS: genuine overlapping direct + indirect renders keep only the later generation');

  // A normal non-overlapping direct call must still commit every time.
  await context.api.renderAuthoritativeMyTickets(makeData(2, 300));
  assert.strictEqual(box.rows.length, 4);
  assert(box.rows.every(row => /× 2/.test(row.innerHTML)), 'normal direct render must not be silently dropped');
  await context.api.renderAuthoritativeMyTickets(makeData(3, 400));
  assert.strictEqual(box.rows.length, 4);
  assert(box.rows.every(row => /× 3/.test(row.innerHTML)), 'subsequent normal direct render must replace the prior row set');
  console.log('PASS: normal non-overlapping authoritative renders still commit every time');

  // The indirect refresh path must also continue to render normally after the overlap test.
  context.fetch = async () => response(makeData(4, 500));
  await context.api.refreshSelectorInventory();
  assert.strictEqual(box.rows.length, 4);
  assert(box.rows.every(row => /× 4/.test(row.innerHTML)), 'refreshSelectorInventory must still commit its authoritative row set');
  console.log('PASS: refreshSelectorInventory indirect path remains live and authoritative');

  console.log('My Tickets Single Owner V1: PASS');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
