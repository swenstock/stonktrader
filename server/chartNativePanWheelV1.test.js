const assert=require('assert');
const fs=require('fs');
const stage45=fs.readFileSync('public/v45-desktop-stage45-v50.js','utf8');

assert(stage45.includes("const factor=Math.exp(-e.deltaY*.0025)"),'plot wheel must continuously scale the time domain from every wheel event');
assert(stage45.includes("st.x=clamp(st.x*factor,.35,4)"),'time-axis wheel must support a materially compact view, not tiny stepped zoom');
assert(!stage45.includes("Math.abs(st.wheel)<90"),'time zoom must not wait for a 90-point wheel accumulator');
assert(stage45.includes('startResidual:0'),'pan state must retain fractional pixel residue between drags');
assert(stage45.includes('st.startResidual=st.dragPx'),'pointerdown must preserve the current fractional/future-space offset');
assert(stage45.includes('previewDrag(st.startResidual+e.clientX-st.startX)'),'drag preview must follow the pointer from the persistent residual position');
assert(stage45.includes('const combined=st.startPan*step+st.dragPx'),'release must combine whole-bar pan and pixel residue');
assert(stage45.includes('st.pan=Math.floor(combined/step)'),'positive movement must commit only whole candle widths into history pan');
assert(stage45.includes('st.dragPx=combined-st.pan*step'),'positive fractional movement must remain onscreen after release instead of snapping');
assert(stage45.includes('st.pan=0;st.dragPx=Math.max(-maxFuture,combined)'),'left-of-latest movement must persist as right-side future whitespace instead of clamping to zero');
assert(!stage45.includes('st.pan=Math.max(0,st.startPan+st.dragPx/step)'),'old snap-back release formula must be retired');
console.log('Native pan + wheel regression v1: PASS');
