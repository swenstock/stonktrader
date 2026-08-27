const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');

const src=fs.readFileSync(path.join(__dirname,'../public/v45-mycontest-entry-sync-v7.js'),'utf8');

const originalCalls=[];
const viewCalls=[];
let renderCount=0;
const rulesGate={classList:{removed:[],remove(v){this.removed.push(v)}}};
const buttons=[{classList:{removed:[],remove(v){this.removed.push(v)}}}];

const sandbox={
  window:{
    openSelectedMCPortfolio(tab,id,isLive){originalCalls.push({tab,id,isLive});return 'original';},
  },
  document:{
    readyState:'complete',
    getElementById(id){if(id==='rulesGate')return rulesGate;if(id==='view-my')return {textContent:'WEEKLY PORTFOLIO'};return null;},
    querySelectorAll(sel){return sel==='.quick-percent-row button'?buttons:[];},
    addEventListener(){}
  },
  MC_LIVE:[{id:'weekly',name:'WEEKLY PORTFOLIO',rank:'#1',prize:'Badge',positions:[['NVDA','10%','$100'],['Cash','90%','$0']]}],
  MC_ARCHIVE:[{id:'old',name:'OLD CONTEST',pnl:'+$1'}],
  MC_SELECTED_ENTRY:{'live-weekly':0,'archive-old':0},
  entriesFor(tab,id){if(tab==='live')return[{tier:'free',num:2,rank:'#1'}];return[{tier:'free',num:1,label:'Archived Entry'}];},
  sessionIsDegen(){return false;},
  sessionIsRace(){return false;},
  portfolioKey(ctx){return `${ctx.session}|${ctx.tier}|${ctx.entry}|${ctx.mode}`;},
  PORTFOLIOS:{},
  STOCKS:{NVDA:{price:100}},
  renderPortfolio(){renderCount++;},
  showView(v){viewCalls.push(v);},
  setTimeout(fn){fn();return 1;},
  console,Number,String,Object,Array,Map,Set,Date,RegExp,parseFloat
};
sandbox.window.window=sandbox.window;
vm.createContext(sandbox);
vm.runInContext(`
  let activePortfolioContext=null;
  let pendingPortfolioContext={stale:true};
  let portfolioReturnView='tier';
  let tradeSide='sell';
  let tradeInputMode='dollars';
  let selectedTradePercent=25;
  let quickTradePercent=75;
`,sandbox);
vm.runInContext(src,sandbox);

const result=sandbox.window.openSelectedMCPortfolio('live','weekly',true);
assert.strictEqual(result,true,'existing live My Contests reopen should use direct owned-entry path');
assert.strictEqual(originalCalls.length,0,'existing live My Contests reopen must not re-enter original Rules Gate flow');

const state=vm.runInContext(`({
  activePortfolioContext,
  pendingPortfolioContext,
  portfolioReturnView,
  tradeSide,
  tradeInputMode,
  selectedTradePercent,
  quickTradePercent
})`,sandbox);

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(state.activePortfolioContext)),
  {session:'WEEKLY PORTFOLIO',tier:'free',mode:'live',returnView:'my',entry:2,degen:false,race:false}
);
assert.strictEqual(state.pendingPortfolioContext,null,'stale pending Rules Gate context must be cleared');
assert.strictEqual(state.portfolioReturnView,'my');
assert.strictEqual(state.tradeSide,'buy');
assert.strictEqual(state.tradeInputMode,'shares');
assert.strictEqual(state.selectedTradePercent,50);
assert.strictEqual(state.quickTradePercent,null);
assert.strictEqual(renderCount,1);
assert.deepStrictEqual(viewCalls,['portfolio']);
assert.deepStrictEqual(rulesGate.classList.removed,['open']);
assert.deepStrictEqual(buttons[0].classList.removed,['active']);

// Existing archive behavior is intentionally unchanged.
const archiveResult=sandbox.window.openSelectedMCPortfolio('archive','old',false);
assert.strictEqual(archiveResult,'original');
assert.deepStrictEqual(originalCalls,[{tab:'archive',id:'old',isLive:false}]);

console.log('Workspace Consolidation Stage B.2 — Existing Entry Identity: PASS');
console.log('Existing live My Contests entry sets activePortfolioContext directly and bypasses Rules Gate; archive path remains original.');
