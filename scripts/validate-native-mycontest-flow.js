const fs=require('fs');
const path=require('path');
const {exactV45Shell}=require('../server/v45ExactShell');
const shell=exactV45Shell.toString('utf8');
const actions=fs.readFileSync(path.join(__dirname,'..','public','v45-entry-actions-v20.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
function must(cond,msg){if(!cond){console.error('FAIL:',msg);process.exit(1);}console.log('PASS:',msg);}
must(/TRADE THIS ENTRY[\s\S]{0,500}openSelectedMCPortfolio\(/i.test(shell)||/openSelectedMCPortfolio\([^\n]+\)[\s\S]{0,300}TRADE THIS ENTRY/i.test(shell),'native Trade This Entry calls openSelectedMCPortfolio');
const confirmStart=shell.indexOf('function confirmRulesGate()');
const confirm=shell.slice(confirmStart,confirmStart+1600);
must(confirmStart>=0,'confirmRulesGate exists');
must(confirm.includes('renderPortfolio()'),'confirmRulesGate renders portfolio');
must(confirm.includes("showView('portfolio')")||confirm.includes('showView("portfolio")'),'confirmRulesGate opens portfolio view');
must(!actions.includes("removeAttribute('onclick')")&&!actions.includes('removeAttribute("onclick")'),'entry action dock does not remove native onclick');
must(!actions.includes('firstTradeLink'),'entry action dock does not proxy through a stock trade link');
must(!server.includes('v45-entry-flow-v25.js'),'legacy trade interception script is not injected');
must(server.includes('v45-mycontest-native-position-v27.js'),'native positioning helper is injected');
console.log('Native My Contests flow regression checks passed.');
