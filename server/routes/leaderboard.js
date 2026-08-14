const express = require("express");
const router = express.Router();
const db = require("../db");
const { totalValueForPortfolios } = require("../portfolioValue");

// Shared by GET /me (the logged-in user's own card) and GET
// /account/:id (viewing any OTHER trader's public career stats from a
// leaderboard drill-down) — same query, same numbers, one source of truth.
function computeLifetimeStats(accountId) {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) as contestsPlayed,
         SUM(CASE WHEN rank = 1 THEN 1 ELSE 0 END) as wins,
         SUM(CASE WHEN prize_type = 'broker' THEN 1 ELSE 0 END) as brokersWon,
         SUM(CASE WHEN prize_type = 'ticket' THEN 1 ELSE 0 END) as ticketsWon,
         SUM(pl) as lifetimePL
       FROM (
         SELECT account_id, rank, prize_type, pl FROM contest_results
         UNION ALL
         SELECT account_id, rank, prize_type, pl FROM satellite_results
       ) combined
       WHERE account_id = ?`
    )
    .get(accountId);

  return {
    contestsPlayed: row.contestsPlayed || 0,
    wins: row.wins || 0,
    brokersWon: row.brokersWon || 0,
    ticketsWon: row.ticketsWon || 0,
    lifetimePL: Number((row.lifetimePL || 0).toFixed(2)),
  };
}

// GET /api/leaderboard/recent-winners — archive of real prize winners
// (rank 1, prize_type != 'none') across recently resolved contests and
// satellites, most recent first.
router.get("/recent-winners", (req, res) => {
  const contestWinners = db
    .prepare(
      `SELECT 'contest' as type, contests.id as sourceId, 'Main Event' as name, contests.resolved_at as resolvedAt,
       contest_results.prize_type as prizeType, contest_results.prize_amount as prizeAmount, users.display_name as displayName
       FROM contest_results
       JOIN contests ON contests.id = contest_results.contest_id
       JOIN accounts ON accounts.id = contest_results.account_id
       JOIN users ON users.id = accounts.user_id
       WHERE contest_results.rank = 1 AND contest_results.prize_type != 'none' AND contests.status = 'resolved'`
    )
    .all();

  const satelliteWinners = db
    .prepare(
      `SELECT 'satellite' as type, satellites.id as sourceId, satellites.name as name, satellites.resolved_at as resolvedAt,
       satellite_results.prize_type as prizeType, satellite_results.prize_amount as prizeAmount, users.display_name as displayName
       FROM satellite_results
       JOIN satellites ON satellites.id = satellite_results.satellite_id
       JOIN accounts ON accounts.id = satellite_results.account_id
       JOIN users ON users.id = accounts.user_id
       WHERE satellite_results.rank = 1 AND satellite_results.prize_type != 'none' AND satellites.status = 'resolved'`
    )
    .all();

  const combined = [...contestWinners, ...satelliteWinners]
    .sort((a, b) => new Date(b.resolvedAt) - new Date(a.resolvedAt))
    .slice(0, 30);

  res.json(combined);
});

// GET /api/leaderboard/contest/:id — live ranking within one Main Event
// (works for both open and resolved contests)
router.get("/contest/:id", (req, res) => {
  const contest = db.prepare("SELECT * FROM contests WHERE id = ?").get(req.params.id);
  if (!contest) return res.status(404).json({ error: "Contest not found" });

  if (contest.status === "resolved") {
    const results = db
      .prepare(
        `SELECT contest_results.rank, contest_results.pl, contest_results.prize_type, contest_results.prize_amount, contest_results.account_id as accountId, users.display_name as displayName
         FROM contest_results JOIN accounts ON accounts.id = contest_results.account_id
         JOIN users ON users.id = accounts.user_id
         WHERE contest_id = ? ORDER BY rank ASC LIMIT 100`
      )
      .all(contest.id);
    return res.json(results);
  }

  const entries = db
    .prepare(
      `SELECT contest_entries.portfolio_id, contest_entries.account_id, users.display_name
       FROM contest_entries JOIN accounts ON accounts.id = contest_entries.account_id
       JOIN users ON users.id = accounts.user_id
       WHERE contest_id = ?`
    )
    .all(contest.id);
  const valueMap = totalValueForPortfolios(entries.map((e) => e.portfolio_id));
  const ranked = entries
    .map((e) => ({ displayName: e.display_name, accountId: e.account_id, pl: Number(((valueMap[e.portfolio_id] ?? 100000) - 100000).toFixed(2)) }))
    .sort((a, b) => b.pl - a.pl)
    .map((r, i) => ({ rank: i + 1, ...r }));
  res.json(ranked.slice(0, 100));
});

// GET /api/leaderboard/satellite/:id — same idea, for a satellite
router.get("/satellite/:id", (req, res) => {
  const satellite = db.prepare("SELECT * FROM satellites WHERE id = ?").get(req.params.id);
  if (!satellite) return res.status(404).json({ error: "Satellite not found" });

  if (satellite.status === "resolved") {
    const results = db
      .prepare(
        `SELECT satellite_results.rank, satellite_results.pl, satellite_results.prize_type, satellite_results.prize_amount, satellite_results.account_id as accountId, users.display_name as displayName
         FROM satellite_results JOIN accounts ON accounts.id = satellite_results.account_id
         JOIN users ON users.id = accounts.user_id
         WHERE satellite_id = ? ORDER BY rank ASC LIMIT 100`
      )
      .all(satellite.id);
    return res.json(results);
  }

  const entries = db
    .prepare(
      `SELECT satellite_entries.portfolio_id, satellite_entries.account_id, users.display_name
       FROM satellite_entries JOIN accounts ON accounts.id = satellite_entries.account_id
       JOIN users ON users.id = accounts.user_id
       WHERE satellite_id = ?`
    )
    .all(satellite.id);
  const valueMap = totalValueForPortfolios(entries.map((e) => e.portfolio_id));
  const ranked = entries
    .map((e) => ({ displayName: e.display_name, accountId: e.account_id, pl: Number(((valueMap[e.portfolio_id] ?? 100000) - 100000).toFixed(2)) }))
    .sort((a, b) => b.pl - a.pl)
    .map((r, i) => ({ rank: i + 1, ...r }));
  res.json(ranked.slice(0, 100));
});

// GET /api/leaderboard/lifetime — all-time trader stats, aggregated across
// every resolved Main Event and satellite a player has ever finished.
router.get("/lifetime", (req, res) => {
  const rows = db
    .prepare(
      `SELECT
         users.display_name,
         COUNT(*) as contestsPlayed,
         SUM(CASE WHEN rank = 1 THEN 1 ELSE 0 END) as wins,
         SUM(CASE WHEN prize_type = 'broker' THEN 1 ELSE 0 END) as brokersWon,
         SUM(pl) as lifetimePL
       FROM (
         SELECT account_id, rank, prize_type, pl FROM contest_results
         UNION ALL
         SELECT account_id, rank, CASE WHEN prize_type='ticket' THEN 'none' ELSE prize_type END, pl FROM satellite_results
       ) combined
       JOIN accounts ON accounts.id = combined.account_id
       JOIN users ON users.id = accounts.user_id
       GROUP BY combined.account_id
       ORDER BY lifetimePL DESC
       LIMIT 100`
    )
    .all();

  res.json(
    rows.map((r, i) => ({
      rank: i + 1,
      displayName: r.display_name,
      contestsPlayed: r.contestsPlayed,
      wins: r.wins,
      brokersWon: r.brokersWon,
      lifetimePL: Number((r.lifetimePL || 0).toFixed(2)),
    }))
  );
});

// GET /api/leaderboard/me — the logged-in user's own lifetime stats card
router.get("/me", (req, res) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "Not authenticated" });
  const { verify } = require("../auth");
  const payload = verify(header.slice(7));
  if (!payload) return res.status(401).json({ error: "Not authenticated" });
  const account = db.prepare("SELECT id FROM accounts WHERE user_id = ?").get(payload.userId);
  if (!account) return res.status(404).json({ error: "Account not found" });

  res.json(computeLifetimeStats(account.id));
});

// GET /api/leaderboard/account/:id — any trader's public career stats,
// for the "click a name on a leaderboard to see their lifetime record"
// drill-down. No auth required — this is public, same as the leaderboard
// itself; only P&L and win counts, nothing account-sensitive.
router.get("/account/:id", (req, res) => {
  const account = db
    .prepare(
      `SELECT accounts.id, users.display_name as displayName
       FROM accounts JOIN users ON users.id = accounts.user_id
       WHERE accounts.id = ?`
    )
    .get(req.params.id);
  if (!account) return res.status(404).json({ error: "Trader not found" });

  res.json({ displayName: account.displayName, ...computeLifetimeStats(account.id) });
});

module.exports = router;
