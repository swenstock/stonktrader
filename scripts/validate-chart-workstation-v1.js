const fs=require('fs');
const js=fs.readFileSync('public/v45-chart-workstation-v1.js','utf8');
const css=fs.readFileSync('public/v45-chart-workstation-v1.css','utf8');
const pre=fs.readFileSync('public/v45-desktop-stage46-v51-pre.js','utf8');
function must(v,m){if(!v){console.error('FAIL:',m);process.exit(1)}}
must(!js.includes('MutationObserver'),'chart workstation must not add a MutationObserver');
must(!js.includes('setInterval('),'chart workstation must not add a polling loop');
must(js.includes("['TICK','1m','5m','15m','1h','1D']"),'timeframe strip missing');
must(js.includes('data-cw-indicator-search'),'searchable indicator menu missing');
must(js.includes('data-cw-tool="trend"')&&js.includes('data-cw-tool="hline"')&&js.includes('data-cw-tool="measure"'),'drawing tools missing');
must(js.includes("clickNative('CROSSHAIR')"),'crosshair must delegate to native chart control');
must(js.includes("$('[data-stage67-chart-expand]',c)?.click()"),'full screen must delegate to existing Stage67 expand owner');
must(js.includes("$('[data-v50-fit]',c)?.click()"),'fit must delegate to existing Stage45 chart owner');
must(css.includes('min-height:480px!important'),'default chart height must remain large');
must(css.includes('.chart-drawing-overlay-v1')&&css.includes('pointer-events:none'),'drawing overlay must yield to chart gestures when inactive');
must(pre.includes('/v45-chart-workstation-v1.css?v=1')&&pre.includes('/v45-chart-workstation-v1.js?v=1'),'desktop preloader must serve chart workstation assets');
console.log('Chart workstation v1 validation passed');