const { verify } = require("../auth");
const db = require("../db");

function accountForUserId(userId) {
  let account = db.prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY id ASC LIMIT 1").get(userId);
  if (account) return account;

  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) return null;

  // A valid authenticated user must always have a backend account. Legacy
  // users created before account provisioning was enforced are repaired here
  // with a zero STONK balance. No grant, prize, credit, or ledger movement is
  // created by this repair.
  db.prepare("INSERT INTO accounts (user_id, stonk_balance) VALUES (?, 0)").run(userId);
  return db.prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY id ASC LIMIT 1").get(userId) || null;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = verify(token);
  if (!payload) return res.status(401).json({ error: "Not authenticated" });

  const account = accountForUserId(payload.userId);
  if (!account) return res.status(404).json({ error: "Account not found" });

  req.user = payload;
  req.account = account;
  next();
}

module.exports = requireAuth;
module.exports.accountForUserId = accountForUserId;
