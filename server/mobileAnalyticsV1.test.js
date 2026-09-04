const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

class ClassList{
  constructor(el){this.el=el;this.set=new Set();}
  add(...xs){xs.forEach(x=>this.set.add(x));this.sync();}
  remove(...xs){xs.forEach(x=>this.set.delete(x));this.sync();}
  contains(x){return this.set.has(x);}
  toggle(x,on){if(on===undefined)on=!this.set.has(x);on?this.set.add(x):this.set.delete(x);this.sync();return on;}
  sync(){this.el._className=[...this.set].join(' ');}
  fromString(s){this.set=new Set(String(s||'').split(/\s+/).filter(Boolean));this.sync();}
}
class Element{
  constructor(tag='div',doc=null){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.parentElement=null;this.dataset={};this.attributes={};this.classList=new ClassList(this);this._className='';this._text='';this.hidden=false;this.disabled=false;this.listeners={};this.style={};this.open=false;this.onclick=null;this.oninput=null;this.id='';}
  set className(v){this.classList.fromString(v)} get className(){return this._className}
  set textContent(v){this._text=String(v);this.children=[];} get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  get firstChild(){return this.children[0]||null;} get firstElementChild(){return this.firstChild;} get parentNode(){return this.parentElement;}
  get previousElementSibling(){if(!this.parentElement)return null;const i=this.parentElement.children.indexOf(this);return i>0?this.parentElement.children[i-1]:null;}
  set innerHTML(v){
    const html=String(v||'');this.children=[];this._text='';
    if(html.includes('data-v6-pos-summary')){
      const button=this.ownerDocument.createElement('button'),div=this.ownerDocument.createElement('div'),small=this.ownerDocument.createElement('small'),b=this.ownerDocument.createElement('b'),summary=this.ownerDocument.createElement('span'),strong=this.ownerDocument.createElement('strong'),count=this.ownerDocument.createElement('span');
      small.textContent='PORTFOLIO';b.textContent='CURRENT POSITIONS';summary.setAttribute('data-v6-pos-summary','');strong.appendChild(count);count.setAttribute('data-v6-pos-count','');div.append(small,b,summary);button.append(div,strong);this.appendChild(button);return;
    }
    if(html.includes('data-v6-analytics-summary')){
      const button=this.ownerDocument.createElement('button'),div=this.ownerDocument.createElement('div'),small=this.ownerDocument.createElement('small'),b=this.ownerDocument.createElement('b'),summary=this.ownerDocument.createElement('span'),strong=this.ownerDocument.createElement('strong');
      small.textContent='PERFORMANCE';b.textContent='ANALYTICS';summary.setAttribute('data-v6-analytics-summary','');strong.textContent='›';div.append(small,b,summary);button.append(div,strong);this.appendChild(button);return;
    }
    if(html.includes('mobileAnalyticsTitleV6')){
      const panel=this.ownerDocument.createElement('section'),grab=this.ownerDocument.createElement('div'),header=this.ownerDocument.createElement('header'),wrap=this.ownerDocument.createElement('div'),small=this.ownerDocument.createElement('small'),title=this.ownerDocument.createElement('h2'),close=this.ownerDocument.createElement('button'),tabs=this.ownerDocument.createElement('div'),portfolio=this.ownerDocument.createElement('button'),advanced=this.ownerDocument.createElement('button'),host=this.ownerDocument.createElement('div');
      panel.setAttribute('role','dialog');grab.className='mobile-sheet-grab-v6';small.textContent='PERFORMANCE';title.id='mobileAnalyticsTitleV6';title.textContent='ANALYTICS';close.setAttribute('data-v6-analytics-close','');tabs.className='mobile-analytics-tabs-v6';portfolio.setAttribute('data-v6-analytics-kind','portfolio');portfolio.textContent='PORTFOLIO';advanced.setAttribute('data-v6-analytics-kind','advanced');advanced.textContent='ADVANCED';host.className='mobile-analytics-host-v6';wrap.append(small,title);header.append(wrap,close);tabs.append(portfolio,advanced);panel.append(grab,header,tabs,host);this.appendChild(panel);return;
    }
    this._text=html.replace(/<[^>]*>/g,' ');
  }
  get innerHTML(){return this._text;}
  appendChild(c){if(c.parentElement)c.parentElement.removeChild(c);this.children.push(c);c.parentElement=this;if(this._appendHook)this._appendHook(c);return c;}
  append(...xs){xs.forEach(x=>this.appendChild(x));}
  prepend(c){if(c.parentElement)c.parentElement.removeChild(c);this.children.unshift(c);c.parentElement=this;return c;}
  insertBefore(c,ref){if(c.parentElement)c.parentElement.removeChild(c);const i=this.children.indexOf(ref);if(i<0)return this.appendChild(c);this.children.splice(i,0,c);c.parentElement=this;return c;}
  removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1);c.parentElement=null;return c;}
  remove(){this.parentElement?.removeChild(this);}
  after(c){const p=this.parentElement;if(!p)return;if(c.parentElement)c.parentElement.removeChild(c);const i=p.children.indexOf(this);p.children.splice(i+1,0,c);c.parentElement=p;}
  before(c){const p=this.parentElement;if(!p)return;if(c.parentElement)c.parentElement.removeChild(c);const i=p.children.indexOf(this);p.children.splice(i,0,c);c.parentElement=p;}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='id')this.id=String(v);if(k==='class')this.className=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=String(v);}
  getAttribute(k){return this.attributes[k]??null;}
  removeAttribute(k){delete this.attributes[k];if(k.startsWith('data-'))delete this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())];}
  addEventListener(t,fn){(this.listeners[t]||(this.listeners[t]=[])).push(fn);}
  dispatchEvent(e){(this.listeners[e.type]||[]).forEach(fn=>fn.call(this,e));}
  click(){if(this.onclick)this.onclick({target:this,preventDefault(){},stopImmediatePropagation(){}});this.dispatchEvent({type:'click',target:this,preventDefault(){},stopImmediatePropagation(){}});}
  focus(){this.ownerDocument.activeElement=this;}
  contains(n){for(let p=n;p;p=p.parentElement)if(p===this)return true;return false;}
  matches(sel){return matches(this,sel);}
  closest(sel){for(let p=this;p;p=p.parentElement)if(matches(p,sel))return p;return null;}
  querySelector(sel){return queryAll(this,sel)[0]||null;}
  querySelectorAll(sel){return queryAll(this,sel);}
}
function descendants(root){const out=[];for(const c of root.children){out.push(c,...descendants(c));}return out;}
function matches(el,selector){
  return selector.split(',').some(raw=>{let s=raw.trim();if(!s)return false;
    if(s.includes('>')){const i=s.lastIndexOf('>'),a=s.slice(0,i).trim(),b=s.slice(i+1).trim();return matches(el,b)&&el.parentElement&&matches(el.parentElement,a);}
    if(s.includes(' ')){const parts=s.split(/\s+/);const last=parts.pop();if(!matches(el,last))return false;let p=el.parentElement;for(let i=parts.length-1;i>=0;i--){while(p&&!matches(p,parts[i]))p=p.parentElement;if(!p)return false;p=p.parentElement;}return true;}
    const nots=[...s.matchAll(/:not\(([^)]+)\)/g)].map(m=>m[1]);s=s.replace(/:not\([^)]+\)/g,'');if(nots.some(n=>matches(el,n)))return false;
    const attrs=[...s.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)];s=s.replace(/\[[^\]]+\]/g,'');
    for(const [,name,val] of attrs){let actual;if(name.startsWith('data-'))actual=el.dataset[name.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())];else actual=el.getAttribute(name);if(actual===undefined||actual===null)return false;if(val!==undefined&&String(actual)!==val)return false;}
    const id=(s.match(/#([\w-]+)/)||[])[1];if(id&&el.id!==id)return false;s=s.replace(/#[\w-]+/g,'');
    const classes=[...s.matchAll(/\.([\w-]+)/g)].map(m=>m[1]);if(classes.some(c=>!el.classList.contains(c)))return false;s=s.replace(/\.[\w-]+/g,'');
    const tag=s.trim();if(tag&&tag!=='*'&&el.tagName!==tag.toUpperCase())return false;return true;
  });
}
function queryAll(root,sel){return descendants(root).filter(el=>matches(el,sel));}
class Document extends Element{
  constructor(){super('document');this.ownerDocument=this;this.body=new Element('body',this);this.head=new Element('head',this);this.documentElement=new Element('html',this);this.documentElement.appendChild(this.head);this.documentElement.appendChild(this.body);this.children=[this.documentElement];this.readyState='complete';this.activeElement=null;}
  createElement(t){return new Element(t,this)}
  getElementById(id){return descendants(this).find(x=>x.id===id)||null;}
}
function makeAnalytics(doc,text,cls){const s=doc.createElement('section');s.className=cls;s.setAttribute('data-mobile-trade-panel-v5','analytics');const details=doc.createElement('details'),summary=doc.createElement('summary'),body=doc.createElement('div'),probe=doc.createElement('button');summary.textContent='EXPAND';body.textContent=text;probe.textContent='probe';details.append(summary,body,probe);s.appendChild(details);return{s,probe};}
function addPosition(doc,tbody){const tr=doc.createElement('tr');['AAPL','10','$100','$110','$1,100','+$100'].forEach(t=>{const td=doc.createElement('td');td.textContent=t;tr.appendChild(td)});tbody.appendChild(tr);return tr;}
function buildDom({valid=true}={}){
  const d=new Document(),v=d.createElement('main');v.id='view-portfolio';d.body.appendChild(v);
  const retired=d.createElement('div');retired.id='mobileTradeTabsV5';v.appendChild(retired);
  const context=d.createElement('div');context.id='mobileTradeContextV5';v.appendChild(context);
  const chart=d.createElement('section');chart.className='chart-trade-card';const head=d.createElement('div');head.className='card-head';chart.appendChild(head);v.appendChild(chart);
  const quick=d.createElement('section');quick.className='quick-trade-clean';if(!valid)quick.textContent='EQUITY CURVE ALLOCATION BREAKDOWN P&L DRIVERS';v.appendChild(quick);
  const holdings=d.createElement('section');holdings.className='holdings-card';const table=d.createElement('table'),tbody=d.createElement('tbody');tbody.id='portfolioHoldings';table.appendChild(tbody);holdings.appendChild(table);v.appendChild(holdings);addPosition(d,tbody);
  let p=null,a=null;
  if(valid){p=makeAnalytics(d,'EQUITY CURVE ALLOCATION BREAKDOWN P&L DRIVERS','portfolio-native');a=makeAnalytics(d,'VS. PRIZE LINE CASH DEPLOYMENT RANK MOVEMENT','advanced-native');v.append(p.s,a.s);}
  return{d,v,chart,quick,holdings,p,a};
}
function runMobile({width=390,valid=true}={}){
  const x=buildDom({valid}),observers=[];
  class MO{constructor(cb){this.cb=cb;observers.push(this)}observe(){}}
  const context={window:null,document:x.d,MutationObserver:MO,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},console,getComputedStyle:()=>({overflowY:'visible'}),navigator:{onLine:true},sessionStorage:{getItem(){return null},setItem(){}},scrollY:0};
  context.window=context;context.matchMedia=q=>({matches:q.includes('max-width:620px')?width<=620:width>=901});context.window.matchMedia=context.matchMedia;context.window.addEventListener=()=>{};context.window.scrollTo=()=>{};context.Event=function(type){this.type=type;};vm.createContext(context);
  vm.runInContext(fs.readFileSync('public/v45-analytics-core-v1.js','utf8'),context,{filename:'core'});
  vm.runInContext(fs.readFileSync('public/v45-mobile-v6.js','utf8'),context,{filename:'mobile-v6'});
  return{...x,context,observers};
}

