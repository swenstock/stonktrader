Stage 3 only: generic data-driven tier burn mechanism.

Key points:
- reuses Stage 1/2 `debitReserveInTransaction(...)`; no third transaction pattern
- refactors Stage 2 Junior → Broker redemption through the generic engine
- keeps Stage 2 outward behavior unchanged
- widens `sbc_prize_holdings` from Junior-only to generic asset identifiers while preserving existing Junior rows
- config drives source type, target type, ratio, reserve bucket, exact reserve debit, and reason
- generic engine always funds exactly one target unit
- no real Trader/Clerk/Runner configs yet
- no UI or site styling changes

Acceptance tests:
- exact configured 4→1 burn/debit
- fewer than ratio rejected with zero mutation
- entirely different 7→1 future tier works by config alone
- Stage 2 Junior→Broker creates a generic burn row proving shared code path
- legacy Junior holdings survive holdings-table widening
- Stage 1 + Stage 2 behavioral tests rerun unchanged
