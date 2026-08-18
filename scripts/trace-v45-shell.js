const { exactV45Shell } = require('../server/v45ExactShell');
const s = exactV45Shell.toString('utf8');
const needles = [
  'function openSelectedMCPortfolio',
  'openSelectedMCPortfolio(',
  'MC_SELECTED_ENTRY',
  'function renderMyContests',
  'renderMyContests',
  'RULES',
  'showRules',
  'openRules',
  'MY CONTESTS',
  'switchView(',
  "showView('my'",
  'view-my'
];
for (const needle of needles) {
  let start = 0, count = 0;
  while (count < 4) {
    const i = s.indexOf(needle, start);
    if (i < 0) break;
    const a = Math.max(0, i - 1800), b = Math.min(s.length, i + 3200);
    console.log(`\n===== ${needle} @ ${i} =====\n${s.slice(a,b)}\n===== END =====`);
    start = i + needle.length; count++;
  }
}
