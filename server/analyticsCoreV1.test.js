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
  constructor(tag='div',doc=null){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.parentElement=null;this.dataset={};this.attributes={};this.classList=new ClassList(this);this._className='';this._text='';this.hidden=false;this.listeners={};this.style={};this.open=false;this.onclick=null;}
  set className(v){this.classList.fromString(v)} get className(){return this._className}
  set textContent(v){this._text=String(v);this.children=[];} get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  set innerHTML(v){this.children=[];this._text=String(v||'').replace(/<[^>]*>/g,' ');}
  get innerHTML(){return this._text;}
  appendChild(c){if(c.parentElement)c.parentElement.removeChild(c);this.children.push(c);c.parentElement=this;return c;}
  append(...xs){xs.forEach(x=>this.appendChild(x));}
  prepend(c){if(c.parentElement)c.parentElement.removeChild(c);this.children.unshift(c);c.parentElement=this;return c;}
  removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1);c.parentElement=null;return c;}
  remove(){this.parentElement?.removeChild(this);}
  after(c){const p=this.parentElement;if(!p)return;if(c.parentElement)c.parentElement.removeChild(c);const i=p.children.indexOf(this);p.children.splice(i+1,0,c);c.parentElement=p;}
  before(c){const p=this.parentElement;if(!p)return;if(c.parentElement)c.parentElement.removeChild(c);const i=p.children.indexOf(this);p.children.splice(i,0,c);c.parentElement=p;}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='id')this.id=String(v);if(k==='class')this.className=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=String(v);}
  getAttribute(k){return this.attributes[k]??null;}
  removeAttribute(k){delete this.attributes[k];if(k.startsWith('data-'))delete this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())];}
  addEventListener(t,fn){(this.listeners[t]||(this.listeners[t]=[])).push(fn);}
  dispatchEvent(e){(this.listeners[e.type]||[]).forEach(fn=>fn.call(this,e));}
  click(){if(this.onclick)this.onclick({target:this});this.dispatchEvent({type:'click',target:this});}
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
    if(s.includes('>')){const [a,b]=s.split('>').map(x=>x.trim());return matches(el,b)&&el.parentElement&&matches(el.parentElement,a);}
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
function makePanel(doc,text,cls='analytics'){const s=doc.createElement('section');s.className=cls;const details=doc.createElement('details');const summary=doc.createElement('summary');summary.textContent='EXPAND';details.appendChild(summary);const body=doc.createElement('div');body.textContent=text;details.appendChild(body);s.appendChild(details);return s;}
function buildDom(){const d=new Document();const v=d.createElement('main');v.id='view-portfolio';d.body.appendChild(v);const metrics=d.createElement('div');metrics.className='contest-metrics-strip-v46';v.appendChild(metrics);const chart=d.createElement('section');chart.className='chart-trade-card';chart.textContent='CHART';v.appendChild(chart);const unsafe=d.createElement('section');unsafe.className='quick-trade-clean';unsafe.textContent='EQUITY CURVE ALLOCATION BREAKDOWN P&L DRIVERS';v.appendChild(unsafe);const p=makePanel(d,'EQUITY CURVE ALLOCATION BREAKDOWN P&L DRIVERS','portfolio-analytics-native');const a=makePanel(d,'VS. PRIZE LINE CASH DEPLOYMENT RANK MOVEMENT','advanced-analytics-native');v.append(p,a);return{d,v,p,a,unsafe,metrics};}
function run(width=1200){const {d,v,p,a,unsafe,metrics}=buildDom();const observers=[];class MO{constructor(cb){this.cb=cb;observers.push(this)}observe(){}}
  const context={window:null,document:d,MutationObserver:MO,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},Event:function(type){this.type=type;},console};context.window=context;context.matchMedia=q=>({matches:q.includes('min-width:901px')?width>=901:width<=620});context.window.matchMedia=context.matchMedia;vm.createContext(context);
  vm.runInContext(fs.readFileSync('public/v45-analytics-core-v1.js','utf8'),context,{filename:'core'});
  vm.runInContext(fs.readFileSync('public/v45-desktop-stage51-v55.js','utf8'),context,{filename:'stage51'});
  return{context,d,v,p,a,unsafe,metrics,observers};}

{
  const x=run();const core=x.context.SBCAnalyticsCoreV1;
  assert(core,'shared core exported');
  assert.strictEqual(core.hasNativeSignature(x.p,'portfolio'),true);
  assert.strictEqual(core.hasNativeSignature(x.a,'advanced'),true);
  assert.strictEqual(core.isSafeNativeModule(x.unsafe,x.v,'portfolio'),false,'core portfolio surface is rejected');
  const stash=x.v.querySelector('.stage51-native-stash-v55');assert(stash,'canonical stash exists');
  assert.strictEqual(x.p.parentElement,stash);assert.strictEqual(x.a.parentElement,stash);
  assert.strictEqual(x.metrics.querySelectorAll('.stage51-analysis-card-v55').length,2,'exactly two desktop header controls');
  const child=x.p.querySelector('div');let fired=0;child.addEventListener('probe',()=>fired++);
  x.metrics.querySelector('[data-stage51-analytics="portfolio"]').click();
  const modal=x.d.querySelector('.stage51-modal-v55'),content=modal.querySelector('.stage51-modal-content-v55');
  assert.strictEqual(x.p.parentElement,content,'same portfolio node mounted in modal');assert.strictEqual(x.a.parentElement,stash,'advanced remains isolated');
  x.observers[0].cb();assert.strictEqual(x.p.parentElement,content,'observer recapture does not yank open node');
  modal.querySelector('.stage51-modal-close-v55').click();assert.strictEqual(x.p.parentElement,stash,'same node restored to canonical stash');
  child.dispatchEvent({type:'probe'});assert.strictEqual(fired,1,'child listener survives move/restore');
  x.observers[0].cb();assert.strictEqual(x.v.querySelectorAll('.stage51-native-stash-v55').length,1);assert.strictEqual(x.metrics.querySelectorAll('.stage51-analysis-card-v55').length,2);
  x.metrics.querySelector('[data-stage51-analytics="advanced"]').click();assert.strictEqual(x.a.parentElement,content,'same advanced node mounted');assert.strictEqual(x.p.parentElement,stash,'portfolio remains isolated');
  console.log('PASS: shared analytics core preserves desktop Stage 51 behavior');
}
{
  const x=run(620);assert.strictEqual(x.context.__sbcDesktopStage51V55,undefined,'Stage 51 remains desktop-only below 901px');
  console.log('PASS: Stage 51 desktop gate unchanged');
}
{
  const loader=fs.readFileSync('public/v45-desktop-stage46-v51-pre.js','utf8');
  assert(loader.indexOf('/v45-analytics-core-v1.js?v=1')>=0);assert(loader.indexOf('/v45-analytics-core-v1.js?v=1')<loader.indexOf('/v45-desktop-stage51-v55.js?v=63'),'core loads before Stage 51');
  console.log('PASS: desktop loader orders shared core before Stage 51');
}
