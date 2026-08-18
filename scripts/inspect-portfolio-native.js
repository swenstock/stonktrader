const {exactV45Shell}=require('../server/v45ExactShell');
const shell=exactV45Shell.toString('utf8');
function body(name){const start=shell.indexOf(`function ${name}(`);if(start<0)return `MISSING ${name}`;const brace=shell.indexOf('{',start);let d=0,q=null,e=false;for(let i=brace;i<shell.length;i++){const c=shell[i];if(q){if(e){e=false;continue}if(c==='\\'){e=true;continue}if(c===q)q=null;continue}if(c==='"'||c==="'"||c==='`'){q=c;continue}if(c==='{')d++;else if(c==='}'&&--d===0)return shell.slice(start,i+1)}return shell.slice(start,start+6000)}
for(const n of ['portfolioKey','seedPortfolio','currentPortfolio','proposedOrder','submitPortfolioOrder','setTradeInputMode','refreshTradeTicket']) console.log(`\n===== ${n} =====\n${body(n)}\n`);
