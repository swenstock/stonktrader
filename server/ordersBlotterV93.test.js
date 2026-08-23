const fs = require('fs');
const assert = require('assert');

const ui = fs.readFileSync(require.resolve('../public/v45-advanced-orders-v15.js'), 'utf8');
const route = fs.readFileSync(require.resolve('./routes/advancedOrdersV15.js'), 'utf8');

assert(ui.includes('data-blotter-tab="queued"'), 'Queue tab missing');
assert(ui.includes('data-blotter-tab="working"'), 'Working Orders tab missing');
assert(ui.includes('data-blotter-tab="recent"'), 'Recent Activity tab missing');
assert(ui.includes('data-blotter-tab="fills"'), 'Fills tab missing');
assert(ui.includes("o.status==='pending'&&String(o.orderType)==='market'"), 'Queue must be pending market orders only');
assert(ui.includes("o.status==='pending'&&String(o.orderType)!=='market'"), 'Working must be pending advanced orders only');
assert(ui.includes('BUY') || ui.includes('side'), 'Side text renderer missing');
assert(!ui.includes("icon=x.side==='BUY'?'▲':'▼'"), 'Legacy up/down arrow renderer must not own this blotter');
assert(ui.includes('REPLACE</button>') && ui.includes('CANCEL</button>'), 'Working cancel/replace controls missing');
assert(ui.includes("status:'FILLED'"), 'Fill status rendering missing');
assert(ui.includes('PLACED / WORKING') && ui.includes("status:'CANCELLED'") && ui.includes("status:'TRIGGERED'"), 'Recent Activity lifecycle states missing');

assert(route.includes("router.patch('/:id'"), 'Cancel/replace backend route missing');
assert(route.includes("order_type || 'market'"), 'Unified market/advanced order DTO missing');
assert(route.includes("status='cancelled', cancelled_at=CURRENT_TIMESTAMP"), 'Cancellation audit timestamp missing');
assert(route.includes('replaced_at=CURRENT_TIMESTAMP'), 'Replace audit timestamp missing');

console.log('Stage93 Orders & Activity blotter acceptance: PASS');
