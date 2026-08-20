const fs=require('fs');
const js=fs.readFileSync('public/v45-desktop-stage49-v54.js','utf8');
const css=fs.readFileSync('public/v45-desktop-stage49-v54.css','utf8');
const pre=fs.readFileSync('public/v45-desktop-stage46-v51-pre.js','utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
const stage51=pre.includes('/v45-desktop-stage51-v55.js?v=55');
if(stage51){
  must(pre.includes('window.__sbcDesktopStage49V54=true'),'Stage 49 runtime is explicitly retired by Stage 51');
  must(!pre.includes('/v45-desktop-stage49-v54.js?v=54'),'retired Stage 49 JS is not bootstrapped');
  must(pre.includes('/v45-desktop-stage51-v55.css?v=55')&&pre.includes('/v45-desktop-stage51-v55.js?v=55'),'Stage 51 replaces Stage 49 header behavior');
  console.log('Stage 49 validator passed via Stage 51 supersession');
}else{
  must(js.includes('action.classList.add(\'stage49-live-control-v54\')')&&js.includes('cell.appendChild(action)'),'real existing action node is physically rehomed');
  must(js.includes("$$('.stage48-analytics-proxy-v53',slot).forEach(x=>x.remove())"),'Stage 48 proxy buttons are removed');
  must(!js.includes('original.click()'),'Stage 49 does not use proxy click indirection');
  must(css.includes('.stage49-original-shell-v54{display:none!important}'),'old lower analytics shells are retired from presentation');
  must(css.includes('height:54px!important'),'real header controls remain compact');
  must(pre.includes('/v45-desktop-stage49-v54.css?v=54')&&pre.includes('/v45-desktop-stage49-v54.js?v=54'),'Stage 49 assets bootstrap through served shell');
  console.log('Stage 49 real analytics controls validation passed');
}