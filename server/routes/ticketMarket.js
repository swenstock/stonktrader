const express = require("express");
const router = express.Router();
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");

const PLATFORM_FEE_PCT = 0.05; // taken from the seller's proceeds on a successful sale

function serializeListing(l) {
  return {
    id: l.id,
    ticketId: l.ticket_id,
    askPrice: l.ask_price,
    status: l.status,
    sellerDisplayName: l.seller_display_name,
    isMine: l.is_mine === 1,
    createdAt: l.created_at,
    soldAt: l.sold_at,
  };
}

// GET /api/ticket-market — browse active listings (public)
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

  const rows = db
    .prepare(
      `SELECT ticket_listings.*, users.display_name as seller_display_name,
       CASE WHEN ticket_listings.seller_account_id = ? THEN 1 ELSE 0 END as is_mine
       FROM ticket_listings
       JOIN accounts ON accounts.id = ticket_listings.seller_account_id
       JOIN users ON users.id = accounts.user_id
       WHERE ticket_listings.status = 'active'
       ORDER BY ticket_listings.ask_price ASC`
    )
    .all(myAccountId);

  res.json(rows.map(serializeListing));
});

// GET /api/ticket-market/mine — my own listings, any status
router.get("/mine", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT ticket_listings.*, users.display_name as seller_display_name, 1 as is_mine
       FROM ticket_listings
       JOIN accounts ON accounts.id = ticket_listings.seller_account_id
       JOIN users ON users.id = accounts.user_id
       WHERE seller_account_id = ? ORDER BY ticket_listings.id DESC LIMIT 30`
    )
    .all(req.account.id);
  res.json(rows.map(serializeListing));
});

// POST /api/ticket-market — list one of my unredeemed tickets for sale
router.post("/", requireAuth, (req, res) => {
  const { ticketId, askPrice } = req.body || {};
  const price = Number(askPrice);
  if (!Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: "askPrice must be a positive number" });
  }

  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
  if (!ticket || ticket.account_id !== req.account.id) {
    return res.status(404).json({ error: "Ticket not found" });
  }
  if (ticket.status !== "unredeemed") {
    return res.status(400).json({ error: "Only unredeemed tickets can be listed" });
  }

  db.exec("BEGIN");
  db.prepare("UPDATE tickets SET status = 'listed' WHERE id = ?").run(ticketId);
  const info = db
    .prepare("INSERT INTO ticket_listings (ticket_id, seller_account_id, ask_price) VALUES (?, ?, ?)")
    .run(ticketId, req.account.id, Math.round(price));
  db.exec("COMMIT");

  res.json({ ok: true, id: info.lastInsertRowid });
});

// POST /api/ticket-market/:id/buy — purchase a listed ticket
router.post("/:id/buy", requireAuth, (req, res) => {
  const listing = db.prepare("SELECT * FROM ticket_listings WHERE id = ?").get(req.params.id);
  if (!listing || listing.status !== "active") {
    return res.status(404).json({ error: "Listing not available" });
  }
  if (listing.seller_account_id === req.account.id) {
    return res.status(400).json({ error: "You can't buy your own listing" });
  }

  const buyer = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.account.id);
  if (buyer.stonk_balance < listing.ask_price) {
    return res.status(400).json({ error: "Not enough STONK to buy this ticket" });
  }

  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(listing.ticket_id);
  if (!ticket || ticket.status !== "listed") {
    return res.status(400).json({ error: "This ticket is no longer available" });
  }

  const fee = Math.round(listing.ask_price * PLATFORM_FEE_PCT);
  const sellerProceeds = listing.ask_price - fee;

  db.exec("BEGIN");
  db.prepare("UPDATE accounts SET stonk_balance = stonk_balance - ? WHERE id = ?").run(
    listing.ask_price,
    buyer.id
  );
  db.prepare("UPDATE accounts SET stonk_balance = stonk_balance + ? WHERE id = ?").run(
    sellerProceeds,
    listing.seller_account_id
  );
  db.prepare("UPDATE tickets SET account_id = ?, status = 'unredeemed' WHERE id = ?").run(
    buyer.id,
    listing.ticket_id
  );
  db.prepare(
    "UPDATE ticket_listings SET status = 'sold', buyer_account_id = ?, platform_fee_stonk = ?, sold_at = ? WHERE id = ?"
  ).run(buyer.id, fee, new Date().toISOString(), listing.id);
  db.exec("COMMIT");

  res.json({ ok: true, paid: listing.ask_price, sellerReceived: sellerProceeds, platformFee: fee });
});

// DELETE /api/ticket-market/:id — cancel my own active listing
router.delete("/:id", requireAuth, (req, res) => {
  const listing = db.prepare("SELECT * FROM ticket_listings WHERE id = ?").get(req.params.id);
  if (!listing || listing.seller_account_id !== req.account.id) {
    return res.status(404).json({ error: "Listing not found" });
  }
  if (listing.status !== "active") {
    return res.status(400).json({ error: "Only active listings can be cancelled" });
  }

  db.exec("BEGIN");
  db.prepare("UPDATE tickets SET status = 'unredeemed' WHERE id = ?").run(listing.ticket_id);
  db.prepare("UPDATE ticket_listings SET status = 'cancelled' WHERE id = ?").run(listing.id);
  db.exec("COMMIT");

  res.json({ ok: true });
});

module.exports = router;
