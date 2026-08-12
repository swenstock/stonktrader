// Market data layer — pluggable by design.
//
// MockProvider (active below) runs fully offline: a random-walk price simulator
// seeded with real recent prices, covering both US and foreign tickers so you
// can build and demo the whole app with zero API keys or data bills.
//
// When you're ready to go live, swap the body of getQuote()/getQuotes() for a
// real provider behind this exact same interface — nothing else in the app
// needs to change. See the commented example at the bottom for the shape
// (Alpaca's free Market Data API covers US equities well; foreign markets need
// a separate vendor per exchange — see the "Foreign markets" note in README.md).

const SYMBOLS = {
  // US — NASDAQ / NYSE
  AAPL: { name: "Apple Inc.", exchange: "NASDAQ", currency: "USD", base: 231.4 },
  MSFT: { name: "Microsoft Corp.", exchange: "NASDAQ", currency: "USD", base: 512.9 },
  NVDA: { name: "NVIDIA Corp.", exchange: "NASDAQ", currency: "USD", base: 220.3 },
  TSLA: { name: "Tesla Inc.", exchange: "NASDAQ", currency: "USD", base: 332.9 },
  AMZN: { name: "Amazon.com Inc.", exchange: "NASDAQ", currency: "USD", base: 272.5 },
  GOOGL: { name: "Alphabet Inc.", exchange: "NASDAQ", currency: "USD", base: 345.1 },
  HOOD: { name: "Robinhood Markets", exchange: "NASDAQ", currency: "USD", base: 61.85 },
  COIN: { name: "Coinbase Global", exchange: "NASDAQ", currency: "USD", base: 288.55 },
  JPM: { name: "JPMorgan Chase", exchange: "NYSE", currency: "USD", base: 362.3 },
  WMT: { name: "Walmart Inc.", exchange: "NYSE", currency: "USD", base: 113.1 },
  // Foreign markets — one representative ticker per exchange, extend as needed
  "HSBA.L": { name: "HSBC Holdings", exchange: "LSE", currency: "GBP", base: 7.12 },
  "SHOP.TO": { name: "Shopify Inc.", exchange: "TSX", currency: "CAD", base: 118.4 },
  "BHP.AX": { name: "BHP Group", exchange: "ASX", currency: "AUD", base: 43.2 },
  "7203.T": { name: "Toyota Motor Corp.", exchange: "TSE", currency: "JPY", base: 2890 },
  "SAP.DE": { name: "SAP SE", exchange: "XETRA", currency: "EUR", base: 231.8 },
};

const state = {};
for (const [sym, meta] of Object.entries(SYMBOLS)) {
  state[sym] = { ...meta, symbol: sym, price: meta.base, prevClose: meta.base };
}

function tick() {
  for (const sym of Object.keys(state)) {
    const pct = (Math.random() - 0.5) * 0.01; // +/-0.5% per tick
    state[sym].price = Math.max(0.01, state[sym].price * (1 + pct));
  }
}
const tickInterval = setInterval(tick, 2000);
tickInterval.unref?.(); // don't keep the process alive just for this timer

function listSymbols() {
  return Object.values(state).map((s) => ({
    symbol: s.symbol,
    name: s.name,
    exchange: s.exchange,
    currency: s.currency,
  }));
}

function getQuotes(symbols) {
  return symbols
    .map((sym) => {
      const s = state[sym.toUpperCase()];
      if (!s) return null;
      const changePct = ((s.price - s.prevClose) / s.prevClose) * 100;
      return {
        symbol: s.symbol,
        name: s.name,
        exchange: s.exchange,
        currency: s.currency,
        price: Number(s.price.toFixed(2)),
        changePct: Number(changePct.toFixed(2)),
      };
    })
    .filter(Boolean);
}

function getQuote(symbol) {
  return getQuotes([symbol])[0] || null;
}

/*
 * ---- REAL PROVIDER SWAP-IN (reference shape, not wired up) ----
 *
 * US equities via Alpaca's free Paper Trading / Market Data API:
 *
 *   async function getQuoteReal(symbol) {
 *     const res = await fetch(`https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest`, {
 *       headers: {
 *         "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID,
 *         "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
 *       },
 *     });
 *     const data = await res.json();
 *     return { symbol, price: data.quote.ap };
 *   }
 *
 * Foreign markets: Alpaca is US-only, so each exchange (LSE, TSX, ASX, XETRA,
 * TSE, etc.) needs its own data vendor behind this same getQuote(symbol)
 * interface — route by the `exchange` field already attached to each symbol
 * above. Budget real time for evaluating vendors per market: pricing, delay
 * (real-time vs 15–20 min delayed), and redistribution licensing terms vary
 * a lot by exchange.
 */

module.exports = { listSymbols, getQuotes, getQuote, SYMBOLS };
