const fs=require('fs');
const js=fs.readFileSync('public/v45-desktop-stage48-v53.js','utf8');
const css=fs.readFileSync('public/v45-desktop-stage48-v53.css','utf8');
const pre=fs.readFileSync('public/v45-desktop-stage46-v51-pre.js','utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
const stage51=/\/v45-desktop-stage51-v55\.js\?v=(55|57|60|62)/.test(pre);
if(stage51){
  must(pre.includes('window.__sbcDesktopStage48V53=true'),'Stage 48 runtime is explicitly retired by Stage 51');
  must(!pre.includes('/v45-desktop-stage48-v53.js?v=53'),'retired Stage 48 JS is not bootstrapped');
  must(pre.includes('/v45-desktop-stage51-v55.css?v=55')&&/\/v45-desktop-stage51-v55\.js\?v=(55|57|60|62)/.test(pre),'Stage 51 replaces Stage 48 header behavior');
  console.log('Stage 48 validator passed via Stage 51 supersession');
}else{
  must(js.includes('stage48-analytics-proxy-v53'),'compact proxy cards exist');
  must(js.includes('Undo Stage 47\'s physical reparenting'),'full analytics containers are moved back out of KPI strip');
  must(css.includes('height:54px!important')&&css.includes('max-height:54px!important'),'header analytics cards are hard-capped to compact height');
  must(css.includes('.stage48-original-analysis-v53{display:none!important}'),'full analytics containers are hidden from header presentation');
  must(pre.includes('/v45-desktop-stage48-v53.css?v=53')&&pre.includes('/v45-desktop-stage48-v53.js?v=53'),'Stage 48 assets bootstrap through served Stage 46 prelock');
  console.log('Stage 48 compact header analytics validation passed');
}