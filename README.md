# Stonk Championship — Paper Trading Platform

A real, multi-user paper trading app: account creation, live quotes (US + foreign
markets), a chart, position tracking, buy/sell, and a live leaderboard. Built to
handle a starting scale of ~10,000 accounts.

## What's real here vs. what's mocked

- **Real**: accounts, auth, the SQLite database, positions, trade execution logic,
  cash-balance math, the leaderboard, the API, the frontend. This is the actual
  code you'd deploy — not a demo shell.
- **Mocked**: the market data. Prices are a random walk seeded from real recent
  levels, not live exchange feeds. See `server/dataProvider.js` for how to swap
  in a real provider (Alpaca for US equities is a fast, free path; foreign
  markets need a vendor per exchange — see "Foreign markets" below).

I built and syntax-checked every file, but couldn't run `npm install` or start
the live server in the sandbox I built this in (no network access there). You'll
want to run the steps below yourself before trusting it end to end.

## Setup

```bash
npm install
npm start
```

Then open `http://localhost:3000`. Sign up, and you'll get a $100,000 paper
account automatically.

Optional environment variables (create a `.env` file):

```
PORT=3000
STARTING_CASH=100000
SESSION_SECRET=some-long-random-string     # change this before deploying anywhere real
DB_PATH=./data/app.db
```

## Architecture

```
server/
  index.js            Express app entry point, wires up routes + websocket
  db.js                SQLite connection + schema (users, accounts, positions, trades, contests)
  auth.js              Password hashing (scrypt) + signed session tokens — zero extra deps
  dataProvider.js      Pluggable market data — mock now, real provider swap-in documented inline
  ws.js                WebSocket broadcast of live quote ticks every 2s
  middleware/
    requireAuth.js     Protects account-scoped routes
  routes/
    auth.js            POST /api/auth/signup, /api/auth/login
    quotes.js           GET /api/quotes, /api/quotes/symbols
    portfolio.js         GET /api/portfolio  (cash, positions, live P&L)
    trades.js            POST /api/trades (buy/sell, atomic), GET /api/trades/history
    leaderboard.js       GET /api/leaderboard (all accounts ranked by P&L)
public/
  index.html           Auth screen + main app shell
  app.js               Frontend logic: auth, websocket quotes, chart, trading, leaderboard
  styles.css           Same dark/gold design language as the marketing prototype
```

## Scaling to 10k accounts

SQLite (via `better-sqlite3`) comfortably handles millions of rows and is fast
for reads even under load — the one real constraint is write concurrency,
since SQLite serializes writes to a single file. At 10k accounts with normal
paper-trading trade volume (people don't trade every second), this is a
non-issue. `journal_mode = WAL` (already set in `db.js`) lets reads continue
while a write is happening, which is the main lever for this constraint.

If you outgrow it — very high concurrent write load, multi-region deployment,
need for read replicas — swap `db.js` for a Postgres connection (`pg` or an
ORM like Prisma/Drizzle). Every other file talks to the database through
`db.prepare(...).run()/.get()/.all()` calls with plain SQL, so the blast
radius of that migration is contained to `db.js` and the query strings, not a
rewrite of the app.

## Going live with real market data

**US equities**: Alpaca's free Paper Trading / Market Data API is purpose-built
for exactly this. Swap the body of `getQuote()`/`getQuotes()` in
`dataProvider.js` for calls to their API — the shape is documented inline in
that file. You could even use Alpaca's own paper brokerage accounts instead of
building your own ledger, which would let you delete most of `trades.js` and
`portfolio.js` — worth evaluating once you're past the prototype stage.

**Foreign markets**: this is real added scope, not a config change. Alpaca is
US-only. Each foreign exchange (LSE, TSX, ASX, XETRA, TSE, etc.) needs its own
data vendor with its own contract, pricing, and delay terms (real-time vs.
15–20 min delayed — real-time redistribution to the public typically requires
exchange licensing that gets expensive fast). Budget real evaluation time per
market before committing.

## Compliance note

Once real STONK-denominated entry fees and NFT prizes are riding on this,
you're operating a paid-entry skill contest — which is a well-trodden legal
category in the US (see prior conversation for examples), but entering
international players multiplies the jurisdictions whose contest/sweepstakes
law applies. Get this reviewed by a lawyer before opening entries beyond your
home country. I'm not a lawyer — this is a pointer, not clearance.

## The satellite ecosystem (DraftKings-style qualifying system)

**Phase 1 of a larger redesign** — the app now runs two connected layers:

**Main Event** (`server/contestScheduler.js`) — one room, Monday-Friday (ET).
Flat 15% rake off every entry (10% platform + 5% affiliate — paid to a
referrer if the entrant was referred, otherwise it rolls into platform
revenue too, so nothing vanishes and platform+affiliate always sum to
exactly 15% of gross). The remaining 85% funds as many **Activated Stonk
Brokers** as it supports via the ladder algorithm (`server/prizeLadder.js`)
— not capped at one anymore. Whatever's left over after funding all
possible Brokers goes winner-take-all to the next finishing position. Every
entrant gets ranked and recorded in `contest_results`, not just the winner.

**Satellites** (`server/satelliteScheduler.js`) — Phase 2 now ships the real
session matrix: three daily tiers plus one weekly tier, all sharing the exact
same rake + ladder algorithm as the Main Event, just funding 3,000 STONK
**Main Event tickets** instead of Brokers.

| Tier | Cadence | Window (ET) | Entry |
|---|---|---|---|
| 🔔 Full Day | Every trading day | 9:30 AM – 4:00 PM | 300 STONK |
| ☀️ Morning | Every trading day | 9:30 AM – 1:00 PM | 300 STONK |
| 🔥 Afternoon | Every trading day | 1:00 PM – 4:00 PM | 300 STONK |
| 🎟️ Weekly Qualifier | Same week as Main Event | Mon 00:00 – Fri 23:59:59 | 1,000 STONK |

Trading eligibility ends at **4:00 PM ET** (real NYSE/NASDAQ close) — no
extended-hours pricing implied, per the earlier decision. Daily tiers don't
open on weekends; the Weekly Qualifier resolves alongside the Main Event on
Friday close and reopens the next Monday, same cadence.

A ticket is a fully-funded, free seat in the Main Event — redeeming one
doesn't charge the holder again, but the entry still counts its full 3,000
STONK toward that Main Event's gross pool (see `tickets` table and
`POST /api/contests/:id/enter` with `useTicket: true`).

All four tiers were tested end-to-end for correct scheduling (a session
doesn't open before its actual start time, resolves right at its lock time,
skips weekends correctly, etc.) — see the inline test scenarios referenced
in the scheduler files.

Both were tested end-to-end against every worked example in the spec,
including the exact 300/600/900-entry Main Event numbers and the 100-trader
satellite example — see the inline math comments in each scheduler file.

### What's deferred from the full spec (honestly, not silently)

- **Real market-hours trading freeze** — the price simulator still runs
  24/7; session windows correctly gate *entry* into satellites, but don't
  yet actually restrict when trades can be placed. This needs to exist
  before session boundaries mean what they say for the trading itself.
- **Ticket marketplace** (buying/selling funded tickets) — explicitly not
  implemented until legal counsel signs off, per the spec. Data model has
  room for it (`tickets.status`) but no matching/trading logic exists.
- **Live prize-ladder animations, "Broker unlocked" moments, ticket-win
  reveal screens, auto-generated shareable social graphics** — visual
  polish beyond the current highlighted Main Event badge/glow treatment.
