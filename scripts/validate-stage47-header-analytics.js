const fs=require('fs');
const js=fs.readFileSync('public/v45-desktop-stage47-v52.js','utf8');
const css=fs.readFileSync('public/v45-desktop-stage47-v52.css','utf8');
const pre=fs.readFileSync('public/v45-desktop-stage46-v51-pre.js','utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
const stage51=/\/v45-desktop-stage51-v55\.js\?v=(55|57|60|62)/.test(pre);
if(stage51){
  must(pre.includes('window.__sbcDesktopStage47V52=true'),'Stage 47 runtime is explicitly retired by Stage 51');
  must(!pre.includes('/v45-desktop-stage47-v52.js?v=52'),'retired Stage 47 JS is not bootstrapped');
  must(pre.includes('/v45-desktop-stage51-v55.css?v=55'),'Stage 51 owns the replacement header presentation');
  must(pre.includes('window.__sbcDesktopStage44V49=true'),'Stage46 chart gesture lock remains intact');
  console.log('Stage 47 validator passed via Stage 51 supersession');
}else{
  must(js.includes("matchMedia('(min-width:901px)')"),'Stage 47 remains desktop-only');
  must(js.includes(".contest-metrics-strip-v46")&&js.includes('stage47-analysis-strip-v52'),'analytics targets the portfolio KPI strip');
  must(js.includes('PORTFOLIO ANALYTICS')&&js.includes('ADVANCED PERFORMANCE CHARTS'),'both requested analysis cards have robust text fallback');
  must(js.includes("slot.appendChild(c)"),'analysis cards are physically rehomed into the header strip');
  must(css.includes('grid-template-columns:minmax(142px,1fr) minmax(142px,1fr) minmax(142px,1fr) minmax(420px,3.25fr)'),'desktop header uses three compact KPIs plus wide analytics region');
  must(css.includes('.stage47-analysis-strip-v52{grid-column:4')&&css.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)'),'two analysis cards share the right side of the same row');
  must(css.includes('.stage47-retired-analysis-bottom-v52{display:none!important}'),'obsolete bottom analysis container is retired');
  must(pre.includes('/v45-desktop-stage47-v52.css?v=52')&&pre.includes('/v45-desktop-stage47-v52.js?v=52'),'already-served Stage46 prelock bootstraps both Stage47 assets');
  must(pre.includes('window.__sbcDesktopStage44V49=true'),'Stage46 chart gesture lock remains intact');
  console.log('Stage 47 header analytics validation passed');
}