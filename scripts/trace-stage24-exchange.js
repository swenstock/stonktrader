const { exactV45Shell } = require('../server/v45ExactShell');
const s=exactV45Shell.toString('utf8');
const needles=['/api/ticket-market/book/','/api/tickets','Authorization','Bearer ','localStorage.setItem','localStorage.getItem','MY TICKETS','SELL TO BID','renderExchange','renderTicket','ticketMarket'];
for(const n of needles){let i=0,count=0;console.log('\n===',n,'===');while((i=s.indexOf(n,i))>=0&&count<8){console.log(s.slice(Math.max(0,i-500),Math.min(s.length,i+900)).replace(/\s+/g,' '));i+=n.length;count++;}}