- **Player career profiles / badges** (Rookie → Trader → Floor Veteran →
  Market Maker → Stonk Broker) — not yet built.
- **Official StonkBrokers artwork** — the pixel-broker mascot on the site is
  original artwork in a similar visual style, not the actual copyrighted
  NFT art. Using the real artwork would need a partnership/license from the
  StonkBrokers team.

## Admin revenue dashboard — STONK vs. realized USD

`GET /api/admin/revenue` (gated by an `ADMIN_EMAILS` allowlist in `.env` —
empty by default, so this doesn't ship open) reports platform and affiliate
revenue two ways, deliberately kept separate:

- **`totalPlatformRevenueStonk`** — the price-independent "real business"
  number. Doesn't move just because the token pumped or dumped.
- **`totalRealizedUsdRevenue`** — each period's STONK take valued at *that
  period's own price snapshot* (stored per-contest at resolution time), not
  today's price. This is what the business actually realized.
- **`totalStonkValuedAtCurrentPrice`** — for comparison only: the same STONK
  total, revalued at today's price. The gap between this and the realized
  figure above is exactly how much of any apparent revenue change is just
  token price movement, not player activity — which was the whole point of
  asking for this split.

## One portfolio per contest entry (not one per account)

This is the core architectural change in this version. Every time you enter
a contest or satellite, you get a **fresh, dedicated $100,000 portfolio** —
not a shared account-wide one. Enter the Weekly Qualifier, a Morning
session, and a Full Day session all at once, and you have three completely
isolated portfolios: trading AAPL in one never touches your position or
cash in the others.

- `portfolios` table: one row per entry, holds its own `cash_balance`
- `positions` / `trades`: now scoped to `portfolio_id`, not `account_id`
- P&L is simply `portfolio.totalValue - 100000` — no more cross-contest
  "starting value" bookkeeping, since every portfolio always starts at
  exactly the same number
- `accounts.stonk_balance` is the only account-wide balance left — that's
  the real STONK currency used to pay entry fees, separate from any
  paper-trading portfolio

Verified with a dedicated isolation test: a trade executed in one portfolio
was confirmed to leave every other simultaneous portfolio for the same user
completely untouched (`cash_balance`, positions, everything).

## The satellite matrix

Four categories, each running at three price levels — 12 concurrent
satellites total:

| Category | Cadence | Low | Mid | High |
|---|---|---|---|---|
| 🔔 Full Day | Daily, 9:30 AM–4:00 PM ET | 100 STONK | 300 STONK | 750 STONK |
| ☀️ Morning | Daily, 9:30 AM–1:00 PM ET | 100 STONK | 300 STONK | 750 STONK |
| 🔥 Afternoon | Daily, 1:00 PM–4:00 PM ET | 100 STONK | 300 STONK | 750 STONK |
| 🎟️ Weekly Qualifier | Mon–Fri, same week as Main Event | 500 STONK | 1,000 STONK | 2,500 STONK |

All twelve use the identical rake + ladder algorithm as the Main Event —
see `server/satelliteScheduler.js`.

## Trading rules — sensible sizing, not gambling

Two rules enforced server-side on every BUY order (`server/routes/portfolios.js`),
explained on the in-app Rules page:

1. **$2B minimum market cap** — every tradable symbol already exceeds this
   (see `MIN_MARKET_CAP` in `server/dataProvider.js`), but the check is real
   and will reject anything added later that falls below it.
2. **Max 5% of portfolio per position, at entry only** — a BUY that would
   push a symbol's cost basis over 5% of the portfolio's current value gets
   rejected with the exact dollar room still available. Positions that grow
   past 5% purely from price appreciation are never touched — the rule only
   evaluates new purchase cost, never unrealized market value. SELL orders
   are never restricted.

Verified with a dedicated test: buying exactly at the 5% boundary succeeds,
one share over it is rejected, and appreciation-driven growth past 5% is
confirmed untouched by the rule.

## Pre-set portfolio allocations ("auto-fill")

Set up a percentage split (e.g. 5% AAPL, 3% MSFT, 2% NVDA) for a contest that
**doesn't exist yet** — the next Full Day Low session, or next week's Main
Event. The moment a matching contest/satellite actually opens, you're
auto-entered and the allocation fires immediately at the opening quote —
no need to be watching the clock. Free to trade normally after; this is
strictly the opening move, not a lock.

- `pending_allocations` table: keyed by **tier**, not a specific contest
  instance (which doesn't exist until the scheduler creates it)
- `server/allocationEngine.js`: validation (same 5%-per-symbol rule as
  manual trades, 100% total cap) and the actual fill logic
- Hooked into both schedulers' `openNewContest()`/`openNewSatellite()` —
  the instant a new instance is created, any matching pending allocations
  are checked and applied automatically
- One-time use: applies once, then moves to `applied` or `failed` (e.g. not
  enough STONK at open) — never silently retries
- If the entrant already has an unredeemed ticket, the Main Event auto-fill
  uses it instead of charging STONK, same as a manual entry would

Tested end-to-end: a pending allocation created before any satellite
existed correctly auto-entered the account and filled the exact percentage
split (verified to the cent) the instant the scheduler opened a matching
satellite — same confirmed for the Main Event, including ticket-based entry.

## Scheduled orders for already-joined portfolios

Distinct from the tier-triggered auto-fill above: once you've **already
joined** a contest, you can queue a percentage allocation to fire at the
**next real market open** (9:30am ET) instead of trading manually right
away — useful if you joined mid-day and want tomorrow's opening trades
queued in advance.

- `scheduled_orders` table, keyed to a specific existing `portfolio_id`
- `server/marketOpenScheduler.js`: ticks every 15s, fires any order whose
  `target_open_at` has passed
- **Critical correctness point**: sizing uses the portfolio's *live* value
  at execution time, not a hardcoded 100000 — a portfolio that's already
  traded and grown (or shrunk) since joining gets sized off what it's
  actually worth right now. Caught and fixed this exact bug during testing.
- Re-validates against the 10% max-position rule and available cash at
  fire-time, not just at scheduling time, since real trades may have
  happened in the meantime. Verified with a case where existing holdings
  plus the queued order would exceed 10% — correctly rejected.

## Live Contests panel

The Leaderboards tab now shows every currently **open** contest (Main
Event + any open satellite) with live entry count, STONK pooled, and the
**payout schedule at current funding** (e.g. "1 Broker funded + 31,668
STONK to next" or "8 tickets funded + 1,500 STONK to next") — computed the
same way resolution does, just live instead of final. Click through to see
that specific contest's live leaderboard.

## Ticket marketplace ⚠️

Built as explicitly requested — **but flagged again clearly, since this is
the one piece of the original spec that explicitly said to hold off until
legal review**. A live secondary market for something with real redeemable
value is meaningfully closer to a financial instrument than anything else
in this app. Get a lawyer's eyes on this specifically before it touches
real STONK.

How it works:
- List any unredeemed ticket for a STONK asking price (`ticket_listings`
  table). The ticket locks (`status = 'listed'`) the moment it's listed —
  can't be redeemed for a Main Event entry or double-listed while active.
- Buyer pays exactly the asking price. Seller receives asking price minus a
  **5% platform fee**. Ticket ownership transfers outright to the buyer,
  status flips back to `unredeemed` so they can use it immediately.
- Cancelling an active listing unlocks the ticket back to the seller.

Tested rigorously since this moves real economic value: full buy/sell flow
with exact fee math verified, ownership transfer confirmed, self-purchase
blocked, insufficient-funds purchases blocked, and confirmed a listed
ticket is correctly excluded from the Main Event redemption query (same
query `contests.js` already used — no changes needed there, it was already
correct by construction).

**Not yet built**: the fee revenue isn't wired into the admin STONK/USD
revenue dashboard — a reasonable follow-up once this is live.

## Brokerage-style trade UI refresh

An original interface, deliberately **not** copying Robinhood's specific
trademarked look — since the app isn't officially affiliated with them,
that would be a real legal exposure and could actively hurt a future
partnership conversation. Instead this uses the generic patterns shared
across virtually every modern trading app (clean price-forward layout,
minimal one-tap actions):

- **"Buying Power"** instead of "Cash" — standard brokerage terminology
- **Price flash animation** — brief green/red flash on every tick, both in
  the watchlist and the open trade modal
- **Day's high/low** shown under the chart (tracked since server start —
  a real trading day's open/close reset isn't modeled yet, noted as a
  simplification)
- **Order review → confirm → filled** flow — every trade (manual quantity
  or the % quick-buttons) now shows a review screen with estimated price
  and total before executing, then a clean "Order filled" confirmation
  after. No more instant-fire trades from a single tap.
- **Recent Activity** — full order history now visible in the trade view
  (the API already existed, it just wasn't surfaced anywhere before)
- **Allocation donut chart** — dependency-free SVG chart showing cash vs.
  each position as a % of the portfolio, doubles as a visual reminder of
  the 10% position-size rule in action
- **% of portfolio** column added to the positions table alongside dollar P&L

The actual "seamless paper-to-real" promise lives in the backend
separation, not the UI: `dataProvider.js` is the one place quotes come
from, cleanly isolated from the trading logic. If Robinhood (or anyone)
ever provides real backend access, that's a data-layer swap behind this
same interface, not a rewrite.

## Freeroll tier, multi-entry, and named price tiers

**Named tiers**: Rookie (100+50)/Trader (300+50)/Whale (750+50), plus a new
**Freeroll** level exclusive to the Weekly Qualifier — 0 STONK, no wallet
needed, capped at 1 entry per account per room.

**The +50 STONK surcharge** on every paid satellite room (all 12) funds the
freeroll pool separately from that room's own prize pool — verified this
split is real: a room's own gross pool only ever reflects the base fee
(100/300/750), never the surcharge, confirmed with a direct test. Every
time the surcharge fund crosses 3,000 STONK (~60 paid entries), one
freeroll ticket becomes available and gets awarded to whoever finishes #1
in the next freeroll room that resolves — tested end-to-end including the
fund correctly decrementing after award.

**Multi-entry**: up to 10 entries per account per contest (satellites and
the Main Event both), each with its own separate portfolio. Enforced with
a COUNT() check, not a database uniqueness constraint — tested that the
10th entry succeeds and the 11th is correctly rejected, for both satellites
and the Main Event.

**Architecture note**: tier configuration (pricing, names, surcharge, max
entries) lives in `server/tierConfig.js`, extracted specifically to avoid a
circular dependency between `satelliteScheduler.js` and `allocationEngine.js`.

## Nav, Lobby, and trade UI refresh

- Nav: centered logo, live STONKBROKER price ticker (public `/api/account/price`
  endpoint) replacing the personal balance — balance now lives in My
  Contests instead, since a trader can have several simultaneous portfolio
  balances at once (weekly + morning + full day, etc.)
- Lobby: Main Event moved above satellites; satellites restructured into a
  two-level drill-down tree (category → rooms), matching the pattern
  already used on the Leaderboards page
- Allocation modal now opens with 10 pre-built rows, each defaulting to a
  different symbol at 10% — a genuinely usable starting point instead of
  an empty single row
- Trade modal: added a 100% quick button (buy/sell), and a candlestick
  chart toggle — ticks are bucketed client-side into 5-second OHLC candles
  since there's no server-side historical OHLC source yet

## Reserve-then-configure flow, tier renaming, and two real bug fixes

**Two bugs found and fixed from real testing feedback:**
1. The Lobby was periodically auto-scrolling to the Main Event every ~5
   seconds — traced to a background poll re-rendering an open satellite
   drill-down, which re-triggered `scrollIntoView` every refresh. Fixed by
   separating "keep the data live" from "scroll to it" — only the initial
   user click scrolls now.
2. Leaderboards showed "4 of 3 rooms open" for the Weekly Qualifier —
   a hardcoded `3` left over from before it got a 4th (freeroll) level.
   Fixed to use the real room count.

**Tiers renamed**: Clerk / Trader / Jr. Stonkbroker (was Rookie/Trader/Whale).

**Weekly Qualifier reordered to the front** of every category list — it
runs concurrently with the Main Event, not sequentially like the dailies,
so it leads.

**Reserve-then-configure entry flow**: pending (not-yet-open) rooms now
have a real "Enter this room" button instead of requiring a full
allocation setup first. Clicking it reserves the spot immediately (100%
cash, zero picks) — tested end-to-end: the reservation correctly
auto-enters with zero positions and the full $100,000 untouched once the
room opens. The trader can then set up their actual portfolio anytime
before that room opens, from My Contests — reusing the same allocation
modal, now with copy that adapts to whether picks already exist.

A "You're in!" confirmation now fires on every entry — satellites, Main
Event, and reservations alike.

**Archive of Past Winners**: new section on Leaderboards, aggregating every
rank-1 real-prize winner (Broker, ticket, or STONK) across resolved
contests and satellites, most recent first.

**Hover tooltips** added throughout: category rows explain what each
session is and when it runs; individual room chips show live stats
(traders, STONK collected, projected prize) on hover.

## Multi-entry reservation bug fix + grouped My Contests view

**Found and fixed a real bug**: reserving a not-yet-open room a second time
was silently *replacing* the first reservation instead of adding a second
one — meaning multi-entry (up to 10) never actually worked for rooms you
reserve before they open, only for rooms you join after they're already
live. Root cause: `POST /api/allocations` unconditionally cancelled any
existing pending reservation for the same room before creating a new one.

Fixed by:
- `POST /api/allocations` now checks count against the tier's actual max
  and stacks a new reservation instead of replacing — tested directly:
  5 calls to reserve the same room now correctly produce 5 separate
  reservations, and the freeroll's 1-entry cap still correctly rejects a
  2nd attempt.
- Added `PUT /api/allocations/:id` so *editing* one specific existing
  reservation's picks no longer collides with *creating* a new one — these
  were sharing the same endpoint before, which is what caused the
  replace-instead-of-stack bug in the first place.
- `myEntryCount` on pending (not-yet-open) tiers is now computed for real
  from actual pending reservations, instead of being hardcoded to 0.

**My Contests now groups multiple entries into the same room** under a
collapsible row ("Full Day — Jr. Stonkbroker · 3 entries") instead of only
ever showing one. Expanding it reveals each individual entry — whether an
already-open portfolio you can trade, or a pending reservation you can
still configure — and clicking through drills into that specific
portfolio's trade view, same as before.

## Fixed: "too many accounts" when trying to configure an already-reserved entry

**Root cause found**: My Contests had two separate, duplicate displays of
the same pending reservations — the grouped "Active" tree, and a leftover
flat "Pending Auto-fill Allocations" section with its own generic "Set up
new allocation" button. That generic button always tried to *create* a new
reservation with no awareness of which room you meant to configure — so if
you'd already reserved a room 10 times and used that button to set up
picks for one of them, it correctly (but confusingly) rejected an 11th
entry instead of letting you edit one of the 10 you already had.

**Fixed** by removing the duplicate section entirely, and — more
importantly — redesigning the grouping logic itself: **unconfigured
reservations (no picks saved yet) now always stay individually visible**,
with a prominent gold "⚙️ Set up portfolio" button, so they can never get
lost in a collapsed group. Only *configured* entries (real picks saved, or
an already-open real portfolio) collapse into the click-to-expand tree when
there's more than one — since those don't need immediate attention the way
an unconfigured reservation does.

## Enter multiple at once — with freeroll always protected

The entry review modal now shows a quantity dropdown (1 up to however many
slots you have left, capped at 10) for satellite rooms and direct-pay Main
Event entries — no more clicking "Enter" ten separate times.

**Freeroll is structurally protected from ever offering this**, not just by
convention: the dropdown only renders when more than one entry is actually
possible (`maxQty > 1`), and since freeroll's `maxEntriesPerAccount` is
hard-set to 1 in `tierConfig.js`, the math can never produce a `maxQty`
above 1 for it — the dropdown simply cannot appear. This is backed by the
same server-side max check from the reservation-stacking fix, so even a
malformed or bypassed request would still be rejected at the API layer,
verified by the existing stacking test.

Quantities execute **sequentially, one at a time, never in parallel** —
firing them in parallel could let multiple requests all pass the "count <
max" check simultaneously and race past the cap. If a batch partially
succeeds before hitting the max, you're told exactly how many actually
went through.

## Fixed: editing your first entry got treated as an 11th

**Root cause**: `editPendingAllocation()` set `editingAllocationId` to mark
"I'm editing entry X," then called `openAllocationModal()` to open the UI
— but that function's very first line unconditionally resets
`editingAllocationId = null` (needed for the "open fresh, not editing
anything" case). Since the reset ran *after* the assignment, it silently
wiped out the edit context every time — so clicking "Set up portfolio" on
any existing entry always fell through to the create-new path instead,
hitting the max-10 check even on your very first entry if you'd bulk-
reserved 10 already-empty ones.

**Fixed** by simply reordering the two lines — set `editingAllocationId`
*after* calling `openAllocationModal()`, not before. One-line-order bug,
confirmed via direct code inspection of the corrected sequence.

## Fixed: modal close-button collision, missing scheduled-orders list, and copy cleanup

**Real CSS bug found**: the per-row "remove symbol" button in allocation
modals reused the exact same class as the modal's own corner close button
— which is `position:absolute` to one specific corner. Every row-remove
button was stacking directly on top of the real close button in that same
spot, so clicking "the X" to close a modal often removed a row instead,
requiring several clicks before finally hitting the real close underneath.
Fixed by giving row-remove buttons their own class with proper inline
positioning next to their row.

**Scheduled orders had no visible list** — the backend
(`/api/scheduled-orders`) always existed, but nothing in the UI ever
surfaced it, so queued orders were genuinely un-cancelable and un-viewable
after creation. Added a "Scheduled Orders" section to My Contests.

**Scheduled order modal now defaults to 10 rows**, matching the main
allocation modal, instead of starting with just one.

**Entry buttons standardized to "Enter Contest," always showing STONK and
USD together** (was a scattered mix of "Enter for," "Pay X instead," "Use
my funded ticket").

**Signup CTA clarified** — was "starts with $100,000," which reads as USD
and is easy to confuse with the *separate* $100,000 paper-trading portfolio
cash. Now shows "100,000 STONK (~$3,460)" with a live USD conversion, even
before logging in.

**Cleaned up stale mobile nav CSS** — `.welcome` and `.chip-balance` were
still being styled for mobile despite having moved out of the nav entirely
several rounds ago, and the STONK price ticker was being hidden outright on
phones even though it's now the nav's primary element. Now shrinks instead
of disappearing.

## TEST_MODE — testing off real market hours

Set `TEST_MODE=true` as an environment variable (locally, or in Render's
Environment tab) to bypass real market-hours gating entirely, for testing
only — **never set this on a real deployment serving real players**.

With it on:
- Every category (Full Day, Morning, Afternoon, Weekly Qualifier) is
  always open, regardless of real day-of-week or time-of-day — you can
  trade the "Afternoon" tier at 3am on a Sunday
- Each room still has a real, predictable cutoff — just short and
  configurable (`TEST_SATELLITE_MINUTES`, default 3; `TEST_MAIN_EVENT_MINUTES`,
  default 10) instead of real hours/days
- The instant a room resolves, a fresh one opens automatically on the very
  next scheduler tick (~15s later) — continuous cycling, no waiting

Tested directly: confirmed all 13 tiers (12 satellites + Main Event) open
simultaneously on a Sunday at 3am ET, confirmed each room's duration
matches the configured test window exactly, and confirmed a resolved room
is replaced by a genuinely new instance on the next tick. Also confirmed
`TEST_MODE` unset (the default) leaves all real market-hours behavior
completely untouched — same full pipeline test still passes identically.

Mock price data (`dataProvider.js`) was already fine for this — it's
always ticking regardless of real hours; the actual gap was purely the
contest *scheduling*, not the price feed.

## Expanded symbol universe — 61 tradable stocks

Added ~44 more well-known large caps for easier, more realistic beta
testing — spanning tech (META, NFLX, ORCL, ADBE, CRM, INTC, AMD, QCOM,
CSCO, IBM, UBER, PYPL, SNOW, PLTR), finance (BAC, WFC, GS, MS, V, MA, AXP),
healthcare (JNJ, PFE, UNH, ABBV, MRK, LLY), consumer/retail (KO, PEP, MCD,
SBUX, NKE, DIS, COST, TGT, HD, LOW), and industrials/energy/auto (XOM, CVX,
BA, CAT, GE, F, GM, T, VZ) — alongside the original 10 US names and 5
foreign ones. 61 total, all comfortably above the $2B minimum market cap
rule (verified directly — zero symbols fall below it), all unique.

With this many symbols, the 10% max-position rule now has real headroom
for genuine diversification (up to 610% theoretical deployment across 61
names, vs. the original 15-symbol universe that structurally couldn't
exceed 150%) — no frontend changes needed, since the symbol list, market
filter, and allocation modal all already pull the count dynamically rather
than assuming a fixed number.

## Fixed: scheduled order said "queued" but never appeared anywhere

**Root cause**: the submit handler for the scheduled-order modal showed a
success message and closed — but never called `refreshMyContests()`
afterward. The "Scheduled Orders" list underneath had already been
rendered *before* the new order existed, and nothing ever told it to
re-fetch, so the order genuinely was created correctly (the API call
succeeded) but stayed invisible until some unrelated action happened to
refresh the page later. Fixed by refreshing My Contests immediately after
a successful queue, same pattern already used everywhere else a mutation
happens.

## Scheduled orders now visible and editable per-entry

**Real gap fixed**: with multiple entries in the same room (up to 10), there
was no way to tell which specific ones already had a market-open order
queued — a genuine risk of losing track and only ending up trading a
fraction of what you intended.

- Every entry row now shows a clear **"⏰ Order Queued"** badge, a
  blue-tinted highlight, and a plain-language summary ("70% allocated on
  open" or "100% cash on open") right where you're already looking —
  no need to cross-reference a separate list
- The **"Schedule open order" button becomes "Adjust queued order"** once
  one exists, and reopens the modal pre-filled with your actual saved
  picks instead of resetting to defaults
- Orders can now be **cancelled directly from the entry row**, not just
  from the separate Scheduled Orders section
- The dedicated Scheduled Orders section also got an **Adjust** button
  (previously cancel-only) and now shows which specific entry each order
  belongs to, plus the same allocation-percentage summary

No new backend endpoint needed — a scheduled order is already one-per-
portfolio with "latest replaces" semantics, so editing just reuses the
existing POST.

## Fixed: entry tree kept snapping back to collapsed mid-workflow

**Root cause**: `refreshMyContests()` runs after every single action (setting
an order, cancelling, anything) and fully regenerates the entries list from
scratch — but the expand/collapse state of each group tree was never
tracked anywhere, so every regeneration silently reset every tree back to
collapsed. For someone working through 10 entries one at a time, this
meant the tree they'd just expanded to work in would vanish back to
collapsed after literally every action, making it feel broken and
unpredictable — exactly the opposite of "easy to decipher" for the traders
managing the most entries at once, who need this most.

**Fixed** by tracking which specific groups are expanded in a persistent
set that survives re-renders — expand a group once and it stays expanded
across every subsequent action, until explicitly collapsed again.

## Fixed: missing entry #1, and a second redundant numbering scheme fighting it

**Root cause of "Entry 1 skipped"**: the very first entry in any room was
deliberately given no "(Entry N)" suffix at all — a design choice from
before multi-entry existed, meant to avoid clutter on the common
single-entry case. Now that batches of 10 are normal, that silent omission
read as a missing number. Fixed at the source — every entry, including the
first, now always shows its real number. Verified directly: generated 5
sequential entries and confirmed the first one now correctly shows
"(Entry 1)" instead of nothing.

**Compounding the confusion**: the entry tree was *also* laying a second,
separate numbering scheme on top (based on array position, which shifts
around and doesn't match the real permanent number) — two different
numbers competing for the same entry. Removed that redundant tag entirely;
each entry now shows exactly one number, from exactly one source.

**Removed the redundant "Scheduled Orders" section** — since the "Active"
entry list already shows a clear "⏰ Order Queued" badge and an "Adjust
queued order" button directly on each entry (added last round), having a
second section listing the same orders again was showing the same
information twice in two different shapes, which is what read as the tree
"toggling" between two states. One canonical place per entry now, matching
the same fix applied earlier to the old duplicate "Pending Auto-fill
Allocations" section.

## Fixed: "100% buy" sometimes rejected with a razor-thin false positive

**Real bug, confirmed and measured**: clicking "100% of what's left to
allocate" computes a cost, converts it to a share quantity (dividing by
price), and sends that quantity to the server — which multiplies it back
by price to re-derive the cost. That round-trip (cost → quantity → cost)
doesn't always return bit-for-bit the same number due to how floating-point
division/multiplication work — searched 100,000 random realistic
price/allotment combinations and found **4,399 of them** (~4.4%) produce a
tiny positive overshoot, typically on the order of a trillionth of a
dollar. The 10% position-size check had zero tolerance for this, so that
razor-thin overshoot was enough to trigger a real rejection on an entirely
legitimate buy — exactly the "clicked 100%, got rejected" symptom.

**Fixed** by adding a $0.01 tolerance to the comparison (the same pattern
already used correctly elsewhere, e.g. `marketOpenScheduler.js` — this one
spot in the main trade route had been missed). $0.01 comfortably absorbs
any realistic floating-point drift while remaining far too small to
meaningfully loosen the actual rule — verified a genuine $500 overage is
still correctly rejected. Applied the same fix to the cash-sufficiency
check right next to it, which had the identical vulnerability and would
have hit the same failure mode for someone buying with 100% of their
remaining cash.

## New tier: Runner — the entry point below Clerk

**30 STONK (~$1.04 at current price)**, applies to all four categories
(Full Day, Morning, Afternoon, Weekly Qualifier), max 10 entries same as
every other paid tier. Named after the genuine old Wall Street entry-level
job — running orders around a trading floor, the rung below clerk.

**Deliberately carries no freeroll surcharge** — the standard +50 STONK
surcharge alone already exceeds a $1 target, so Runner is a standalone
cheap tier that doesn't feed the freeroll fund, unlike Clerk/Trader/Jr.
Stonkbroker. Its own ladder math works completely normally otherwise —
tested directly: confirmed a Runner room's full 30 STONK entry counts
toward its own pool (no surcharge carve-out), confirmed entering one does
NOT touch the freeroll fund, and confirmed 118 entrants (the real
breakeven point for funding a ticket at this price) correctly funds
exactly 1 ticket via the same ladder algorithm every other tier uses.

Total tiers: 17 (was 13) — 4 per daily category, 5 for Weekly Qualifier
(the extra one being Freeroll, exclusive to that category).

Also fixed a real bug found while building this: the tier filter bar's
default list didn't include the new level, which would have silently
hidden Runner from the lobby entirely until a trader manually re-enabled
it in the filter — added it to the default-on list.

## Fixed: position rows not clickable, Past section not collapsing

**Positions not clickable**: could not find a definitive bug through code
review alone (checked syntax, event wiring, CSS z-index, duplicate
function definitions — all looked correct). Rather than keep guessing,
switched to a structurally more robust pattern regardless: instead of
attaching a fresh click listener to every row on every re-render (the
`positionsTable` panel refreshes periodically), there's now **one single
delegated listener attached once, at page load, on the stable parent**
rather than the frequently-replaced rows. This is standard best practice
for exactly this situation and eliminates an entire category of
timing/race bug regardless of the precise mechanism behind the original
symptom.

**Past section not collapsing**: same fix already applied to "Active" a
few rounds back, now applied to "Past" too — multiple resolved entries in
the same room collapse into one clickable, expandable line instead of
listing every entry flat. Reused the exact same grouping function; past
portfolios don't have pending allocations to worry about, so this was a
straightforward extension of existing logic.

## Fixed the REAL cause of occasional 100%-buy rejections

The earlier $0.01 tolerance fix handled pure floating-point rounding, but
that wasn't the whole story — **the quantity for a "100%" buy gets computed
once at click time, then sits through a review/confirm step before actually
executing, and the price ticks continuously (every 2 seconds) the whole
time.** If the price moves during that pause — completely normal, not an
edge case — the same share count now costs more than it did when computed,
and rejection at that point is *correct*, not a bug in the check itself.

Proved this directly: simulated a realistic 0.3% price tick between click
and confirm, and the old approach really does land $29.87 over the true
limit — real money, not a rounding artifact, and no reasonable tolerance
value should paper over an overage that size.

**Real fix**: added a `maxAllotment` mode to the trade endpoint. When set,
the server ignores whatever quantity the client sent (that's now only used
to render an *estimate* on the review screen) and computes the true maximum
itself, atomically, using the live price and live portfolio value at the
actual moment of execution — eliminating the staleness race structurally
rather than tolerating it. Verified: the exact same price-drift scenario
that broke the old approach now lands precisely at the true 10% boundary,
every time, regardless of how much the price moved in between. Only wired
this into the 100% buy button specifically — 25/50/75% have natural
headroom below the boundary and were never actually at risk.

## Trade modal redesign — horizontal layout, unified order entry

Rebuilt from a cluttered vertical stack (three separate Buy/Sell pairs, two
duplicate "OR..." rows) into a clean horizontal two-column layout, ~900px
wide instead of 480px (scoped override so other modals stay unaffected):

- **Symbol picker** at the top — switch symbols mid-modal without closing,
  chart/position/reference numbers all refresh in place
- **Portfolio total value** always visible in the header, so you can trade
  without losing track of where the account stands overall
- **Left column**: chart (Line/Candles, unchanged)
- **Right column**: position summary + live P&L for the current symbol (or
  a clear "no position yet" state), a Percentage/Shares mode toggle
  (Percentage is the default), and a single Buy/Sell pair at the bottom
- **Percentage mode**: 25/50/75/100/custom chips select a value first —
  pressing Buy or Sell afterward is what decides what that percentage
  actually means (room left to allocate vs. current position), explained
  via a hover tooltip right next to the toggle rather than two separate
  rows of buttons that said the same thing differently
- Collapses to stacked on narrow screens, same responsive pattern as the
  rest of the site

## New: My Watchlist panel

Separate, personal, curated list — distinct from the full "Markets" browse
table. Add any of the 61 symbols via a dropdown, remove with one click,
collapsible (single toggle for the whole panel), rows are click-to-trade
same as everywhere else. Stored in `localStorage`, so it's per-browser, not
synced across devices — reasonable for now, worth moving server-side later
if that matters.

## Silenceable trade confirmation screens

Both guardrail/informational steps in the trade flow can now be skipped,
independently, by any trader who wants a faster loop:

- **Review order screen** — "Don't show this again" checkbox, checking it
  and confirming makes every future Buy/Sell execute immediately (true
  one-click trading)
- **Order filled screen** — "Don't show this again" checkbox, checking it
  and hitting Done replaces the full confirmation screen with a quick
  3-second inline flash instead

Both are fully independent — skip one, both, or neither. **Reversible
anytime** via a "⚙ Trade settings" link in the trade view's sticky bar,
always visible while trading — opens a small toggle panel showing the
current state of both, phrased as "show this screen" rather than "skip
this screen" since that's the more intuitive framing for something meant
specifically to turn things back on.

Stored in `localStorage`, so — same caveat as the personal watchlist —
this is per-browser, not synced across devices. Worth moving server-side
if that becomes a real gap.

## Full consistency sweep — found two real bugs beyond the one reported

**Bug 1 (frontend)**: real portfolios get their "(Entry N)" baked in at
creation, server-side — but pending reservations, before their room opens,
had no equivalent numbering at all, so a batch of 5 reservations all
looked identical. Fixed by computing a stable number for pending entries
too, based on true creation order (verified: even in scrambled array
order, the earliest-created reservation always lands on Entry 1).

**Bug 2 (backend, found during the sweep — not the one originally
reported)**: there are actually **four** separate places a portfolio label
gets generated (manual join × 2, auto-fill-on-open × 2), and only two of
the four included the entry number. The other two — both auto-fill paths,
in `allocationEngine.js` — were missing it entirely.

**Worse, one of those two had a second, more serious bug hiding in the
same function**: the Main Event auto-fill path checked *existence* of any
prior entry rather than *counting* entries against the real max — meaning
if someone reserved the Main Event multiple times before it opened, only
the **first** reservation would ever actually apply; every other one would
silently fail with "already entered," directly contradicting the max-10
multi-entry feature. Fixed to count against the real max, matching the
satellite auto-fill path and the manual join route.

Verified both fixes directly: auto-filled satellite labels now number
1/2/3 correctly, and a test reserving the Main Event 5 times now correctly
produces 5 separate applied entries, each numbered correctly — previously
this would have produced exactly 1 entry and 4 silent failures. Full
existing regression suite (accounting, multi-entry, freeroll stacking)
still passes unchanged.

All four label-generation call sites now read from the exact same pattern:
`` `... (Entry ${existingCount + 1})` `` — confirmed via direct grep across
every file, not just spot-checked.

## New: Hourly category + generalized freeroll prizes across every category

**New Hourly category** — full tier ladder (Freeroll/Runner/Clerk/Trader/Jr.
Stonkbroker), runs 24/7, a fresh room opens every hour on the hour,
regardless of day or real market hours. Solves the specific gap raised:
someone signing up any day, any time, always has something to play
immediately — not just Monday for Weekly's freeroll.

**Freeroll prizes are now category-specific, not one-size-fits-all**:
- Weekly Qualifier → Main Event ticket (exactly as before, unchanged)
- Full Day / Morning / Afternoon / Hourly → a free entry into **that same
  category's** Runner tier

**Funding pools became per-category** — `freeroll_fund` went from a single
global row to one row per category, each with its own threshold matched to
what its prize actually costs (3,000 STONK for Weekly's ticket, ~30 for
everyone else's Runner entry). This was a deliberate fix to a real math
problem: a shared pool would have let fast-cycling categories like Hourly
starve Weekly's much bigger, much rarer prize.

**Surcharge stays at 50 STONK everywhere** — for Weekly this funds its
usual ~60-entries-per-ticket rate. For the other four categories, 50 STONK
comfortably *exceeds* their ~30-STONK Runner prize on a single entry —
intentional; the surplus banks forward rather than getting spent, meaning
freerolls reliably get funded rather than usually funding nothing, and the
banked surplus becomes a lever for bonus prizes or marketing later.

**Empty-pool outcome changed**: previously a freeroll winner with an
unfunded pool got literally nothing. Now they get a bonus freeroll entry
into the next occurrence, stacked on top of their normal allowance,
instead of walking away empty-handed.

**Tested directly, not just by inspection**: confirmed Hourly opens with
all 5 levels even on a Sunday at 3am; confirmed a paid entry in Hourly
never touches Full Day's fund (true category isolation); confirmed Weekly's
prize config is completely unchanged; confirmed a funded non-weekly
freeroll correctly awards a real Runner-tier reservation (not a ticket);
confirmed an unfunded freeroll correctly awards the bonus entry instead of
nothing. Full original regression suite (accounting, multi-entry, ladder
math) still passes unchanged.

**Also fixed two real bugs found during the build**: the category-hover
description lookup was missing an entry for Hourly entirely, and the Past
Winners archive would have displayed "0 STONK" for both new prize types
(since neither carries a `prizeAmount`) — added proper labels for both.

## Known gap — not built yet

**The onboarding popup flow** (signup → Freeroll CTA → "set up your
portfolio" prompt → "check the Lobby" prompt) discussed in this same
conversation is **not built yet**. This round focused entirely on the
underlying Hourly + freeroll-prize architecture, which needed to be solid
and well-tested before building a UI flow on top of it. Next up.

## First-time onboarding sequence

Three-step guided popup flow, triggers **only on actual signup** (not
login) — hooked directly into the signup success event, not a generic
"first visit" check, so existing users never see it again even if they
clear browser storage:

1. **Welcome** — CTA drops them straight into the Lobby with the Freeroll
   filter active and Hourly's drill-down already open (always available,
   resolves within the hour — the fastest possible first result)
2. **Portfolio setup** — fires after they successfully enter any freeroll,
   prompts them to head to My Contests and configure their picks
3. **Ready for more** — fires after their first real buy (or saving a real,
   non-empty allocation, covering the reservation path too), prompts them
   to check the Lobby for what's starting soon from $1

Every step can be skipped via "Maybe later," which permanently ends the
sequence. State tracked in `localStorage` — consistent with every other
per-browser preference already in this app (watchlist, trade settings).

**Caught a real syntax bug while building this** — an edit meant to insert
one line accidentally merged two unrelated event handlers together
(signup's closing brace landed inside logout's body). Full syntax check
caught it immediately; fixed before it ever reached a build.

## Clarified: won prizes are NOT tickets — use it or lose it

Confirmed the mechanic: winning a non-weekly freeroll auto-reserves you
into the very next occurrence of that category's Runner tier — no
choosing when, no saving it for later, fundamentally different from a
Main Event ticket (which you hold and redeem whenever you want).

That distinction wasn't visible anywhere before this — a won prize looked
identical to a reservation you clicked "Enter" on yourself. Fixed:

- Added a `source` field to reservations (`self` / `freeroll_prize` /
  `freeroll_bonus`), set correctly at the moment a prize is actually
  awarded, exposed through the API
- My Contests now shows a gold "🎁 Free entry you WON" badge and a gold
  highlight on any reservation that came from a prize, with explicit
  "use it or lose it" copy explaining it's locked into the next round
  automatically
- Added a dedicated Rules entry making the ticket-vs-prize distinction
  unambiguous for anyone reading the rules cold, not just people who
  happen to win and see the badge

Verified directly: both prize types persist with the correct `source`
value. Full regression suite still passes.

**Schema changed this round** (`pending_allocations` gained a `source`
column) — fresh sign-up needed after this deploy, same as any other
schema change.

## Hourly freeroll now runs every OTHER hour, paid tiers unchanged

The Freeroll level of Hourly now opens only on even ET hours (12am, 2am,
4am...) — anchored to midnight ET as the daily reference point, computed
from the actual ET-local hour rather than UTC (ET's offset from UTC is
always an odd number, so checking parity on raw UTC hours would have
flipped which hours count as "even"). Every other level (Runner, Clerk,
Trader, Jr. Stonkbroker) is unaffected — still opens every single hour,
24/7, exactly as before.

Verified directly: at an odd ET hour, exactly 4 of Hourly's 5 levels are
open (paid only); one hour later, at the next even ET hour, all 5 are open
including Freeroll.

## Onboarding's "ready for more" prompt is now properly delayed

Previously fired within seconds of finishing portfolio setup. Now it
waits for a real window: **after** the trader's freeroll actually resolves
but **before** their next hourly freeroll opportunity opens — a genuine
1-hour gap, now that Hourly's freeroll runs every other hour. Anchored to
the *actual* room's real lock time (or, for a reserved-but-not-yet-open
room, an estimate of open time + 1hr), not a guess.

Checked on every page load and every 60 seconds while the tab stays open,
so it fires reliably whether the trader closes the tab and comes back
later or leaves it open through the window. If they don't return during
the eligible window at all, the sequence ends quietly rather than showing
a stale prompt days later.

## Onboarding reordered: Weekly (bigger prize) leads, Hourly bridges the wait

Previous order led with Hourly (chosen for immediacy). New order leads
with the bigger hook instead:

1. **Weekly first** — "You're playing for a real Main Event ticket," CTA
   enters the free Weekly contest directly
2. **Set up that portfolio**
3. **Bridge to Hourly** — only shown if an Hourly free roll happens to be
   open right at that moment (checked live, not assumed) — "while Weekly
   plays out, try Hourly too." If Hourly isn't open at that exact instant,
   skips straight to step 5 rather than showing a dead-end prompt
4. **Set up that portfolio too**
5. **Delayed "ready for more" prompt** — same mechanic as before, waits for
   the real gap after the most recent contest resolves

Net effect on a good run: a brand-new signup can end up with two separate
free contests running before ever seeing a paid prompt — genuinely an
hour-plus of engagement on their first visit.

Refactored the underlying plumbing while doing this: `joinSatellite` and
`reserveRoom` now take an `onboardingFromStep` parameter (was a boolean)
so the same two functions correctly drive both the Weekly and Hourly
onboarding transitions instead of only ever assuming Hourly. Caught and
removed a real redundant-call bug in the process — the old code would have
advanced the onboarding step even if the entry itself failed.

## New: Stonk Broker NFT quote in the Lobby

Fourth stat block, next to the existing Main Event countdown/entries/
brokers-locked trio — shows the real acquisition + activation cost
(733,332 STONK, converted live to USD) as the headline number, with the
exact STONK amount available on hover. Deliberately grounded in the real
number the platform itself pays to fund one Broker, not an invented market
price.

## Made "Runner-level ticket" explicit everywhere Hourly/Daily freerolls appear

Every mention of a non-Weekly freeroll now explicitly says what it's
actually playing for — a ticket into that same category's Runner-level
satellite — instead of leaving it vague or (worse) implying a Main Event
ticket the way generic "🎟️ funded" language could read. Fixed across: the
Lobby/landing freeroll callout strip, the category hover tooltips, the
onboarding popups, the room chip hover stats, the entry review note before
confirming, and the Leaderboards Live drill-down.

**Found a real accuracy bug while doing this, not just a wording one**:
every freeroll room's "tickets funded" figure was computed from that
room's own pool — which is always $0 by definition for a freeroll — so it
displayed **0, always, everywhere**, completely independent of whether a
real prize was actually banked in that category's separate freeroll fund.
A trader could be looking at a chip with a genuinely funded, ready-to-win
Runner-level ticket sitting there and see "0 funded" regardless. Fixed by
reading the real number from the correct table for freeroll rooms
specifically — verified directly: funded a category's pool past its
threshold and confirmed the chip's number flips from 0 to 1, correctly,
where it previously would have stayed at 0 forever.

## Mobile alignment pass

Audited every element added in the later rounds of this session against
the existing mobile breakpoints — found several genuinely never got
phone-width treatment at all, since they were built and tested primarily
against desktop widths:

- **`.pct-btns`** (the 25/50/75/100/custom row in the trade modal) had
  **no wrap fallback whatsoever** — on a narrow phone this would overflow
  horizontally rather than reflow. Fixed with `flex-wrap:wrap`, safe at
  any width since it only engages when space actually runs out.
- **Panel headers** (Markets, My Watchlist) had the same no-wrap risk if
  header text ran long — same fix.
- **Freeroll callout strip** — fixed `min-width:150px` items produced an
  uneven 2-then-1 layout on phone widths. Now stacks full-width below 600px.
- **Weekly freeroll banner** — the text block's `min-width:260px` left
  almost no room beside it on a phone, forcing an awkward near-empty wrap.
  Now stacks cleanly, button goes full-width.
- **Trade modal header** (symbol picker + price + portfolio total) — the
  `margin-left:auto` push that works fine on desktop doesn't behave
  predictably once the row actually wraps. Now stacks explicitly below 600px.
- **Entry group tree** — a fixed 52px side label next to a row that can
  itself wrap onto multiple lines looked visually off-center on narrow
  screens. Label now stacks above the row instead of beside it.
- **Onboarding, entry review, and trade settings modals** — width now
  respects actual phone padding instead of fighting a fixed max-width.

Verified CSS braces balanced and `app.js` still parses clean after the
pass. No backend changes.

## Fixed: Hourly nudge never firing, and Weekly Freeroll hype stats

**The "to_hourly" onboarding prompt only fired after a successful trade or
portfolio save** — if a trader entered Weekly's freeroll and then just
browsed around instead of immediately configuring it, that trigger never
ran and the Hourly nudge could go a long time, or forever, without
appearing. Added a real fallback: 12 minutes after Weekly entry, the nudge
fires anyway if the trader is still on that step, regardless of whether
they've configured Weekly yet. Whichever happens first — finishing setup,
or the 12-minute mark — advances the sequence. Checked every 60 seconds
alongside the existing delayed-ready check, so it fires reliably whether
the tab stays open or they come back later.

**Weekly Freeroll banner now shows real, live hype stats** — this week's
entrant count, how many Main Event tickets are currently banked and ready
to award (reusing the accuracy fix from last round), and a running
all-time total of free Main Event tickets awarded through Weekly Freeroll
specifically. All funded genuinely by entry fees across every paid Weekly
Qualifier tier — a real, growing number, not a gimmick. Verified directly
that the lifetime counter accumulates correctly as prizes get awarded.

## Final wrap-up round

**Weekly's real hours fixed** — was computing midnight Monday to 11:59pm
Friday; now correctly 9:30am ET Monday (opening bell) to 4:00pm ET Friday
(closing bell). Fixed at the source (`currentWeekWindow`), so both the
Main Event and Weekly Qualifier — which deliberately share this window —
are both correct now, not just the copy describing them.

**Degen Hours** (renamed from Hourly, display-only — internal id stays
`hourly` since it's a foreign key across three tables):
- Freeroll reverted back to every hour (undoing the every-other-hour
  cadence from a few rounds back)
- Paid tiers now genuinely unlimited entries — found and fixed **three
  separate spots** that would have silently broken with a `null` "no cap"
  sentinel (a `>=` comparison coercing `null` to `0`, a `??` fallback that
  would've overridden an explicit `null` back to 10, a subtraction that
  would've gone negative)
- Registration stays open the entire hour, cutting off 5 minutes before close

**Registration timing overhaul**: Full Day/Morning/Afternoon/Weekly PAID
tiers now close registration the moment the session starts — reserve
ahead or miss it. Every freeroll, any category, remains the deliberate
exception and stays open the whole session, including Weekly's. Verified
all seven scenarios directly.

**Found and fixed a genuinely deeper bug during the holistic review**: the
10% position cap has THREE separate enforcement points across the
codebase (live trading, pre-registering picks, and scheduled-order
execution) — the live-trading one already had the Degen Hours exception,
but **the other two didn't**. This meant pre-registering a >10% allocation
for Degen Hours, or scheduling one to fire at market open, would have been
silently rejected — directly undermining the whole point of Degen Hours
for anyone using either of those two paths instead of trading live. Fixed
both, verified directly with a real allocation that's rejected everywhere
except Degen Hours, exactly as intended.

**Also fixed 2 real syntax breaks introduced mid-edit** during this round
— caught both immediately via syntax-check-after-every-edit, not left for
later discovery.

Full regression suite (accounting, ladder math, this round's new rules)
all pass. Rules page updated with a new entry explaining the registration
window change, and the Degen Hours block expanded with the unlimited-
rebuys detail, kept playful throughout.

### Known, pre-existing limitations (not new gaps, worth restating)
- Wallet connection is explicitly simulated (see the code comment) — no
  real wallet integration exists
- Market data is still fully simulated, never connected to a real feed
- Render's free tier resets the DB on redeploy — no persistent production
  storage yet
- Admin metrics dashboard was scoped early on but never built

## Race to the Close — fully built and verified end-to-end

**New category**: Runner/Clerk/Trader/Jr. Stonkbroker only, no freeroll of
its own. Runs once a day, 3:30–4:00pm ET, weekdays only — the last 30
minutes of the trading session.

**Degen Hours restricted to real market hours**: 9:30am–3:30pm ET,
weekdays only, six hourly slots offset to :30 past the hour (9:30, 10:30
... 2:30) so it tiles perfectly against Race to the Close with zero gap
or overlap. No longer 24/7.

**The core mechanic**: a Degen Hours freeroll win now redirects its prize
to that day's Race to the Close instead of that hour's own Runner room.
Every win, any hour, stacks another free ticket toward the same 3:30
finale — verified directly with real stacked entries, not just logic
review. Direct paid buy-ins compete in the exact same room, same rules,
up to the standard 10-entry cap combining both sources.

**Registration**: Race to the Close stays open for buy-ins the entire 30
minutes (matching Degen Hours' own exception to the normal "closes at
session start" rule), cutting off in the final 2 minutes — proportionally
similar to Degen Hours' 5-of-60.

**Two real bugs found and fixed during the build**:
- `easternParts()`, a shared time utility used throughout the scheduler,
  never actually requested minute-level precision from the formatter — it
  silently returned `undefined` for minutes. This would have broken the
  new :30-boundary slot logic in a way that's easy to miss without
  integration testing. Caught because a real end-to-end test failed,
  traced to the actual root cause, fixed the shared utility after
  confirming it was safe for every existing caller.
- The frontend's "registration closed" check needed its own Race to the
  Close exception, or the UI would have blocked buy-ins the backend
  correctly allows.

**Tested directly, not just reviewed**: category exists with the right
levels and no freeroll; a real Degen Hours win produces a reservation
targeting `race_to_close`/`runner`, not its own hour; two wins in one day
produce two stacked entries; both correctly auto-apply the moment Race to
the Close opens; a directly-paying entrant competing in the same room
wins on merit. Full existing regression suite still passes unchanged.

Rules page, onboarding popup, Lobby category descriptions, and the
landing/Lobby freeroll callout strips all updated to describe the actual
new mechanic — swept for every remaining "24/7" and "every hour" claim
left over from the previous design.

## Full Day / Morning / Afternoon freerolls now converge on Weekly Qualifier

Winning any of the three daily freerolls (Full Day, Morning, Afternoon) now
redirects to a ticket into **Weekly Qualifier's Runner tier** specifically,
instead of that same category's own Runner room. Degen Hours is untouched
— still redirects to Race to the Close, built last round. Weekly
Qualifier's own freeroll is also untouched — still gives a direct,
guaranteed Main Event ticket the moment its own fund has one banked,
subsidized exactly as it always has been; it never runs through this
redirect logic at all, confirmed directly rather than assumed.

Net effect: every daily freeroll winner now funnels real, meaningful
volume into Weekly Qualifier specifically, rather than each category
running its own small, disconnected Runner room.

Verified directly against all four categories — Full Day, Morning, and
Afternoon all correctly redirect to `weekly_qualifier`; Degen Hours still
correctly redirects to `race_to_close`; Weekly's own freeroll config
confirmed unchanged. Full existing regression suite (accounting, Race to
the Close end-to-end) still passes.

Updated the callout strip, category descriptions, and the Rules page
wherever the old "same category's own Runner tier" language appeared.

## Suggested next steps

### Note for real-money integration (not built yet, just a stated requirement)
When real wallet integration exists: **paid tiers should require a
connected wallet, the freeroll and account signup should not.** Someone
should be able to sign up with email/Google/Facebook and play the freeroll
entirely wallet-free — wallet connection only becomes necessary the moment
they want to move up to a paid tier. This is already naturally true in the
current paper-trading build (Connect Wallet has always been cosmetic, never
gating anything) — just flagging it explicitly so it doesn't get lost when
real wallet auth eventually gets built.


1. `npm install && npm start` locally, create a couple of test accounts, confirm
   the trade flow and leaderboard update as expected.
2. Wire the contest tier/entry-fee logic from the marketing prototype into this
   backend (a `contests` and `contest_entries` table are already scaffolded in
   `db.js`, just not yet wired to routes).
3. Decide on a hosting target (Render, Railway, Fly.io, or a small VPS all work
   fine for this scale) and deploy.
4. Evaluate Alpaca for real US market data once you're ready to leave mock data.