{
  const x=runMobile();const core=x.context.SBCAnalyticsCoreV1;
  assert(x.context.__sbcMobileV6,'V6 initialized on mobile');
  assert(x.d.getElementById('mobileTradeTabsV5').classList.contains('mobile-v6-retired'),'V5 tabs remain retired');
  assert(x.chart.classList.contains('mobile-chart-trade-v6'),'Chart+Trade remains V6 primary surface');
  assert(x.d.getElementById('mobilePositionsLaunchV6'),'Positions launcher remains present');
  const launcher=x.d.getElementById('mobileAnalyticsLaunchV6');assert(launcher,'Analytics launcher exists');
  assert.strictEqual(x.v.querySelectorAll('#mobileAnalyticsLaunchV6').length,1);
  assert.strictEqual(x.p.s.dataset.mobileTradePanelV5,undefined,'obsolete V5 portfolio Analytics marker stripped');
  assert.strictEqual(x.a.s.dataset.mobileTradePanelV5,undefined,'obsolete V5 advanced Analytics marker stripped');
  x.context.__sbcMobileV6Enhance();x.context.__sbcMobileV6Enhance();assert.strictEqual(x.v.querySelectorAll('#mobileAnalyticsLaunchV6').length,1,'repeated enhance does not duplicate launcher');

  let fired=0;x.p.probe.addEventListener('probe',()=>fired++);
  launcher.querySelector('button').click();
  const sheet=x.d.getElementById('mobileAnalyticsSheetV6'),host=sheet.querySelector('.mobile-analytics-host-v6'),stash=x.v.querySelector('.stage51-native-stash-v55');
  assert(sheet&&!sheet.hidden,'Analytics sheet opens');
  assert.strictEqual(x.p.s.parentElement,host,'exact Portfolio native node mounted');
  assert.strictEqual(x.a.s.parentElement,stash,'Advanced remains in canonical stash');
  assert.strictEqual(x.v.querySelectorAll('.portfolio-native').length,0,'mounted source is not cloned inside portfolio view');
  sheet.querySelector('[data-v6-analytics-kind="advanced"]').click();
  assert.strictEqual(x.p.s.parentElement,stash,'Portfolio restored before switch');
  assert.strictEqual(x.a.s.parentElement,host,'exact Advanced native node mounted after switch');
  sheet.querySelector('[data-v6-analytics-kind="portfolio"]').click();
  assert.strictEqual(x.p.s.parentElement,host,'Portfolio can be remounted');
  x.p.probe.dispatchEvent({type:'probe'});assert.strictEqual(fired,1,'listener survives moves');
  sheet.querySelector('[data-v6-analytics-close]').click();
  assert.strictEqual(x.p.s.parentElement,stash,'close restores exact mounted node');
  assert(sheet.hidden,'sheet hides on close');
  assert(!x.d.body.classList.contains('mobile-analytics-sheet-open-v6'),'sheet-open body state clears');
  launcher.querySelector('button').click();assert.strictEqual(x.p.s.parentElement,host,'reopen remounts exact node');
  assert.strictEqual(x.d.querySelectorAll('#mobileAnalyticsSheetV6').length,1,'one sheet only');
  assert.strictEqual(x.d.querySelectorAll('[data-stage51-source="portfolio"]').length,1,'one portfolio source marker only');
  assert.strictEqual(x.d.querySelectorAll('[data-stage51-source="advanced"]').length,1,'one advanced source marker only');
  console.log('PASS: mobile Analytics mounts/restores exact shared-core native nodes without duplicates');
}
{
  const x=runMobile({valid:false});
  assert.strictEqual(x.d.getElementById('mobileAnalyticsLaunchV6'),null,'unsafe-only Analytics content produces no launcher');
  assert.strictEqual(x.context.SBCAnalyticsCoreV1.isSafeNativeModule(x.quick,x.v,'portfolio'),false,'shared core rejects unsafe Quick Trade container');
  console.log('PASS: invalid Analytics sources are rejected');
}
{
  const x=runMobile({width:900});
  assert.strictEqual(x.context.__sbcMobileV6,undefined,'V6 remains mobile-only above 620px');
  assert.strictEqual(x.d.getElementById('mobileAnalyticsLaunchV6'),null);
  console.log('PASS: desktop remains untouched');
}
{
  const js=fs.readFileSync('public/v45-mobile-v6.js','utf8');
  assert(!js.includes("portfolio:['EQUITY CURVE'")&&!js.includes('function findNativeModule')&&!js.includes('function isSafeNativeModule'),'V6 does not duplicate shared Analytics discovery/signatures');
  assert(js.includes("removeAttribute('data-mobile-trade-panel-v5')"),'V6 explicitly neutralizes obsolete V5 Analytics visibility marker');
  console.log('PASS: V6 consumes shared core without duplicated discovery logic');
}
{
  const d=new Document(),order=[],context={window:null,document:d,console,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{}};
  context.window=context;context.matchMedia=()=>({matches:true});context.window.matchMedia=context.matchMedia;
  d.head._appendHook=node=>{
    if(node.tagName!=='SCRIPT')return;
    order.push(node.src);
    if(node.src==='/v45-analytics-core-v1.js?v=1'){context.SBCAnalyticsCoreV1={};node.dispatchEvent({type:'load',target:node});}
    if(node.src==='/v45-mobile-v6.js?v=7')assert(context.SBCAnalyticsCoreV1,'core exists before V6 script is appended');
  };
  vm.createContext(context);vm.runInContext(fs.readFileSync('public/v45-mobile-v4.js','utf8'),context,{filename:'mobile-v4'});
  assert(order.indexOf('/v45-analytics-core-v1.js?v=1')>=0);
  assert(order.indexOf('/v45-mobile-v6.js?v=7')>order.indexOf('/v45-analytics-core-v1.js?v=1'),'mobile loader sequences core before V6');
  console.log('PASS: mobile loader explicitly sequences shared core before V6');
}
