const assert = require('assert');
const Module = require('module');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

// Fix 1: execute the actual requireAuth middleware with a recycled numeric id.
const realLoad = Module._load;
const fakeDb = {
  prepare(sql) {
    if (/SELECT id, email FROM users WHERE id = \?/i.test(sql)) {
      return { get(id) { return Number(id) === 1 ? { id:1, email:'prototype@sbc.test' } : undefined; } };
    }
    if (/SELECT \* FROM accounts WHERE user_id = \?/i.test(sql)) {
      return { get(id) { return Number(id) === 1 ? { id:11, user_id:1, stonk_balance:0 } : undefined; } };
    }
    if (/SELECT id FROM users WHERE id = \?/i.test(sql)) {
      return { get(id) { return Number(id) === 1 ? { id:1 } : undefined; } };
    }
    if (/INSERT INTO accounts/i.test(sql)) {
      return { run() { throw new Error('existing account must not be reprovisioned'); } };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
};

Module._load = function(request, parent) {
  if (parent && /server[\\/]middleware[\\/]requireAuth\.js$/.test(parent.filename)) {
    if (request === '../db') return fakeDb;
    if (request === '../auth') return { verify(token) {
      if (token === 'matching') return { userId:1, email:'prototype@sbc.test' };
      if (token === 'stale') return { userId:1, email:'old-user@example.com' };
      return null;
    }};
  }
  return realLoad.apply(this, arguments);
};

function runMiddleware(requireAuth, token) {
  let statusCode = null, body = null, nextCalled = false;
  const req = { headers:{ authorization:`Bearer ${token}` } };
  const res = { status(code){ statusCode=code; return this; }, json(v){ body=v; return v; } };
  requireAuth(req, res, () => { nextCalled = true; });
  return { req, statusCode, body, nextCalled };
}

try {
  const middlewareFile = path.join(__dirname, 'middleware', 'requireAuth.js');
  delete require.cache[require.resolve(middlewareFile)];
  const requireAuth = require(middlewareFile);
  const stale = runMiddleware(requireAuth, 'stale');
  assert.equal(stale.statusCode, 401, 'recycled userId with wrong token email must be rejected');
  assert.equal(stale.nextCalled, false);
  const matching = runMiddleware(requireAuth, 'matching');
  assert.equal(matching.statusCode, null);
  assert.equal(matching.nextCalled, true, 'matching userId + email must remain authenticated');
  assert.equal(matching.req.account.id, 11);
} finally {
  Module._load = realLoad;
}

// Fix 2: execute pure helpers from the actual production leaderboard module.
const leaderboardCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'v45-leaderboard-v30.js'), 'utf8');
const context = {
  window:{},
  document:{ readyState:'loading', addEventListener(){}, documentElement:{} },
  MutationObserver: class { observe(){} },
  localStorage:{ getItem(){ return ''; } },
  fetch(){ throw new Error('fetch should not run while loading pure helpers'); },
  setTimeout(){}, clearTimeout(){}, console,
};
context.window.window = context.window;
vm.runInNewContext(leaderboardCode, context, { filename:'v45-leaderboard-v30.js' });
const truth = context.window.SBCLeaderboardTruthV1;
assert(truth, 'production leaderboard truth helpers must be exported');

const source = truth.pickSource({satellites:[
  {id:10,tierId:'morning',priceLevel:'runner'},
  {id:11,tierId:'morning',priceLevel:'low'},
  {id:12,tierId:'weekly_qualifier',priceLevel:'low'},
]}, 'clerk', 'morning', 'Morning Market');
assert.equal(source.id, 11, 'Clerk Morning must select the real morning/low backend source');

const noEntryRows = truth.truthRows({rows:[
  {rank:1,displayName:'Alpha',pl:500,isMine:false},
  {rank:2,displayName:'Beta',pl:190,isMine:false},
]});
assert.equal(noEntryRows.some(r=>r.you), false, 'no real backend entry means no YOU row');

const mineRows = truth.truthRows({rows:[
  {rank:1,displayName:'Alpha',pl:500,isMine:false},
  {rank:2,displayName:'Prototype Trader',pl:190,isMine:true,portfolioId:77},
]});
const mine = mineRows.find(r=>r.you);
assert(mine, 'real backend isMine row must become YOU');
assert.equal(mine.rank, 2);
assert.equal(mine.pl, 190);
assert.equal(mine.portfolio, 100190);
assert.equal(mine.portfolioId, 77);

console.log('Session Identity + Leaderboard Truthfulness: PASS');
console.log('Stale recycled-id token -> 401; real backend entry alone controls YOU/Find Me identity.');
