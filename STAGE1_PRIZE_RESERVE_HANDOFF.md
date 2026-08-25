# Stage 1 Prize Reserve Ledger — Handoff

Scope is intentionally limited to the ledger foundation from the SBC Prize Ladder roadmap.

## Implemented

- Two new prize-reserve accounts only: `broker_reserve` and `overflow_reserve`.
- All prize-reserve amounts stored as integer 1/1,000,000-STONK sub-units.
- JavaScript reserve arithmetic accepts `bigint` only; number-valued STONK inputs are rejected.
- SQLite columns enforce `typeof(...) = 'integer'` and non-negative balances/credits.
- One atomic issuance-credit record per `issuance_id`, enforced by a primary key.
- Duplicate issuance IDs reject and roll back without altering either reserve.
- Prize reserve schema is initialized by the existing `schemaV45.run()` startup path.

## Explicitly not implemented

- No player-facing UI changes.
- No Junior ownership or issuance flow.
- No direct Junior mint/purchase flow.
- No 20-Junior redemption flow.
- No burn mechanism.
- No changes to order entry, leaderboards, contest rules, rake behavior, or current-site look and feel.
- Existing legacy `sbc_reserve_ledger` / freeroll accounting remains untouched because it is a separate legacy REAL-valued system; the new prize ladder uses `sbc_prize_reserve_*` tables exclusively.

## Acceptance behavior exercised

`server/prizeReserveLedgerStage1.test.js` executes a real in-memory SQLite database and the real Stage 1 module.

It verifies:

1. `36,666.6 STONK = 36,666,600,000` integer sub-units.
2. Crediting that Broker share 20 times produces exactly `733,332,000,000` sub-units = `733,332 STONK`.
3. Twenty won-Junior overflow shares of `3,333.4 STONK` produce exactly `66,668 STONK`.
4. Reusing an issuance ID throws `DUPLICATE_ISSUANCE` and leaves both balances unchanged.
5. Passing JavaScript `number` values into either STONK amount fails before persistence; `bigint` is required.
6. Direct SQL insertion of a REAL value into the prize-reserve integer columns fails the SQLite CHECK constraint.
7. Stored account and issuance amount types are verified as SQLite `integer` values.

## Architecture note

Stage 1 intentionally exposes a generic `creditIssuance(...)` ledger primitive. Stage 2 should extend this same path with the finalized won/minted Junior split and ownership issuance; it should not build a second reserve implementation.
