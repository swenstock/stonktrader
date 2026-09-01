'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const source=fs.readFileSync('public/v45-broker-race-ui.js','utf8');
const tradeCleanup=fs.readFileSync('public/v45-trade-cleanup-v8.js','utf8');
const exchangeCloseout=fs.readFileSync('server/exchangeStage5Closeout.test.js','utf8');

const removed=[];
function node(name,text=''){return{name,textContent:text,src:'data:image/png;base64,placeholder',style:{removeProperty(){}},removeAttribute(){},remove(){removed.push(name)}}}
const nodes={
  'section.quote.panel':node('market-strip','MAIN EVENT TICKET — LIVE MARKET HIGHEST BID LOWEST ASK LAST 24H SALES'),
  '.tutorial-replay':node('tutorial-help','?'),
  '.footer-card':node('corporate-footer','CLIMB THE CORPORATE LADDER.'),
  'header.top img.avatar':node('header-avatar'),
  '.pitch.panel>img':node('pitch-broker'),
  '.event.panel .prize-art img':node('funding-broker'),
  '#how .step.own img':node('promotion-broker'),
  '.me-compact.panel img':node('compact-broker'),
};
const document={readyState:'loading',querySelector:s=>nodes[s]||null,querySelectorAll:()=>[],addEventListener(){},documentElement:{}};
const sandbox={window:{},document,console,MutationObserver:function(){this.observe=()=>{}},setTimeout(){},clearTimeout(){}};
sandbox.window.addEventListener=()=>{};
vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:'v45-broker-race-ui.js'});
const api=sandbox.window.__SBC_BROKER_RACE_UI_TEST;
assert(api&&typeof api.retireObsoleteUiAndBrokerArt==='function');
assert.strictEqual(api.retireObsoleteUiAndBrokerArt(),5);
assert.deepStrictEqual(removed.sort(),['corporate-footer','market-strip','tutorial-help'].sort());
for(const key of ['header.top img.avatar','.pitch.panel>img','.event.panel .prize-art img','#how .step.own img','.me-compact.panel img'])assert.strictEqual(nodes[key].src,'/stonkbroker-reward-crop.png?v=1');
assert(source.includes("const footer=$('.footer-card');if(footer)footer.remove();"),'corporate footer producer must retire rather than recreate');
assert(!source.includes("footer.innerHTML='<strong>CLIMB THE CORPORATE LADDER."),'retired corporate footer must not be re-produced');
assert(tradeCleanup.includes("'replayCurrentTutorial'"),'tutorial replay remains deliberately hard-paused after dead ? control retirement');
assert(exchangeCloseout.includes('LEGACY_PRODUCERS=removed-at-source'),'prior Exchange Stage 5 producer-retirement guard remains intact');
console.log('Obsolete UI + Broker Art Cleanup V1: PASS');
