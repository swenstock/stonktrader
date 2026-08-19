const fs=require('fs');
const js=fs.readFileSync('public/v45-desktop-stage51-v55.js','utf8');
const css=fs.readFileSync('public/v45-desktop-stage51-v55.css','utf8');
const pre=fs.readFileSync('public/v45-desktop-stage46-v51-pre.js','utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(pre.includes('window.__sbcDesktopStage47V52=true')&&pre.includes('window.__sbcDesktopStage48V53=true')&&pre.includes('window.__sbcDesktopStage49V54=true'),'retired analytics runtimes are pre-locked');
must(!pre.includes('/v45-desktop-stage47-v52.js')&&!pre.includes('/v45-desktop-stage48-v53.js')&&!pre.includes('/v45-desktop-stage49-v54.js'),'retired analytics JS is not bootstrapped');
must(pre.includes('/v45-desktop-stage51-v55.css?v=55')&&pre.includes('/v45-desktop-stage51-v55.js?v=55'),'Stage 51 assets are bootstrapped');
must(js.includes("label:'PORTFOLIO ANALYTICS'")&&js.includes("label:'ADVANCED PERFORMANCE CHARTS'"),'both requested header controls exist');
must(js.includes('stage51-scan-guard-v55')&&js.includes("g.textContent='\\u200B'"),'Stage 43 text scanner guard is present');
must(js.includes("b.onclick=()=>openModal(kind)")&&js.includes('expandNative(card)'),'header cards are clickable and open live analytics content');
must(css.includes('.stage51-analysis-card-v55')&&css.includes('height:54px!important'),'analytics controls are hard-capped compact cards');
must(css.includes('.stage43-analysis-bottom-v48')&&css.includes('display:none!important'),'old bottom analytics launcher area is retired');
console.log('Stage 51 header analytics validation passed');