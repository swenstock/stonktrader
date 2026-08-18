const { exactV45Shell } = require('../server/v45ExactShell');
const html = exactV45Shell.toString('utf8');
const needles = [
  'mobile-bottom-nav','showView(','view-portfolio','trade-layout','chart-trade-card','portfolioHoldings','queuedOrders','tradeHistory','leader-table','leader-details','ticket-market-grid','ticketOrderModal','bidOrderModal','sellChoiceModal','tradeReviewModal','tradeSuccessModal','tradeSettingsModal','allocationModal','WebSocket','new WebSocket','onclose','onopen'
];
for (const needle of needles) {
  let from=0, hit=0;
  while(true){
    const i=html.indexOf(needle,from); if(i<0) break;
    hit++;
    const a=Math.max(0,i-900), b=Math.min(html.length,i+1800);
    console.log(`\n===== ${needle} #${hit} @ ${i} =====\n${html.slice(a,b).replace(/\n{3,}/g,'\n\n')}`);
    from=i+needle.length;
    if(hit>=5) break;
  }
}
