# SBC Meme Prize Preview V1 — Architecture

This preview branch is intentionally not another V45 enhancement layer. It reuses proven engines where useful and gives the new product a fresh ownership boundary.

## Product path

User -> Contest Catalog -> Tier x Category x Prize Asset -> USD Entry -> SBC Conversion Quote -> Entry -> Dedicated $100K Paper Portfolio -> Quotes/Chart/OE -> Leaderboard -> Prize Settlement.

Tickets, badge promotion, ticket exchange, badge exchange and Activated StonkBroker prize funding are not dependencies of the new shell.

## Central configuration

`config/product-catalog-v2.json` is the first source of truth for tier display names/prices, contest categories, prize assets, default quote symbols, wallet-provider capabilities and future provider contracts. UI labels should consume this registry instead of hard-coding assets throughout screens.

Initial tier prices are Runner $1, Clerk $5, Trader $15, Broker $50. Weekly Freeroll is $0.

Initial prize assets are AI, BONER and INCEL. Prize identity is referenced by stable `id`; display name/symbol/art/provider metadata may change without rewriting contest records.

## Provider boundaries

Market data retains the existing simulated/live provider split. The preview reuses `/api/quotes` and `/api/quotes/bars` so the quote window and chart already sit behind the proven provider boundary.

Future payment, wallet and settlement integrations must be adapters. Contest logic must not hold private keys or vendor-specific wallet logic.

## Active symbol ownership

One UI state owns `activeSymbol`. Quote-row clicks, basket-row clicks, chart title and order-entry symbol all route through `selectSymbol()`. New quote surfaces should call that path rather than reparenting or mutating unrelated widgets.

## Responsive ownership

Desktop and mobile use the same state, catalog and services. CSS changes composition only. There is no separate mobile business-logic renderer.

## Preview server

For a separate Render preview service use:

`node server/previewServer.js`

The service root serves the preview shell and does not redirect to the production custom domain. Production `main` is not changed by this branch.

## Explicitly simulated in V1

Wallet connection, SBC payment conversion/locking, contest entry, prize funding and prize settlement are modeled as future adapter boundaries but are not real custody or settlement in this preview. The quote window and chart use the repository's real simulated market-data provider paths.
