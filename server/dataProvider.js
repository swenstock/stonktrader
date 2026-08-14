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

const MIN_MARKET_CAP = 2_000_000_000; // $2B — no penny-stock/micro-cap YOLO plays

const SYMBOLS = {
  // US — NASDAQ / NYSE
  AAPL: { name: "Apple Inc.", exchange: "NASDAQ", currency: "USD", base: 231.4, marketCap: 3_600_000_000_000 },
  MSFT: { name: "Microsoft Corp.", exchange: "NASDAQ", currency: "USD", base: 512.9, marketCap: 3_800_000_000_000 },
  NVDA: { name: "NVIDIA Corp.", exchange: "NASDAQ", currency: "USD", base: 220.3, marketCap: 5_400_000_000_000 },
  TSLA: { name: "Tesla Inc.", exchange: "NASDAQ", currency: "USD", base: 332.9, marketCap: 1_050_000_000_000 },
  AMZN: { name: "Amazon.com Inc.", exchange: "NASDAQ", currency: "USD", base: 272.5, marketCap: 2_900_000_000_000 },
  GOOGL: { name: "Alphabet Inc.", exchange: "NASDAQ", currency: "USD", base: 345.1, marketCap: 2_100_000_000_000 },
  HOOD: { name: "Robinhood Markets", exchange: "NASDAQ", currency: "USD", base: 61.85, marketCap: 90_000_000_000 },
  COIN: { name: "Coinbase Global", exchange: "NASDAQ", currency: "USD", base: 288.55, marketCap: 68_000_000_000 },
  JPM: { name: "JPMorgan Chase", exchange: "NYSE", currency: "USD", base: 362.3, marketCap: 780_000_000_000 },
  WMT: { name: "Walmart Inc.", exchange: "NYSE", currency: "USD", base: 113.1, marketCap: 780_000_000_000 },
  // Tech / software
  META: { name: "Meta Platforms", exchange: "NASDAQ", currency: "USD", base: 590.2, marketCap: 1_500_000_000_000 },
  NFLX: { name: "Netflix Inc.", exchange: "NASDAQ", currency: "USD", base: 780.4, marketCap: 340_000_000_000 },
  ORCL: { name: "Oracle Corp.", exchange: "NYSE", currency: "USD", base: 168.3, marketCap: 470_000_000_000 },
  ADBE: { name: "Adobe Inc.", exchange: "NASDAQ", currency: "USD", base: 520.6, marketCap: 235_000_000_000 },
  CRM: { name: "Salesforce Inc.", exchange: "NYSE", currency: "USD", base: 330.1, marketCap: 315_000_000_000 },
  INTC: { name: "Intel Corp.", exchange: "NASDAQ", currency: "USD", base: 22.4, marketCap: 95_000_000_000 },
  AMD: { name: "Advanced Micro Devices", exchange: "NASDAQ", currency: "USD", base: 165.8, marketCap: 267_000_000_000 },
  QCOM: { name: "Qualcomm Inc.", exchange: "NASDAQ", currency: "USD", base: 168.2, marketCap: 187_000_000_000 },
  CSCO: { name: "Cisco Systems", exchange: "NASDAQ", currency: "USD", base: 58.3, marketCap: 232_000_000_000 },
  IBM: { name: "IBM Corp.", exchange: "NYSE", currency: "USD", base: 225.7, marketCap: 208_000_000_000 },
  UBER: { name: "Uber Technologies", exchange: "NYSE", currency: "USD", base: 72.1, marketCap: 150_000_000_000 },
  PYPL: { name: "PayPal Holdings", exchange: "NASDAQ", currency: "USD", base: 78.4, marketCap: 82_000_000_000 },
  SNOW: { name: "Snowflake Inc.", exchange: "NYSE", currency: "USD", base: 165.2, marketCap: 53_000_000_000 },
  PLTR: { name: "Palantir Technologies", exchange: "NASDAQ", currency: "USD", base: 42.6, marketCap: 95_000_000_000 },
  // Finance
  BAC: { name: "Bank of America", exchange: "NYSE", currency: "USD", base: 42.3, marketCap: 325_000_000_000 },
  WFC: { name: "Wells Fargo & Co.", exchange: "NYSE", currency: "USD", base: 68.5, marketCap: 240_000_000_000 },
  GS: { name: "Goldman Sachs Group", exchange: "NYSE", currency: "USD", base: 480.9, marketCap: 155_000_000_000 },
  MS: { name: "Morgan Stanley", exchange: "NYSE", currency: "USD", base: 105.3, marketCap: 175_000_000_000 },
  V: { name: "Visa Inc.", exchange: "NYSE", currency: "USD", base: 280.4, marketCap: 590_000_000_000 },
  MA: { name: "Mastercard Inc.", exchange: "NYSE", currency: "USD", base: 480.1, marketCap: 450_000_000_000 },
  AXP: { name: "American Express", exchange: "NYSE", currency: "USD", base: 265.7, marketCap: 190_000_000_000 },
  // Healthcare
  JNJ: { name: "Johnson & Johnson", exchange: "NYSE", currency: "USD", base: 155.2, marketCap: 375_000_000_000 },
  PFE: { name: "Pfizer Inc.", exchange: "NYSE", currency: "USD", base: 27.1, marketCap: 155_000_000_000 },
  UNH: { name: "UnitedHealth Group", exchange: "NYSE", currency: "USD", base: 560.8, marketCap: 515_000_000_000 },
  ABBV: { name: "AbbVie Inc.", exchange: "NYSE", currency: "USD", base: 175.4, marketCap: 310_000_000_000 },
  MRK: { name: "Merck & Co.", exchange: "NYSE", currency: "USD", base: 105.6, marketCap: 265_000_000_000 },
  LLY: { name: "Eli Lilly and Co.", exchange: "NYSE", currency: "USD", base: 780.3, marketCap: 740_000_000_000 },
  // Consumer / retail
  KO: { name: "Coca-Cola Co.", exchange: "NYSE", currency: "USD", base: 62.4, marketCap: 268_000_000_000 },
  PEP: { name: "PepsiCo Inc.", exchange: "NASDAQ", currency: "USD", base: 168.1, marketCap: 230_000_000_000 },
  MCD: { name: "McDonald's Corp.", exchange: "NYSE", currency: "USD", base: 295.3, marketCap: 215_000_000_000 },
  SBUX: { name: "Starbucks Corp.", exchange: "NASDAQ", currency: "USD", base: 95.2, marketCap: 108_000_000_000 },
  NKE: { name: "Nike Inc.", exchange: "NYSE", currency: "USD", base: 78.6, marketCap: 118_000_000_000 },
  DIS: { name: "Walt Disney Co.", exchange: "NYSE", currency: "USD", base: 92.4, marketCap: 168_000_000_000 },
  COST: { name: "Costco Wholesale", exchange: "NASDAQ", currency: "USD", base: 890.5, marketCap: 395_000_000_000 },
  TGT: { name: "Target Corp.", exchange: "NYSE", currency: "USD", base: 148.2, marketCap: 68_000_000_000 },
  HD: { name: "Home Depot Inc.", exchange: "NYSE", currency: "USD", base: 385.6, marketCap: 385_000_000_000 },
  LOW: { name: "Lowe's Companies", exchange: "NYSE", currency: "USD", base: 260.3, marketCap: 150_000_000_000 },
  // Industrials / energy / auto
  XOM: { name: "Exxon Mobil Corp.", exchange: "NYSE", currency: "USD", base: 112.4, marketCap: 460_000_000_000 },
  CVX: { name: "Chevron Corp.", exchange: "NYSE", currency: "USD", base: 155.7, marketCap: 290_000_000_000 },
  BA: { name: "Boeing Co.", exchange: "NYSE", currency: "USD", base: 178.3, marketCap: 105_000_000_000 },
  CAT: { name: "Caterpillar Inc.", exchange: "NYSE", currency: "USD", base: 355.2, marketCap: 175_000_000_000 },
  GE: { name: "General Electric", exchange: "NYSE", currency: "USD", base: 175.6, marketCap: 195_000_000_000 },
  F: { name: "Ford Motor Co.", exchange: "NYSE", currency: "USD", base: 11.2, marketCap: 44_000_000_000 },
  GM: { name: "General Motors", exchange: "NYSE", currency: "USD", base: 47.3, marketCap: 55_000_000_000 },
  T: { name: "AT&T Inc.", exchange: "NYSE", currency: "USD", base: 21.4, marketCap: 150_000_000_000 },
  VZ: { name: "Verizon Communications", exchange: "NYSE", currency: "USD", base: 40.2, marketCap: 170_000_000_000 },
  // US equities only for now — foreign markets (LSE/TSX/ASX/TSE/XETRA) removed, may return later.
};

const state = {};
for (const [sym, meta] of Object.entries(SYMBOLS)) {
  state[sym] = { ...meta, symbol: sym, price: meta.base, prevClose: meta.base, sessionHigh: meta.base, sessionLow: meta.base };
}

function tick() {
  for (const sym of Object.keys(state)) {
    const pct = (Math.random() - 0.5) * 0.01; // +/-0.5% per tick
    const s = state[sym];
    s.price = Math.max(0.01, s.price * (1 + pct));
    s.sessionHigh = Math.max(s.sessionHigh, s.price);
    s.sessionLow = Math.min(s.sessionLow, s.price);
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
    marketCap: s.marketCap,
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
        marketCap: s.marketCap,
        sessionHigh: Number(s.sessionHigh.toFixed(2)),
        sessionLow: Number(s.sessionLow.toFixed(2)),
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

module.exports = { listSymbols, getQuotes, getQuote, SYMBOLS, MIN_MARKET_CAP };
