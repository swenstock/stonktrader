const fs=require('fs'),path=require('path');
const {exactV45Shell}=require('../server/v45ExactShell');
const html=exactV45Shell.toString('utf8');
const js=fs.readFileSync(path.join(__dirname,'..','public','v45-mobile-v7.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','v45-mobile-v7.css'),'utf8');
const boot=fs.readFileSync(path.join(__dirname,'..','public','v45-mobile-v4.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(html.includes('view-my')&&html.includes('myContestList'),'exact V45 shell contains My Contests view/list');
must(html.toUpperCase().includes('MY CONTESTS'),'exact V45 shell contains native My Contests control/copy');
must(js.includes('nativeMyControl')&&js.includes('hydrateMyContests')&&js.includes('myHasContent'),'mobile layer restores native My Contests content instead of drawing a fake replacement');
must(js.includes('[data-mobile-view-v5="my"]')&&js.includes('native.click()'),'mobile My Contests tab triggers native hydration path');
must(js.includes('renderMyContests')&&js.includes('renderMCList'),'My Contests hydration has guarded native render fallbacks');
must(js.includes('HOW_DETAILS')&&js.includes('YOU START WITH')&&js.includes('YOUR TICKET, YOUR CALL')&&js.includes('REACH THE MAIN EVENT'),'How It Works has richer four-step teaching copy');
must(js.includes('SWIPE →')&&js.includes('mobile-how-detail-v7'),'How It Works keeps swipe affordance and added detail panels');
must(css.includes('min-height:500px')&&css.includes('.mobile-how-detail-v7'),'How It Works intentionally uses the existing vertical space');
must(css.includes('#view-my')&&css.includes('min-height:calc(100dvh - 150px)'),'My Contests mobile view is given a full usable content area');
must(boot.includes('/v45-mobile-v7.css?v=7')&&boot.includes('/v45-mobile-v7.js?v=7'),'served mobile bootstrap loads Stage 36 assets');
console.log('Stage 36 mobile checks passed.');