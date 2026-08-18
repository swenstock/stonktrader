const { exactV45Shell } = require('../server/v45ExactShell');
const html = exactV45Shell.toString('utf8');
const needles = ['ticketOrderModal','bidOrderModal','sellChoiceModal','marketTicketTitle','bidBook','askBook','ticketOrderPrice','bidOrderPrice'];
for (const needle of needles) {
  let from = 0, hit = 0;
  while (true) {
    const i = html.indexOf(needle, from);
    if (i < 0) break;
    hit++;
    const a = Math.max(0, i - 1400), b = Math.min(html.length, i + 2200);
    console.log(`\n===== ${needle} #${hit} @ ${i} =====\n` + html.slice(a,b).replace(/\n{3,}/g,'\n\n'));
    from = i + needle.length;
    if (hit >= 8) break;
  }
}
