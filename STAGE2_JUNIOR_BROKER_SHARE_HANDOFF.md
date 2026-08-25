# Stage 2 Junior Broker Share — Handoff

Scope is limited to Stage 2 of the finalized SBC Prize Ladder roadmap. No player-facing UI is changed.

## Internal identifier decision

The existing ticket system already uses `ticket_type='junior'`. Stage 2 therefore uses the distinct internal asset identifier:

`junior_broker_share`

This is internal-only. Player-facing branding can still say “Junior” later in Stage 4.

## Implemented

- Extends the Stage 1 integer-only reserve ledger; no parallel reserve implementation.
- Won Junior funded issuance:
  - 40,000 STONK total
  - 36,666.6 STONK Broker Reserve
  - 3,333.4 STONK Overflow Reserve
- Minted Junior funded issuance:
  - 48,000 STONK total
  - 36,666.6 STONK Broker Reserve
  - 11,333.4 STONK Overflow Reserve
- Both paths use the exact same 36,666.6-STONK Broker Reserve share.
- Player holdings stored as integer counts of `junior_broker_share`.
- Issuance is atomic with reserve funding and holding increment.
- Duplicate issuance IDs reject through the Stage 1 issuance ledger and roll back the holding change.
- Redemption requires at least 20 shares.
- Redemption burns exactly 20 and preserves any remainder above 20.
- Redemption debits exactly 733,332 STONK from Broker Reserve.
- Redemption checks Broker Reserve solvency before committing; a short reserve rejects and rolls back without burning holdings.
- Overflow Reserve is never consumed by Broker redemption.
- Reserve debits are idempotently tracked by unique debit IDs and integer-only storage.

## Explicit roadmap deviation / external boundary

The repository does not contain an on-chain/custody adapter that can transfer a StonkBroker NFT to a wallet. Therefore Stage 2 records a fully funded Activated Broker redemption with status:

`funded_pending_delivery`

The internal SBC redemption is complete only after 20 shares are burned and 733,332 STONK is successfully debited from Broker Reserve. Actual NFT/wallet delivery remains an external fulfillment integration and is not falsely represented as completed.

## Prepaid-only interpretation

`issueFundedJuniorBrokerShare(...)` is deliberately named as a funded issuance primitive. The reserve credit and player issuance occur in one transaction; if the reserve credit cannot be committed, the holding is not issued. Stage 2 does not yet wire contest-rake capture or a wallet/payment rail into this function; those callers must supply only already-authorized funded issuance events.

## Explicitly not implemented

- No Stage 4 collection/progress UI.
- No changes to current site look/feel, header, navigation, order entry, charts, leaderboards, or contest rules.
- No Stage 3 general burn-tier mechanism.
- No Trader/Clerk/Runner future tiers.
- No direct on-chain NFT transfer adapter.
- No change to the existing `ticket_type='junior'` ticket system.

## Behavioral acceptance coverage

`server/juniorBrokerStage2.test.js` executes real Stage 1 + Stage 2 code against in-memory SQLite and verifies:

1. Won split is exact in integer sub-units.
2. Minted split is exact in integer sub-units.
3. Broker Reserve share is identical on both paths; only Overflow differs.
4. The full 8,000-STONK mint premium goes to Overflow.
5. Existing `ticket_type='junior'` remains untouched while Stage 2 stores only `junior_broker_share`.
6. Duplicate issuance cannot double-credit reserves or holdings.
7. 19 Juniors cannot redeem.
8. 20 Juniors redeem and leave zero.
9. 23 Juniors redeem and leave 3.
10. Redemption debits exactly 733,332 STONK from Broker Reserve and leaves Overflow untouched.
11. A deliberately short Broker Reserve blocks redemption and rolls back without burning the 20 Juniors.
12. Stage 2 money columns are verified as SQLite integer values.

The Stage 2 workflow also reruns the original Stage 1 behavioral test to protect the ledger foundation while extending it.
