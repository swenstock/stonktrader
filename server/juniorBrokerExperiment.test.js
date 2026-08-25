const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../public/junior/index.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../public/junior/junior-current.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/junior/junior-current.css'), 'utf8');

// The Junior route must inherit the actual current production shell at runtime,
// never copy the old static /v45 app again.
assert.ok(html.includes("fetch('/?jr-shell-source=1'"), 'Junior route must load current production root shell');
assert.ok(html.includes('<base href="/">'), 'current shell must keep production-relative asset resolution');
assert.ok(html.includes('/junior/junior-current.css'), 'Junior styling must be additive');
assert.ok(html.includes('/junior/junior-current.js'), 'Junior behavior must be additive');
assert.ok(!html.includes('../v45/v45.css'), 'must not use stale static V45 shell styling');
assert.ok(!html.includes('../v45/v45.js'), 'must not use stale static V45 app engine');
assert.ok(!html.includes('hero-grid'), 'Junior loader must not duplicate/replace current hero structure');
assert.ok(!html.includes('broker-art'), 'Junior loader must not replace current broker art');

// Economics represented by the additive lab.
assert.ok(js.includes('const JR_UNIT = 40000'));
assert.ok(js.includes('const JR_PER_BROKER = 20'));
assert.ok(js.includes('const BROKER_COST = 733332'));
assert.ok(js.includes('20 JR'));
assert.ok(js.includes('40,000 STONK'));
assert.ok(js.includes('Redeemed Juniors return to the SBC clearinghouse inventory'));
assert.ok(js.includes("fetch('/api/economics'"), 'projection should use existing live economics data');

const reserve = 40000 * 20 - 733332;
assert.strictEqual(reserve, 66668);

// Overlay is intentionally self-contained and must not restyle existing SBC elements.
assert.ok(css.includes('#sbcJuniorLab'));
assert.ok(!css.includes('.hero-card'));
assert.ok(!css.includes('.topbar'));
assert.ok(!css.includes('body{'));

console.log('Junior Broker current-shell inheritance + isolated overlay contract: PASS');
