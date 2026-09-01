const assert=require('assert');
const vm=require('vm');
const { exactV45Shell }=require('./v45ExactShell');

const shell=exactV45Shell.toString('utf8');
const start=shell.indexOf('function updateLeaderFindBar(');
const end=shell.indexOf('\nfunction openGlobalFindMe(',start);
assert(start>=0&&end>start,'updateLeaderFindBar function missing');
const fnSource=shell.slice(start,end);

assert(!fnSource.includes("getElementById('leaderYourRank')"),'retired rank producer still queried');
assert(!fnSource.includes("getElementById('leaderYourPnl')"),'retired pnl producer still queried');
assert(shell.includes('let currentView='),'native currentView initialization missing');
assert(shell.includes('function showView(name){'),'native showView missing');

const nodes={
  leaderGapBox:{classList:{toggle(){}}},
  leaderMoneyRank:{textContent:''},
  leaderMoneyPnl:{textContent:''},
  leaderGapMain:{textContent:''},
  leaderGapPnl:{textContent:''},
};
const context={
  prototypeUserStanding(){return {rank:31,entries:224,userPnl:6.84,paidRank:18,pnl:4.12,gapSpots:13,pnlGap:2.72};},
  document:{getElementById(id){return nodes[id]||null;}},
};
vm.createContext(context);
vm.runInContext(`${fnSource}; this.updateLeaderFindBar=updateLeaderFindBar;`,context);
assert.doesNotThrow(()=>context.updateLeaderFindBar('runner','morning'),'leader find-bar update still crashes when retired identity nodes are absent');
assert.strictEqual(nodes.leaderMoneyRank.textContent,'#18');
assert.strictEqual(nodes.leaderMoneyPnl.textContent,'+4.12%');
assert.strictEqual(nodes.leaderGapMain.textContent,'13 SPOTS OUT');
assert.strictEqual(nodes.leaderGapPnl.textContent,'Need about +2.72%');
console.log('Static Leader Startup Navigation V1: PASS');
