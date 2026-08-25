# Prize Integration A — Pooled Junior Funding Foundation

This is **not Stage 5+ future-tier work**. It is the integration foundation needed to connect real post-rake contest proceeds to the already-approved Junior issuance system without double-spending the current 85% player pool.

## Why this stage is separate

The current Main Event settlement still spends its entire post-rake player pool through the old direct Broker/remainder payout model, and paid satellites spend their post-rake pool through the existing ticket/cash ladder.

Crediting those same proceeds into the new Junior reserve path at the same time would double-allocate the same STONK.

Therefore this stage deliberately builds and proves the pooled accounting first, but does **not** wire it into live contest settlement yet. The next cutover must retire the superseded payout destination in the same atomic change that starts feeding this pool.

## Two reserves only — no third Junior reserve

The approved reserve structure remains exactly:

- `broker_reserve`
- `overflow_reserve`

There is no Junior reserve account.

The Broker Reserve itself holds both:

1. STONK already backing outstanding Junior holdings; and
2. post-rake contest funding not yet allocated to a Junior.

The unallocated contest funding amount is derived, not stored in a third account:

`Broker Reserve balance - (outstanding Junior quantity × 36,666.6 STONK)`

If Broker Reserve balance is ever below that outstanding Junior backing liability, the pool reports `RESERVE_BACKING_DEFICIT` instead of pretending funding exists.

## Exact won-Junior allocation from pooled funding

A won Junior consumes exactly 40,000 STONK of unallocated pooled funding:

- 36,666.6 STONK remains in Broker Reserve and becomes backing for the newly issued Junior;
- 3,333.4 STONK moves internally from Broker Reserve to Overflow Reserve;
- the player's `junior_broker_share` holding increases by exactly 1.

This means the reserve is **not credited a second time** when a pooled Junior is issued. The STONK already arrived through prior contest-funding credits.

Pooled issuance records one `sbc_prize_pool_allocations` row keyed by the real Junior `issuance_id`, then reuses the Stage 2 ownership/issuance recorder. The existing external won/minted issuance path still uses `sbc_prize_reserve_issuance_credits` as before.

## New exact ledger primitives

`server/prizeReserveLedger.js` now adds:

- `sbc_prize_reserve_funding_credits`
  - unique `funding_id`
  - exact integer sub-units
  - source type/source ID
  - prevents the same contest funding event being credited twice
- `sbc_prize_reserve_transfers`
  - unique `transfer_id`
  - exact integer sub-units
  - supports the internal 3,333.4-STONK Broker → Overflow move without treating it as new external funding

All new STONK amounts are `bigint` in JavaScript and SQLite `INTEGER` in storage.

## Exact 15% rake helper

`computePostRakeNetSubunits(...)` performs the 15% rake calculation entirely in integer sub-units using basis points.

It never rounds a fractional sub-unit. If a gross amount would produce a fraction smaller than 1/1,000,000 STONK, it throws `RAKE_SUBUNIT_REMAINDER` instead.

`parseStonkDecimalToSubunits(...)` accepts decimal **strings only**, up to six fractional digits. It does not accept JavaScript floating-point numbers.

## Cross-contest accumulation proof

The behavioral test proves:

- Contest A contributes 20,400 STONK post-rake → not enough for a Junior.
- Contest B contributes another 20,400 → pooled unallocated funding becomes 40,800.
- One won Junior is issued:
  - 36,666.6 remains as Broker backing;
  - 3,333.4 moves to Overflow;
  - 800 STONK remains unallocated and carries forward.
- The same contest funding ID cannot be credited twice.
- A second Junior cannot be issued before enough additional pooled funding arrives.
- Additional contest funding can combine with the 800-STONK carry to fund the next Junior.

## Full-cycle proof using current Main Event entry economics

The test also models the existing 3,000-STONK Main Event entry price without changing live settlement:

- 320 entries × 3,000 = 960,000 STONK gross
- exact 15% rake leaves 816,000 STONK
- 20 won Juniors consume 800,000 total funding
- Broker Reserve contains 733,332 STONK of Junior backing plus 16,000 STONK unallocated carry
- Overflow contains exactly 66,668 STONK
- redeeming the 20 Juniors debits exactly 733,332 STONK
- the 16,000-STONK carry remains available for future contests
- Overflow remains untouched by redemption

## Stage 2 refactor

Stage 2 now exposes `recordJuniorIssuanceInTransaction(...)` so pooled funding and direct external funding share the same ownership/issuance write path.

The existing Stage 2 `issueFundedJuniorBrokerShare(...)` still performs its original reserve credit first, then calls that shared recorder. Pooled issuance skips the external reserve credit and calls only the shared recorder after the internal Broker → Overflow allocation.

This is one issuance implementation, not parallel ownership logic.

## Startup wiring

`schemaV45.run()` initializes the new pool/ledger tables through `ensureContestJuniorFundingPoolSchema(db)`.

This is schema-only. It does not alter current contest payouts.

## Explicitly NOT changed in this stage

- no Main Event settlement cutover yet
- no satellite settlement cutover yet
- no change to current 15% rake rates
- no change to ranking, trading, order entry, contest lifecycle, or leaderboards
- no new player UI
- no direct-mint payment rail
- no on-chain Broker delivery adapter
- no Trader/Clerk/Runner future-tier configuration
- no third reserve account

## Next cutover after verification

Once this foundation is independently approved, the production integration should migrate one prize path at a time — beginning with the old Main Event direct-Broker allocator — so the same 85% player pool is never simultaneously spent by the old model and credited to the new pooled Junior model.
