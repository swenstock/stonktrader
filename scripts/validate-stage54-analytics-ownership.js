const fs=require('fs');
const js=fs.readFileSync('public/v45-desktop-stage43-v48.js','utf8');
const must=(ok,msg)=>{if(!ok){console.error('FAIL:',msg);process.exit(1)}else console.log('PASS:',msg)};
must(js.includes(".stage51-header-strip-v55,.stage51-modal-v55,.stage51-native-stash-v55,[data-stage51-source]"),'Stage43 excludes all Stage51-owned analytics UI');
must(js.includes('if(stage51Owned(x))return false'),'Stage43 analytics scan short-circuits Stage51-owned nodes');
must(js.includes('chartControls();priceWindow();layoutCleanup();enlargeBasket();'),'Stage43 chart/order enhancement pipeline remains intact');
must(!/stage54.*wheel|stage54.*pointermove|stage54.*touchmove/i.test(js),'Stage54 adds no chart gesture handlers');
console.log('Stage 54 analytics ownership validation complete.');
