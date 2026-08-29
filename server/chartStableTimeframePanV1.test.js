const assert=require('assert');
const fs=require('fs');
const stage45=fs.readFileSync('public/v45-desktop-stage45-v50.js','utf8');
const quoteBars=fs.readFileSync('server/routes/quoteBars.js','utf8');

assert(stage45.includes('function previewDrag(px){st.dragPx=px;repaint();}'),'drag preview must remain renderer-domain driven');
const repaintStart=stage45.indexOf('function repaint(){');
const repaintEnd=stage45.indexOf('function resetPrice',repaintStart);
const repaintBlock=stage45.slice(repaintStart,repaintEnd);
assert(!repaintBlock.includes('clearDragPreview()'),'repaint must not clear active drag preview state and snap the plot back');
assert(stage45.includes('st.pan=Math.max(0,st.startPan+st.dragPx/step)'),'pointer release must commit drag offset into historical pan');

assert(quoteBars.includes("minutes >= 570 && minutes < 960"),'intraday bars must be limited to the 09:30-16:00 ET regular session');
assert(quoteBars.includes("weekday !== 'Sat' && weekday !== 'Sun'"),'intraday bars must exclude weekends');
assert(quoteBars.includes("if (interval !== '1D') bars = bars.filter(isRegularSessionBar).slice(-count);"),'only intraday intervals should receive regular-session filtering');
assert(quoteBars.includes("const lookbackMultiplier = interval === '1D' ? 1 : 5;"),'intraday lookback must be widened before filtering so enough session bars remain');

console.log('Stable timeframe + pan regression v1: PASS');
