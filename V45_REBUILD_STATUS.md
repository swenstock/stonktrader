# Stonk Broker Challenge — V45 Simulated Launch Status

Branch: `v45-rebuild`

This branch is the simulated public build being promoted to `main` after the final green CI gate.

## Implemented and test-covered

- Locked player prices:
  - Runner 100 STONK
  - Clerk 200 = 150 contest + 50 protected freeroll reserve
  - Trader 400 = 350 + 50
  - Jr. Stonkbroker 1,050 = 1,000 + 50
- Exact 15% rake on contest portion, preserving half-STONK precision.
- Affiliate slice 5%; platform slice 10% when affiliate applies; unused affiliate slice remains platform revenue.
- Top-10% payout planner.
- Baseline ticket ladder:
  - Freeroll -> 2 Runner
  - Runner -> 2 Runner
  - Clerk -> 2 Runner
  - Trader -> 2 Clerk
  - Jr. Stonkbroker -> 2 Trader
- Main Event upgrade replaces baseline pair.
- Main Event ticket backing = 3,000 STONK; market resale price is independent.
- Main Event Reserve accounting.
- Deterministic top-down residual STONK bonuses.
- Atomic settlement executor and explicit underfunded-settlement guard.
- V45 satellite scheduler/resolver is now the application default; `PAYOUT_ENGINE_V45=legacy` is an intentional QA rollback only.
- Deterministic simulated quote engine driven by Test Clock.
- Test Clock interprets bare date/time as America/New_York including DST.
- Compressed TEST_MODE sessions default to 20 minutes so real Degen cutoff rules remain testable.
- Compressed TEST_MODE rooms may trade within their synthetic open/lock window even on weekends/after hours; production-duration rooms still enforce U.S. equity market hours.
- Existing portfolio/trade engine uses the deterministic provider.
- Server-authoritative percentage quick trades.
- Standard 10% cost-basis entry rule.
- Degen Hours percentage buys use available cash and no 10% cap.
- Typed ticket inventory: Runner / Clerk / Trader / Jr. / Main Event.
- True player-to-player order book: Bids left, Offers right, Sell to Bid, Buy Offer, one ticket/order.
- Exchange fee configurable, default 0 until product decision.
- Freeroll V45 reserve ledger separated from legacy prize counters.
- Degen Hours + Race protected contributions share the V45 `degen` acquisition reserve.
- Main Event funding/economics API.
- Full-field V45 leaderboard API with Find Me, money line, all entries, and P&L gap/cushion.
- V45 frontend at `/v45/`; root `/` redirects to it.
- Obsolete prior frontend copies have been removed from the working branch; Git history preserves them.
- Victory StonkBroker trophy artwork replaces the generic trophy treatment in the welcome/tutorial and win-oriented lobby cues.
- Chart-first execution page at `/v45/trade.html?id=<portfolioId>` with candles/line, Tick/1m/5m/15m/1h/1D, volume, MA/EMA, crosshair, positions, symbol lookup and Shares/Percentage quick trading.
- Full-field Find Me page at `/v45/leaders.html`.
- GitHub Actions CI covers syntax, payout math, reserves, exact rake, scheduler behavior, atomic settlement, server boot, frontend shells and an end-to-end simulated user journey.

## Safety / feature flags

- `TEST_MODE=true` enables Test Clock and test-only funding/ticket tools.
- `/api/dev/*` returns 404 unless TEST_MODE is enabled.
- V45 payout engine is default. `PAYOUT_ENGINE_V45=legacy` is rollback-only.
- `MARKET_DATA_PROVIDER=demo` uses deterministic simulation.
- `MARKET_DATA_PROVIDER=live` intentionally fails until a licensed live provider is actually connected.

## Deliberately unresolved before any real-money launch

### 1. Lower-tier ticket redemption backing

When a won/purchased Clerk/Trader/Jr. ticket is redeemed for a future contest, final backing routing still needs an explicit product decision. Do not invent this for real-money settlement.

### 2. Freeroll capacity when reserve is smaller than top-10% liability

V45 refuses to create unfunded prizes. Current behavior blocks an underfunded settlement explicitly rather than silently changing the payout or subsidizing it from SBC revenue. A production player-facing capacity/prefunding rule must be chosen before real-value launch.

## Simulated launch boundary

This build is suitable for public simulated/paper-trading testing. It is **not** a real-money production launch:

- no real wallet/token custody or settlement is connected;
- no licensed live quote vendor is connected;
- lower-tier real-value redemption is not final;
- real-money security/compliance/legal review remains outstanding.

## Launch rule

Promote to `main` only after the latest CI run is green. After merge, verify the Render deployment and custom domain separately; GitHub alone cannot prove the Render/DNS mapping.
