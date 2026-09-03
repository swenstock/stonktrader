'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const workstation=fs.readFileSync('public/v45-trading-workstation-v1.js','utf8');
const landings=fs.readFileSync('public/v45-view-landings-v29.js','utf8');

function makeContext({throwRender=false}={}){
  const nodes={};
  class El{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.classList={add(){},remove(){},contains(){return false}};this.style={};this.dataset={};this.innerHTML='';this.id='';this.scrollTop=0;}
    appendChild(c){this.children.push(c);c.parentElement=this;return c;}
    prepend(c){this.children.unshift(c);c.parentElement=this;return c;}
    querySelector(){return null}
    querySelectorAll(){return[]}
    closest(){return null}
    setAttribute(){}
    removeAttribute(){}
    addEventListener(){}
  }
  const body=new El('body'),html=new El('html');
  const portfolio=new El('section');portfolio.id='view-portfolio';portfolio.classList={add(){},remove(){},contains(){return false}};
  nodes['#view-portfolio']=portfolio;
  const document={
    readyState:'complete',body,documentElement:html,
    querySelector(sel){
      if(sel==='#view-portfolio')return portfolio;
      if(sel==='.view.active')return portfolio;
      return null;
    },
    querySelectorAll(){return[]},
    createElement(tag){return new El(tag)},
    addEventListener(){},
  };
  let renders=0,showCalls=0,scrollCalls=0;
  const window={
    matchMedia(){return {matches:true};},
    renderPortfolio(){
      renders++;
      if(throwRender)throw new Error('boom');
      return 'render-result';
    },
    showView(name){showCalls++;return name;},
    scrollTo(){scrollCalls++;},
    dispatchEvent(){},
  };
  const scheduled=[];
  const context={window,document,console,
    setTimeout(fn,ms){scheduled.push({fn,ms});return scheduled.length;},
    setInterval(){return 1},clearInterval(){},
    requestAnimationFrame(fn){fn();return 1},
    MutationObserver:class{observe(){}},
    Event:class{},CustomEvent:class{},
    localStorage:{getItem(){return null}},
    getComputedStyle(){return{overflowY:'visible',overflow:'visible'}},
  };
  window.window=window;
  vm.createContext(context);
  vm.runInContext(workstation,context,{filename:'v45-trading-workstation-v1.js'});
  return {context,window,document,portfolio,scheduled,
    counts:()=>({renders,showCalls,scrollCalls})};
}

{
  const x=makeContext();
  x.portfolio.scrollTop=777;
  const result=x.window.renderPortfolio();
  assert.strictEqual(result,'render-result','wrapped render preserves original return value');
  assert.strictEqual(x.counts().showCalls,0,'normal render must not call showView');
  assert.strictEqual(x.counts().scrollCalls,0,'normal render must not directly scroll');
  assert.strictEqual(x.portfolio.scrollTop,777,'normal render preserves current portfolio scroll position');
  x.window.renderPortfolio();x.window.renderPortfolio();
  assert.strictEqual(x.counts().showCalls,0,'repeated normal renders still do not navigate');
  assert.strictEqual(x.portfolio.scrollTop,777,'repeated normal renders preserve scroll');
  console.log('PASS: normal portfolio renders no longer invoke navigation or reset scroll');
}

{
  const x=makeContext();
  vm.runInContext(landings,x.context,{filename:'v45-view-landings-v29.js'});
  const before=x.counts().scrollCalls;
  x.window.showView('portfolio');
  const after=x.counts().scrollCalls;
  assert(after>before,'genuine showView(portfolio) navigation still triggers landing reset');
  assert.strictEqual(x.counts().showCalls,1,'original showView still called exactly once');
  console.log('PASS: genuine portfolio navigation still retains landing-at-top behavior');
}

{
  const x=makeContext({throwRender:true});
  assert.doesNotThrow(()=>x.window.renderPortfolio(),'render recovery wrapper still catches original render errors');
  assert.strictEqual(x.counts().showCalls,0,'error path does not reintroduce unconditional navigation');
  assert.strictEqual(x.portfolio.style.display,'','recovery path still forces portfolio visible');
  assert(x.portfolio.children.some(c=>c.id==='sbcPortfolioRecoveryV1'),'recovery shell still appears');
  assert(x.scheduled.some(x=>x.ms===250),'existing bounded 250ms recovery retry remains scheduled');
  console.log('PASS: existing error recovery remains intact without navigation coupling');
}

{
  assert(!workstation.includes("try{if(typeof window.showView==='function')window.showView('portfolio')}catch(_){}"),
    'source no longer contains unconditional render-path showView');
  assert(workstation.includes("console.error('SBC portfolio render recovery',err)"),
    'existing recovery catch remains');
  console.log('PASS: source boundary is narrow');
}
