const express = require("express");
const router = express.Router();
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { CONFIG, currentWeekWindow, isWeekday, currentStonkUsdPriceMicros } = require("../contestScheduler");

function stonkToUsd(stonkAmount) {
  return Number(((stonkAmount * currentStonkUsdPriceMicros()) / 1e6).toFixed(2));
}
const { createPortfolio } = require("../portfolioValue");

function serializeContest(c, myAccountId) {
  const entrantCount = db
    .prepare("SELECT COUNT(*) as n FROM contest_entries WHERE contest_id = ?")
    .get(c.id).n;
  const grossPool = c.status === "open" ? entrantCount * c.entry_fee : c.pool_gross;
  const playerPool = grossPool * 0.85;
  const brokersProjected = Math.floor(playerPool / c.broker_unit_cost);
  const remainderProjected = c.status === "open" ? playerPool - brokersProjected * c.broker_unit_cost : c.remainder_stonk;

  const myEntryCount = myAccountId
    ? db.prepare("SELECT COUNT(*) as n FROM contest_entries WHERE contest_id = ? AND account_id = ?").get(c.id, myAccountId).n
    : 0;
  const myFirstEntry = myAccountId
    ? db.prepare("SELECT * FROM contest_entries WHERE contest_id = ? AND account_id = ? ORDER BY id ASC LIMIT 1").get(c.id, myAccountId)
    : null;
  const myTickets = myAccountId
    ? db.prepare("SELECT COUNT(*) as n FROM tickets WHERE account_id = ? AND status = 'unredeemed'").get(myAccountId).n
    : 0;

  return {
    id: c.id,
    weekStart: c.week_start,
    weekEnd: c.week_end,
    entryFee: c.entry_fee,
    entryFeeUsd: stonkToUsd(c.entry_fee),
    brokerUnitCost: c.broker_unit_cost,
    status: c.status,
    entrantCount,
    poolGross: grossPool,
    brokersProjected: c.status === "open" ? brokersProjected : c.brokers_funded,
    brokersFunded: c.brokers_funded,
    remainderProjected: Math.round(remainderProjected || 0),
    remainderStonk: c.remainder_stonk,
    remainderDisplayName: c.remainder_display_name,
    joined: myEntryCount > 0,
    myEntryCount,
    maxEntriesPerAccount: CONFIG.maxEntriesPerAccount,
    myPortfolioId: myFirstEntry ? myFirstEntry.portfolio_id : null,
    myUnredeemedTickets: myTickets,
  };
}

router.get("/", (req, res) => {
  let myAccountId = null;
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    const { verify } = require("../auth");
    const payload = verify(header.slice(7));
    if (payload) {
      const account = db.prepare("SELECT id FROM accounts WHERE user_id = ?").get(payload.userId);
      if (account) myAccountId = account.id;
    }
  }

  const current = db.prepare("SELECT * FROM contests WHERE status = 'open'").get();
  const history = db
    .prepare("SELECT * FROM contests WHERE status = 'resolved' ORDER BY resolved_at DESC LIMIT 30")
    .all()
    .map((c) => serializeContest(c, myAccountId));

  let nextOpensAt = null;
  if (!current && !isWeekday(new Date())) {
    const { weekStart } = currentWeekWindow(new Date());
    nextOpensAt = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  res.json({
    current: current ? serializeContest(current, myAccountId) : null,
    nextOpensAt,
    config: { entryFee: CONFIG.entryFee, brokerUnitCost: CONFIG.brokerUnitCost },
    history,
  });
});

router.get("/:id/results", (req, res) => {
  const results = db
    .prepare(
      `SELECT contest_results.rank, contest_results.pl, contest_results.prize_type, contest_results.prize_amount,
       users.display_name
       FROM contest_results
       JOIN accounts ON accounts.id = contest_results.account_id
       JOIN users ON users.id = accounts.user_id
       WHERE contest_id = ? ORDER BY rank ASC LIMIT 100`
    )
    .all(req.params.id);
  res.json(results);
});

router.post("/:id/enter", requireAuth, (req, res) => {
  const contest = db.prepare("SELECT * FROM contests WHERE id = ?").get(req.params.id);
  if (!contest) return res.status(404).json({ error: "Main Event not found" });
  if (contest.status !== "open") return res.status(400).json({ error: "This week's Main Event is closed" });

  const existingCount = db
    .prepare("SELECT COUNT(*) as n FROM contest_entries WHERE contest_id = ? AND account_id = ?")
    .get(contest.id, req.account.id).n;
  if (existingCount >= CONFIG.maxEntriesPerAccount) {
    return res.status(400).json({ error: `You've reached the max of ${CONFIG.maxEntriesPerAccount} entries for this week's Main Event` });
  }

  const useTicket = !!req.body?.useTicket;
  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.account.id);
  const label = `Main Event · Week of ${new Date(contest.week_start).toLocaleDateString()}${existingCount > 0 ? ` (Entry ${existingCount + 1})` : ""}`;

  if (useTicket) {
    const ticket = db
      .prepare("SELECT * FROM tickets WHERE account_id = ? AND status = 'unredeemed' ORDER BY created_at ASC LIMIT 1")
      .get(account.id);
    if (!ticket) return res.status(400).json({ error: "You don't have an unredeemed ticket" });

    const portfolioId = createPortfolio(account.id, label);
    db.exec("BEGIN");
    db.prepare(
      "INSERT INTO contest_entries (contest_id, account_id, portfolio_id, entry_fee_paid, paid_with_ticket_id) VALUES (?, ?, ?, ?, ?)"
    ).run(contest.id, account.id, portfolioId, contest.entry_fee, ticket.id);
    db.prepare(
      "UPDATE tickets SET status = 'applied', applied_to_contest_id = ?, applied_at = ? WHERE id = ?"
    ).run(contest.id, new Date().toISOString(), ticket.id);
    db.exec("COMMIT");
    return res.json({ ok: true, contestId: contest.id, portfolioId, paidWithTicket: true });
  }

  if (account.stonk_balance < contest.entry_fee) {
    return res.status(400).json({ error: "Not enough STONK to enter" });
  }

  const portfolioId = createPortfolio(account.id, label);
  db.exec("BEGIN");
  db.prepare("UPDATE accounts SET stonk_balance = stonk_balance - ? WHERE id = ?").run(
    contest.entry_fee,
    account.id
  );
  db.prepare(
    "INSERT INTO contest_entries (contest_id, account_id, portfolio_id, entry_fee_paid) VALUES (?, ?, ?, ?)"
  ).run(contest.id, account.id, portfolioId, contest.entry_fee);
  db.exec("COMMIT");

  res.json({ ok: true, contestId: contest.id, portfolioId, entryFeePaid: contest.entry_fee, paidWithTicket: false });
});

module.exports = router;
