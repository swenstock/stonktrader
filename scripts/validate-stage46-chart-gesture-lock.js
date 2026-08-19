const fs=require('fs');
const js=fs.readFileSync('public/v45-desktop-stage45-v50.js','utf8');
const css=fs.readFileSync('public/v45-desktop-stage45-v50.css','utf8');
function must(cond,msg){if(!cond){console.error('FAIL:',msg);process.exit(1)}}
must(js.includes('isolateViewport'),'Stage45 must isolate/clone the live chart viewport to remove legacy listeners');
must(js.includes("cloneNode(true)"),'viewport isolation must clone the node');
must(js.includes("v.replaceWith(clone)"),'old listener-bearing viewport must be replaced');
must(js.includes("e.preventDefault();e.stopPropagation();st.wheel+=e.deltaY"),'wheel gestures must be contained inside chart');
must(js.includes("Math.abs(st.wheel)<90"),'wheel zoom must remain thresholded/stable');
must(!js.includes('anchor='),'pointer-anchored chart recentering must stay retired');
must(css.includes('overscroll-behavior:contain'),'chart viewport must contain overscroll');
must(css.includes('grid-template-columns:minmax(0,1fr) minmax(460px,520px)'),'chart/OE split must reserve a capped OE column and give chart the remaining width');
must(css.includes('.symbol-chart canvas')&&css.includes('width:100%!important'),'actual chart surface must fill its chart column');
must(css.includes('height:auto!important'),'chart surface must preserve aspect ratio');
console.log('Stage 46 chart gesture lock validation passed');
