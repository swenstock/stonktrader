'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const v5src=fs.readFileSync('public/v45-mobile-v5.js','utf8');
const v6src=fs.readFileSync('public/v45-mobile-v6.js','utf8');

class ClassList{constructor(){this.s=new Set()}add(...x){x.forEach(v=>this.s.add(v))}remove(...x){x.forEach(v=>this.s.delete(v))}contains(x){return this.s.has(x)}toggle(x,on){if(on===undefined)on=!this.s.has(x);on?this.s.add(x):this.s.delete(x);return on}}
class El{
  constructor(tag='div',doc=null){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.parentElement=null;this.dataset={};this.attributes={};this.classList=new ClassList();this.style={};this.hidden=false;this.id='';this._text='';this.onclick=null;this.offsetParent={};this.scrollHeight=0;this.clientHeight=0;this.scrollTop=0;this.offsetHeight=0;}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('')} set textContent(v){this._text=String(v);this.children=[]}
  get innerHTML(){return this._text} set innerHTML(v){this._text=String(v||'').replace(/<[^>]*>/g,' ');this.children=[]}
  appendChild(c){if(c.parentElement)c.parentElement.removeChild(c);this.children.push(c);c.parentElement=this;return c} append(...xs){xs.forEach(x=>this.appendChild(x))}
  prepend(c){if(c.parentElement)c.parentElement.removeChild(c);this.children.unshift(c);c.parentElement=this;return c}
  insertBefore(c,ref){if(c.parentElement)c.parentElement.removeChild(c);const i=this.children.indexOf(ref);if(i<0)return this.appendChild(c);this.children.splice(i,0,c);c.parentElement=this;return c}
  removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1);c.parentElement=null;return c} remove(){this.parentElement?.removeChild(this)}
  after(c){const p=this.parentElement;if(!p)return;if(c.parentElement)c.parentElement.removeChild(c);const i=p.children.indexOf(this);p.children.splice(i+1,0,c);c.parentElement=p}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='id')this.id=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=String(v)}
  getAttribute(k){return this.attributes[k]??null} removeAttribute(k){delete this.attributes[k];if(k.startsWith('data-'))delete this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]}
  addEventListener(){} focus(){} scrollIntoView(){} click(){this.onclick?.({target:this})}
  matches(s){return matches(this,s)} closest(s){for(let p=this;p;p=p.parentElement)if(matches(p,s))return p;return null}
  querySelector(s){return queryAll(this,s)[0]||null} querySelectorAll(s){return queryAll(this,s)}
}
function desc(r){const o=[];for(const c of r.children)o.push(c,...desc(c));return o}
function matches(el,selector){return selector.split(',').some(raw=>{let s=raw.trim();if(!s)return false;
  if(s.includes(' ')){const p=s.split(/\s+/),last=p.pop();if(!matches(el,last))return false;let n=el.parentElement;for(let i=p.length-1;i>=0;i--){while(n&&!matches(n,p[i]))n=n.parentElement;if(!n)return false;n=n.parentElement}return true}
  const attrs=[...s.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)];s=s.replace(/\[[^\]]+\]/g,'');for(const[,n,v]of attrs){const a=n.startsWith('data-')?el.dataset[n.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]:el.getAttribute(n);if(a==null)return false;if(v!==undefined&&String(a)!==v)return false}
  const id=(s.match(/#([\w-]+)/)||[])[1];if(id&&el.id!==id)return false;s=s.replace(/#[\w-]+/g,'');const cs=[...s.matchAll(/\.([\w-]+)/g)].map(m=>m[1]);if(cs.some(c=>!el.classList.contains(c)))return false;s=s.replace(/\.[\w-]+/g,'');const tag=s.trim();return !tag||el.tagName===tag.toUpperCase()})}
function queryAll(r,s){return desc(r).filter(e=>matches(e,s))}
class Doc extends El{constructor(){super('document');this.ownerDocument=this;this.body=new El('body',this);this.documentElement=new El('html',this);this.children=[this.documentElement];this.documentElement.appendChild(this.body);this.readyState='complete';this.hidden=false}createElement(t){return new El(t,this)}getElementById(id){return desc(this).find(x=>x.id===id)||null}addEventListener(){}}

function attr(doc,name){const x=doc.createElement('span');x.setAttribute(name,'');return x}
function build(tab){
  const d=new Doc(),v=d.createElement('main');v.id='view-portfolio';d.body.appendChild(v);
  const chart=d.createElement('section');chart.classList.add('chart-trade-card');const head=d.createElement('div');head.classList.add('card-head');const wrap=d.createElement('div');wrap.classList.add('chart-wrap');chart.append(head,wrap);v.appendChild(chart);
  const quick=d.createElement('section');quick.classList.add('quick-trade-clean');v.appendChild(quick);
  const holdings=d.createElement('section');holdings.classList.add('holdings-card');const hh=d.createElement('h2');hh.textContent='CURRENT POSITIONS';holdings.appendChild(hh);v.appendChild(holdings);
  const activity=d.createElement('section');const ah=d.createElement('h2');ah.textContent='ORDERS & ACTIVITY';activity.appendChild(ah);v.appendChild(activity);
  const analytics=d.createElement('section');analytics.classList.add('analytics');analytics.textContent='ANALYTICS EQUITY CURVE ALLOCATION BREAKDOWN P&L DRIVERS';v.appendChild(analytics);
  const tabs=d.createElement('div');tabs.id='mobileTradeTabsV5';v.appendChild(tabs);
  const ctx=d.createElement('div');ctx.id='mobileTradeContextV5';ctx.append(attr(d,'data-mv5-value'),attr(d,'data-mv5-rank'),attr(d,'data-mv5-time'));v.appendChild(ctx);
  const launch=d.createElement('section');launch.id='mobilePositionsLaunchV6';const lb=d.createElement('button'),sum=attr(d,'data-v6-pos-summary'),cnt=attr(d,'data-v6-pos-count');lb.append(sum,cnt);launch.appendChild(lb);v.appendChild(launch);
  const storage={value:tab,getItem(k){return k==='sbcMobileTradeTabV5'?this.value:null},setItem(k,val){if(k==='sbcMobileTradeTabV5')this.value=val}};
  return{d,v,chart,quick,holdings,activity,analytics,tabs,ctx,launch,storage}
}
function run(tab){
  const x=build(tab),observers=[];
  class MO{constructor(cb){this.cb=cb;observers.push(this)}observe(){}}
  const c={window:null,document:x.d,console,sessionStorage:x.storage,navigator:{onLine:true},scrollY:0,
    getComputedStyle:()=>({display:'block',fontSize:'16px',overflowY:'visible',overflow:'visible'}),
    setTimeout:fn=>{fn();return 1},clearTimeout(){},setInterval(){return 1},clearInterval(){},requestAnimationFrame:fn=>{fn();return 1},
    MutationObserver:MO,Event:class{},CustomEvent:class{},WebSocket:function(){}};
  c.window=c;c.matchMedia=()=>({matches:true});c.window.matchMedia=c.matchMedia;c.window.addEventListener=()=>{};c.window.scrollTo=()=>{};c.window.dispatchEvent=()=>{};
  vm.createContext(c);vm.runInContext(v5src,c,{filename:'v45-mobile-v5.js'});
  assert(x.v.querySelectorAll('[data-mobile-trade-panel-v5]').length>0,'V5 establishes workstation ownership before V6');
  vm.runInContext(v6src,c,{filename:'v45-mobile-v6.js'});
  return{...x,context:c,observers}
}
for(const tab of ['analytics','positions','chart']){
  const x=run(tab);
  assert.strictEqual(x.context.__sbcMobileTradeTabsRetiredV6,true);
  assert(x.chart.classList.contains('mobile-chart-trade-v6'));
  assert.strictEqual(x.v.querySelectorAll('[data-mobile-trade-panel-v5]').length,0,`V5 markers cleared for ${tab}`);
  assert(x.tabs.classList.contains('mobile-v6-retired'));
  assert(x.d.getElementById('mobilePositionsLaunchV6'));
  for(let i=0;i<3;i++)x.observers.forEach(o=>o.cb());
  assert.strictEqual(x.v.querySelectorAll('[data-mobile-trade-panel-v5]').length,0,`V5 observer cannot reclaim ${tab}`);
  assert(x.chart.classList.contains('mobile-chart-trade-v6'));
}
console.log('PASS: persisted V5 tab state cannot blank V6 workstation');
{
  const x=run('analytics');
  assert(x.d.body.querySelectorAll('#mobileBottomNavV5').length===1,'V5 bottom nav still runs');
  assert(v5src.includes('observeConnectivity()')&&v5src.includes('hookWebSocket()'));
  assert(v5src.includes('findMeButton()')&&v5src.includes('sheets()')&&v5src.includes('numericInputs()'));
  assert(!v5src.includes('.disconnect('),'no full observer shutdown');
  console.log('PASS: unrelated V5 mobile behavior remains active');
}
{
  assert((v5src.match(/if\(tradeTabsRetired\(\)\)return;/g)||[]).length===3,'exactly three trade-tab ownership guards');
  assert(v6src.includes('window.__sbcMobileTradeTabsRetiredV6=true'));
  assert(v6src.includes("removeAttribute('data-mobile-trade-panel-v5')"));
  console.log('PASS: explicit narrow V5/V6 ownership contract');
}
