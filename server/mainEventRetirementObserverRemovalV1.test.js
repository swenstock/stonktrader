'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'v45-main-event-retirement-v1.js'), 'utf8');

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); }
  };
}

function makeElement(textContent = '') {
  return {
    textContent,
    hidden: false,
    removed: false,
    children: [],
    classList: makeClassList(),
    attrs: {},
    closest() { return null; },
    getAttribute(name) { return this.attrs[name] || null; },
    setAttribute(name, value) { this.attrs[name] = value; },
    remove() { this.removed = true; },
    querySelectorAll() { return []; }
  };
}

const mainEventButton = makeElement('MAIN EVENT');
const runnerButton = makeElement('RUNNER');
const title = makeElement('MAIN EVENT TICKET MARKET');
const modal = makeElement('MAIN EVENT ORDER');
modal.classList = makeClassList(['open']);
const leafCopy = makeElement('MAIN EVENT');
const unrelated = makeElement('UNRELATED');
const selector = makeElement();
selector.querySelectorAll = (query) => query === 'button' ? [mainEventButton, runnerButton] : [];

const exchange = makeElement();
exchange.querySelectorAll = () => [mainEventButton];

const byId = {
  'view-exchange': exchange,
  marketTicketTitle: title,
  ticketTypeSelector: selector,
  sellChoiceModal: modal,
  ticketOrderModal: makeElement('SAFE'),
  bidOrderModal: makeElement('SAFE')
};

const document = {
  readyState: 'complete',
  documentElement: makeElement(),
  body: makeElement(),
  getElementById(id) { return byId[id] || null; },
  querySelectorAll() { return [leafCopy, unrelated]; },
  createTreeWalker() { return { nextNode() { return null; } }; },
  addEventListener() { throw new Error('DOMContentLoaded listener should not be needed when readyState is complete'); }
};

let renderCalls = 0;
let observerConstructed = false;

const context = {
  window: { renderTicketMarket() { renderCalls += 1; } },
  document,
  NodeFilter: { SHOW_TEXT: 4 },
  MutationObserver: class {
    constructor() {
      observerConstructed = true;
      throw new Error('document-wide MutationObserver must not be constructed');
    }
  },
  activeTicketMarket: 'Main Event',
  ownedTicketContext: { name: 'Main Event', ticketId: 'legacy' }
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'v45-main-event-retirement-v1.js' });

assert.strictEqual(observerConstructed, false, 'retirement startup must not construct a MutationObserver');
assert.strictEqual(mainEventButton.removed, true, 'startup walk must remove the Exchange MAIN EVENT control');
assert.strictEqual(title.textContent, 'RUNNER TICKET MARKET', 'startup walk must normalize the ticket-market title');
assert.strictEqual(context.activeTicketMarket, 'Runner', 'startup walk must reset a legacy Main Event market to Runner');
assert.strictEqual(context.ownedTicketContext.name, 'Runner', 'startup walk must reset owned ticket context name');
assert.strictEqual(context.ownedTicketContext.ticketId, null, 'startup walk must clear owned ticket context id');
assert.strictEqual(runnerButton.classList.contains('active'), true, 'startup walk must activate the Runner selector');
assert.strictEqual(renderCalls, 1, 'startup correction must render the Runner market once');
assert.strictEqual(modal.classList.contains('open'), false, 'startup walk must close a legacy Main Event modal');
assert.strictEqual(modal.attrs['aria-hidden'], 'true', 'startup walk must mark the closed modal aria-hidden');
assert.strictEqual(leafCopy.hidden, true, 'startup walk must hide legacy Main Event leaf copy');

const lateNode = makeElement('MAIN EVENT');
document.querySelectorAll = () => [lateNode];
assert.strictEqual(lateNode.hidden, false, 'an unrelated later DOM mutation must not trigger another global text sweep');

console.log('Main Event Retirement Observer Removal V1: PASS');
