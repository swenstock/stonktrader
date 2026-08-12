const express = require("express");
const router = express.Router();
const db = require("../db");
const { getQuote } = require("../dataProvider");
const requireAuth = require("../middleware/requireAuth");

router.post("/", requireAuth, (req, res) => {
  const { symbol, side, quantity } = req.body || {};
  if (!symbol || !["buy", "sell"].includes(side) || !quantity || quantity <= 0) {
    return res
      .status(400)
      .json({ error: "symbol, side ('buy'|'sell'), and a positive quantity are required" });
  }

  const quote = getQuote(symbol);
  if (!quote) return res.status(404).json({ error: "Unknown symbol" });

  const accountId = req.account.id;
  const cost = quote.price * quantity;

  // All-or-nothing so a crash mid-trade can never leave cash and positions
  // out of sync — this is the part that matters once real money-equivalent
  // value (STONK-denominated entries, prize eligibility) rides on the numbers.
  // node:sqlite has no built-in transaction() helper (unlike better-sqlite3),
  // so this is done manually with BEGIN/COMMIT/ROLLBACK.
  try {
    db.exec("BEGIN");

    const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId);
    const position = db
      .prepare("SELECT * FROM positions WHERE account_id = ? AND symbol = ?")
      .get(accountId, symbol);

    if (side === "buy") {
      if (cost > account.cash_balance) throw new Error("INSUFFICIENT_CASH");
      db.prepare("UPDATE accounts SET cash_balance = cash_balance - ? WHERE id = ?").run(
        cost,
        accountId
      );
      if (position) {
        const newQty = position.quantity + quantity;
        const newAvg = (position.avg_cost * position.quantity + cost) / newQty;
        db.prepare("UPDATE positions SET quantity = ?, avg_cost = ? WHERE id = ?").run(
          newQty,
          newAvg,
          position.id
        );
      } else {
        db.prepare(
          "INSERT INTO positions (account_id, symbol, quantity, avg_cost) VALUES (?, ?, ?, ?)"
        ).run(accountId, symbol, quantity, quote.price);
      }
    } else {
      if (!position || position.quantity < quantity) throw new Error("INSUFFICIENT_SHARES");
      db.prepare("UPDATE accounts SET cash_balance = cash_balance + ? WHERE id = ?").run(
        cost,
        accountId
      );
      db.prepare("UPDATE positions SET quantity = quantity - ? WHERE id = ?").run(
        quantity,
        position.id
      );
    }

    db.prepare(
      "INSERT INTO trades (account_id, symbol, side, quantity, price) VALUES (?, ?, ?, ?, ?)"
    ).run(accountId, symbol, side, quantity, quote.price);

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    if (e.message === "INSUFFICIENT_CASH") return res.status(400).json({ error: "Not enough cash" });
    if (e.message === "INSUFFICIENT_SHARES")
      return res.status(400).json({ error: "You don't own enough shares to sell that many" });
    throw e;
  }

  res.json({ ok: true, symbol, side, quantity, price: quote.price });
});

router.get("/history", requireAuth, (req, res) => {
  const trades = db
    .prepare("SELECT symbol, side, quantity, price, timestamp FROM trades WHERE account_id = ? ORDER BY timestamp DESC LIMIT 100")
    .all(req.account.id);
  res.json(trades);
});

module.exports = router;
