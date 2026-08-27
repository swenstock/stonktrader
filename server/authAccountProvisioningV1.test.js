const assert = require('assert');
const Module = require('module');
const path = require('path');

const realLoad = Module._load;
let accounts = [];
const users = new Set([7]);
let insertCount = 0;

const fakeDb = {
  prepare(sql) {
    if (/SELECT \* FROM accounts WHERE user_id = \?/i.test(sql)) {
      return { get(userId) { return accounts.find(a => a.user_id === userId) || undefined; } };
    }
    if (/SELECT id FROM users WHERE id = \?/i.test(sql)) {
      return { get(userId) { return users.has(userId) ? { id:userId } : undefined; } };
    }
    if (/INSERT INTO accounts \(user_id, stonk_balance\) VALUES \(\?, 0\)/i.test(sql)) {
      return { run(userId) { insertCount++; accounts.push({ id:100 + insertCount, user_id:userId, stonk_balance:0 }); return { lastInsertRowid:100 + insertCount }; } };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
};

Module._load = function(request, parent, isMain) {
  if (parent && /server[\\/]middleware[\\/]requireAuth\.js$/.test(parent.filename)) {
    if (request === '../db') return fakeDb;
    if (request === '../auth') return { verify(token) { return token === 'valid' ? { userId:7, email:'x@example.com' } : null; } };
  }
  return realLoad.apply(this, arguments);
};

try {
  const file = path.join(__dirname, 'middleware', 'requireAuth.js');
  delete require.cache[require.resolve(file)];
  const requireAuth = require(file);

  function run(token) {
    let statusCode = null, body = null, nextCalled = false;
    const req = { headers:{ authorization: token ? `Bearer ${token}` : '' } };
    const res = { status(code){ statusCode=code; return this; }, json(value){ body=value; return value; } };
    requireAuth(req, res, () => { nextCalled = true; });
    return { req, statusCode, body, nextCalled };
  }

  const first = run('valid');
  assert.equal(first.nextCalled, true, 'valid legacy user should be admitted');
  assert.equal(first.req.account.user_id, 7);
  assert.equal(first.req.account.stonk_balance, 0, 'repair must grant zero STONK');
  assert.equal(insertCount, 1, 'missing account should be provisioned exactly once');

  const second = run('valid');
  assert.equal(second.nextCalled, true);
  assert.equal(insertCount, 1, 'existing repaired account must be reused, not duplicated');

  const bad = run('invalid');
  assert.equal(bad.statusCode, 401);
  assert.equal(bad.nextCalled, false);
  assert.equal(insertCount, 1, 'invalid auth must never provision an account');

  const orphan = requireAuth.accountForUserId(999);
  assert.equal(orphan, null, 'nonexistent user must not be provisioned');
  assert.equal(insertCount, 1);

  console.log('Auth Account Provisioning V1: PASS');
  console.log('Valid legacy users self-heal to exactly one zero-balance backend account; invalid/orphan users do not provision.');
} finally {
  Module._load = realLoad;
}
