'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const source=fs.readFileSync('public/v45-trading-workstation-v1.js','utf8');

class ClassList{
  constructor(){this.set=new Set();}
  add(...xs){xs.forEach(x=>this.set.add(x));}
  remove(...xs){xs.forEach(x=>this.set.delete(x));}
  contains(x){return this.set.has(x);}
}
class El{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.classList=new ClassList();this.dataset={};this.style={};this.id='';this.offsetParent={};this._html='';}
  appendChild(c){if(c.parentElement)c.parentElement.removeChild(c);this.children.push(c);c.parentElement=this;return c;}
  prepend(c){if(c.parentElement)c.parentElement.removeChild(c);this.children.unshift(c);c.parentElement=this;return c;}
  insertBefore(c,ref){if(c.parentElement)c.parentElement.removeChild(c);const i=this.children.indexOf(ref);if(i<0)return this.appendChild(c);this.children.splice(i,0,c);c.parentElement=this;return c;}
  removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1);c.parentElement=null;return c;}
  remove(){this.parentElement?.removeChild(this);}
  set innerHTML(v){this._html=String(v);this.children=[];}
  get innerHTML(){return this._html;}
  setAttribute(k,v){if(k==='id')this.id=String(v);else this[k]=String(v);}
  getAttribute(k){return this[k]??null;}
  removeAttribute(k){delete this[k];}
  addEventListener(){}
  dispatchEvent(){}
  closest(sel){for(let p=this;p;p=p.parentElement)if(matches(p,sel))return p;return null;}
  querySelector(sel){return queryAll(this,sel)[0]||null;}
  querySelectorAll(sel){return queryAll(this,sel);}
}
function descendants(root){const out=[];for(const c of root.children)out.push(c,...descendants(c));return out;}
function matches(el,selector){
  return selector.split(',').some(raw=>{
    const s=raw.trim();
    if(s.startsWith('#'))return el.id===s.slice(1);
    if(s.startsWith('.'))return el.classList.contains(s.slice(1));
    if(s==='img')return el.tagName==='IMG';
    if(s==='[data-sbc-quote-symbol]')return el.dataset.sbcQuoteSymbol!==undefined;
    return false;
  });
}
function queryAll(root,sel){return descendants(root).filter(el=>matches(el,sel));}

function makeContext(initialWidth){
  const body=new El('body');
  const view=new El('main');view.id='view-portfolio';body.appendChild(view);
  const host=new El('section');host.id='native-host';view.appendChild(host);
  const ticket=new El('section');ticket.classList.add('quick-trade-clean');host.appendChild(ticket);

  let width=initialWidth;
  let matchCalls=0;
  let observerCallback=null;
  const scheduled=[];
  const intervals=[];

  const document={
    readyState:'complete',body,
    querySelector(sel){if(sel==='#view-portfolio')return view;if(sel==='#tradeSymbol')return null;return body.querySelector(sel);},
    querySelectorAll(sel){return body.querySelectorAll(sel);},
    createElement(tag){return new El(tag);},
    addEventListener(){},
  };
  const window={
    matchMedia(query){matchCalls++;return {matches:query==="(min-width:901px)"&&width>=901};},
    renderPortfolio(){return 'render-ok';},
    addEventListener(){},
    dispatchEvent(){},
  };
  const context={window,document,console,
    localStorage:{getItem(){return null;}},
    fetch:async()=>({ok:true,json:async()=>[]}),
    Event:class{},CustomEvent:class{},
    setTimeout(fn,ms){scheduled.push({fn,ms});return scheduled.length;},
    clearTimeout(){},
    setInterval(fn,ms){intervals.push({fn,ms});return intervals.length;},
    clearInterval(){},
    requestAnimationFrame(fn){fn();return 1;},
    MutationObserver:class{constructor(cb){observerCallback=cb;}observe(){}},
    TIER_DATA:{},
  };
  window.window=window;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'v45-trading-workstation-v1.js'});

  return {
    view,host,ticket,window,scheduled,intervals,
    setWidth(next){width=next;},
    fireObserver(){observerCallback?.();},
    matchCalls(){return matchCalls;},
  };
}

{
  const x=makeContext(1200);
  assert.strictEqual(x.ticket.parentElement,x.host,'desktop Order Entry must remain in its native parent');
  assert.strictEqual(x.view.querySelector('.sbc-quote-oe-grid-v1'),null,'desktop must not create quote/OE grid');
  assert.strictEqual(x.view.querySelector('#sbcQuotePanelV1'),null,'desktop must not create current quote panel');
  assert.strictEqual(x.intervals.length,0,'desktop must not start quote-panel polling interval');
  assert.strictEqual(x.window.renderPortfolio.__sbcContestRecoveryV1,true,'desktop must still install render recovery');

  x.scheduled.filter(job=>[80,250,700,1500].includes(job.ms)).forEach(job=>job.fn());
  for(let i=0;i<8;i++)x.fireObserver();

  assert.strictEqual(x.ticket.parentElement,x.host,'repeated desktop ensure cycles must preserve native Order Entry parent');
  assert.strictEqual(x.view.querySelector('.sbc-quote-oe-grid-v1'),null,'repeated desktop ensure cycles must never create grid');
  assert.strictEqual(x.view.querySelector('#sbcQuotePanelV1'),null,'repeated desktop ensure cycles must never create panel');
  assert(x.matchCalls()>=13,'desktop guard must be evaluated repeatedly, not cached');
  console.log('PASS: repeated desktop ensure/observer cycles remain native-layout no-ops');
}

{
  const x=makeContext(600);
  const grid=x.view.querySelector('.sbc-quote-oe-grid-v1');
  assert(grid,'mobile must still create existing quote/OE grid');
  assert.strictEqual(x.ticket.parentElement,grid,'mobile must still reparent Order Entry into existing grid');
  assert(x.view.querySelector('#sbcQuotePanelV1'),'mobile must still create existing quote panel');
  assert.strictEqual(x.intervals.length,1,'mobile must retain quote refresh polling');
  assert.strictEqual(x.window.renderPortfolio.__sbcContestRecoveryV1,true,'mobile must retain render recovery');
  console.log('PASS: existing mobile quote workstation behavior remains intact');
}

{
  const x=makeContext(1200);
  const before=x.matchCalls();
  x.setWidth(600);
  x.fireObserver();
  assert(x.matchCalls()>before,'matchMedia must be evaluated again after width change');
  assert(x.view.querySelector('.sbc-quote-oe-grid-v1'),'desktop-to-mobile resize may build on a later ensure cycle');
  console.log('PASS: viewport guard is evaluated fresh per invocation');
}

assert(source.includes("function buildQuotePanel(){\n  if(window.matchMedia('(min-width:901px)').matches)return;"),'guard must be first statement inside buildQuotePanel');
assert.strictEqual((source.match(/buildQuotePanel/g)||[]).length,2,'buildQuotePanel must still have one definition and one call site');
console.log('PASS: guard placement and call topology remain narrow');
