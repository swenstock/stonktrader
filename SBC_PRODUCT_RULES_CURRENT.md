# SBC Product Rules — Current Authoritative Economics

**This file is the current source of truth for SBC product economics. If an older README, handoff, comment, fixture, or historical Main Event document conflicts with this file, this file wins.**

## Corporate Ladder

Tickets get you in. Badges get you promoted. There is no current Main Event contest. Historical Main Event records are read-only.

Paid contest tiers:
- Runner: 100 STONK; 100 contest portion; 0 Free Roll surcharge.
- Clerk: 200 STONK; 150 contest portion; 50 Free Roll surcharge.
- Trader: 400 STONK; 350 contest portion; 50 Free Roll surcharge.
- Jr. StonkBroker: 1,050 STONK; 1,000 contest portion; 50 Free Roll surcharge.

The contest portion carries a 15% rake. Paid contests protect the top 10% (rounded up). Fully funded Jr. Broker Badges are awarded from the top down first. Remaining protected places receive the tier fallback: Runner -> STONK; Clerk -> 2 Runner tickets; Trader -> 2 Clerk tickets; Jr. StonkBroker -> 2 Trader tickets.

## Jr. Broker Badge

One won Badge requires exactly 40,000 STONK of funding: 36,666.6 to Broker Reserve and 3,333.4 to Overflow Reserve. One minted Badge costs 48,000 STONK: 36,666.6 to Broker Reserve and 11,333.4 to Overflow Reserve. No underfunded Badge may be issued.

20 available Jr. Broker Badges promote to one Activated StonkBroker backed by exactly 733,332 STONK from Broker Reserve. A Badge listed for sale is not available for promotion.

## Free Roll

The dedicated Free Roll reserve accumulates the 50-STONK surcharges from Clerk, Trader, and Jr. StonkBroker paid entries. Every complete 40,000 STONK in the reserve can fund one Jr. Broker Badge, subject to available finishers. Any remainder below the next complete Badge stays in the Free Roll reserve and rolls forward. **There is no residual STONK cash payout from the Free Roll reserve.**

## Ticket ladder

10 Runner tickets may be burned for 1 Clerk ticket. 10 Clerk -> 1 Trader. 10 Trader -> 1 Jr. StonkBroker ticket. Tickets never burn directly into Badges. Matching tickets fund entry into their corresponding paid contest.

## Exchange

Tickets and Jr. Broker Badges may trade P2P. SBC charges a canonical 5% transaction fee on completed sales. Buyers pay the displayed price; sellers receive 95%. Posting and cancelling orders do not incur the transaction fee.

Badge listings reserve seller inventory. Listed Badges cannot simultaneously be used for promotion. Badge P2P trades move ownership only and do not alter Broker/Overflow backing.

Badge price warnings are soft confirmations, not hard limits: warn only when price is more than 25% from the reference price and is also outside the 36,666.6–48,000 sensible band. Reference is lowest active ask, falling back to last completed sale; no reference means no warning.

## Main Event retirement

The standalone Main Event is retired. No new Main Event entry, allocation, scheduler opening, settlement, or active leaderboard source is allowed. Any stale open Main Event entry is retired/refunded (or its applied ticket restored) by the retirement migration. Historical resolved results remain readable. The old `/v45/` standalone frontend redirects to the current root product.
