const { exactV45Shell } = require('../server/v45ExactShell');
const shell = exactV45Shell.toString('utf8');

function functionBody(name){
  const needle=`function ${name}(`;
  const start=shell.indexOf(needle);
  if(start<0)return `MISSING ${name}`;
  const brace=shell.indexOf('{',start);
  let depth=0, quote=null, esc=false;
  for(let i=brace;i<shell.length;i++){
    const ch=shell[i];
    if(quote){
      if(esc){esc=false;continue;}
      if(ch==='\\'){esc=true;continue;}
      if(ch===quote)quote=null;
      continue;
    }
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}' && --depth===0)return shell.slice(start,i+1);
  }
  return shell.slice(start,start+5000);
}

for(const name of [
  'openSelectedMCPortfolio','beginPortfolioFlow','openRulesGateForContext','confirmRulesGate',
  'renderPortfolio','renderHoldings','renderPortfolioCharts','renderSymbolChart','renderQueuedOrders',
  'renderTradeHistory','refreshTradeTicket','currentPortfolio','selectMCEntry','showView'
]){
  console.log(`\n===== ${name} =====\n${functionBody(name)}\n`);
}

for(const phrase of ['TRADE THIS ENTRY','rulesGate','confirmRulesGate()','openSelectedMCPortfolio(','CURRENT POSITION','quote-strip']){
  console.log(`\n===== occurrences: ${phrase} =====`);
  let at=0,count=0;
  while((at=shell.indexOf(phrase,at))>=0 && count<12){
    console.log(shell.slice(Math.max(0,at-350),Math.min(shell.length,at+650)).replace(/\s+/g,' '));
    at+=phrase.length;count++;
  }
}
