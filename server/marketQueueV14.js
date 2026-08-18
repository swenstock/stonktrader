const db = require('./db');
const { getQuote, MIN_MARKET_CAP } = require('./dataProvider');
const { totalValueForPortfolio } = require('./portfolioValue');
const testClock = require('./testClock');
const { easternParts, isWeekday, nextMarketOpen } = require('./timeHelpers');

const MAX_INITIAL_POSITION_PCT = 0.10;
const TEST_MODE = process.env.TEST_MODE === 'true';
const TEST_SATELLITE_MINUTES = Number(process.env.TEST_SATELLITE_MINUTES || 20);
const TEST_MAIN_EVENT_MINUTES = Number(process.env.TEST_MAIN_EVENT_MINUTES || 10);

function tableColumns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name));
}
function ensureColumn(table, name, definition) {
  if (!tableColumns(table).has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_queue_orders_v14 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity REAL,
      percent REAL,
      max_allotment INTEGER NOT NULL DEFAULT 0,
      target_portfolio_pct REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      fail_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      executed_at TEXT,
      executed_price REAL
    );
    CREATE INDEX IF NOT EXISTS idx_market_queue_v14_pending
      ON market_queue_orders_v14(status, portfolio_id, id);
  `);
  ensureColumn('market_queue_orders_v14', 'order_type', "TEXT NOT NULL DEFAULT 'market'");
  ensureColumn('market_queue_orders_v14', 'limit_price', 'REAL');
  ensureColumn('market_queue_orders_v14', 'stop_price', 'REAL');
  ensureColumn('market_queue_orders_v14', 'triggered_at', 'TEXT');
}

function satelliteForPortfolio(portfolioId) {
  return db.prepare(`SELECT satellites.* FROM satellite_entries
    JOIN satellites ON satellites.id = satellite_entries.satellite_id
    WHERE satellite_entries.portfolio_id = ?`).get(portfolioId) || null;
}
function contestForPortfolio(portfolioId) {
  return db.prepare(`SELECT contests.* FROM contest_entries
    JOIN contests ON contests.id = contest_entries.contest_id
    WHERE contest_entries.portfolio_id = ?`).get(portfolioId) || null;
}
function isDegenHoursPortfolio(portfolioId) {
  return satelliteForPortfolio(portfolioId)?.tier_id === 'hourly';
}
function regularMarketOpen(now = testClock.getNow()) {
  if (!isWeekday(now)) return false;
  const p = easternParts(now);
  const minutes = Number(p.hour) * 60 + Number(p.minute);
  return minutes >= 570 && minutes < 960;
}
function durationMinutes(start, end) {
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 60000);
}
function isCompressedTestSatellite(s) {
  return !!(TEST_MODE && s && durationMinutes(s.opens_at, s.locks_at) <= TEST_SATELLITE_MINUTES + 0.25);
}
function isCompressedTestContest(c) {
  return !!(TEST_MODE && c && durationMinutes(c.week_start, c.week_end) <= TEST_MAIN_EVENT_MINUTES + 0.25);
}
function contestWindow(portfolioId) {
  const now = testClock.getNow();
  const s = satelliteForPortfolio(portfolioId);
  if (s) return { kind:'satellite', status:s.status, start:new Date(s.opens_at), end:new Date(s.locks_at), compressed:isCompressedTestSatellite(s), now };
  const c = contestForPortfolio(portfolioId);
  if (c) return { kind:'contest', status:c.status, start:new Date(c.week_start), end:new Date(c.week_end), compressed:isCompressedTestContest(c), now };
  return null;
}
function queueEligibility(portfolioId) {
  const w = contestWindow(portfolioId);
  if (!w) return { queueable:false, marketClosed:false, reason:'This portfolio is not attached to an active SBC contest.' };
  if (w.status !== 'open') return { queueable:false, marketClosed:false, reason:'This contest is no longer open for trading.' };
  if (w.now.getTime() < w.start.getTime() || w.now.getTime() >= w.end.getTime()) return { queueable:false, marketClosed:false, reason:'This contest is outside its trading window.' };
  if (w.compressed || regularMarketOpen(w.now)) return { queueable:false, marketClosed:false, reason:null };
  const target = nextMarketOpen(w.now);
  if (target.getTime() >= w.end.getTime()) return { queueable:false, marketClosed:true, reason:'The market will not reopen before this contest closes, so this order cannot be queued.' };
  return { queueable:true, marketClosed:true, targetOpenAt:target, reason:null };
}
function advancedEligibility(portfolioId) {
  const w = contestWindow(portfolioId);
  if (!w) return { allowed:false, reason:'This portfolio is not attached to an active SBC contest.' };
  if (w.status !== 'open') return { allowed:false, reason:'This contest is no longer open for trading.' };
  if (w.now.getTime() < w.start.getTime() || w.now.getTime() >= w.end.getTime()) return { allowed:false, reason:'This contest is outside its trading window.' };
  if (!w.compressed && !regularMarketOpen(w.now)) {
    const target = nextMarketOpen(w.now);
    if (target.getTime() >= w.end.getTime()) return { allowed:false, reason:'The market will not reopen before this contest closes, so this order cannot be placed.' };
    return { allowed:true, targetOpenAt:target };
  }
  return { allowed:true, targetOpenAt:null };
}

function normalizeSpec(spec) {
  const symbol = String(spec.symbol || '').trim().toUpperCase();
  const side = String(spec.side || '').trim().toLowerCase();
  const orderType = String(spec.orderType || spec.order_type || 'market').trim().toLowerCase();
  if (!symbol || !['buy','sell'].includes(side)) throw new Error("symbol and side ('buy'|'sell') are required");
  if (!['market','limit','stop','stop_limit'].includes(orderType)) throw new Error('Order type must be market, limit, stop, or stop-limit.');
  const quote = getQuote(symbol);
  if (!quote) throw new Error(`${symbol} is not available in SBC.`);
  if (side === 'buy' && quote.marketCap != null && quote.marketCap < MIN_MARKET_CAP) throw new Error(`${symbol} is below the SBC market-cap minimum.`);

  let targetPortfolioPct = spec.targetPortfolioPct == null ? null : Number(spec.targetPortfolioPct);
  let percent = spec.percent == null ? null : Number(spec.percent);
  let quantity = spec.quantity == null ? null : Number(spec.quantity);
  const maxAllotment = !!spec.maxAllotment;
  const limitPrice = spec.limitPrice == null ? null : Number(spec.limitPrice);
  const stopPrice = spec.stopPrice == null ? null : Number(spec.stopPrice);

  if (targetPortfolioPct != null) {
    if (side !== 'buy' || !(targetPortfolioPct > 0 && targetPortfolioPct <= 10)) throw new Error('Basket target weight must be greater than 0% and no more than 10%.');
    percent = null; quantity = null;
  } else if (percent != null) {
    if (![25,50,75,100].includes(percent)) throw new Error('percent must be 25, 50, 75, or 100');
    quantity = null;
  } else if (maxAllotment) {
    if (side !== 'buy') throw new Error('Max allotment is only available for buy orders.');
    quantity = null;
  } else if (!(quantity > 0)) {
    throw new Error('A positive quantity is required.');
  }
  if (['limit','stop_limit'].includes(orderType) && !(limitPrice > 0)) throw new Error('Enter a valid limit price.');
  if (['stop','stop_limit'].includes(orderType) && !(stopPrice > 0)) throw new Error('Enter a valid stop price.');

  return { symbol, side, orderType, quantity, percent, maxAllotment, targetPortfolioPct, limitPrice, stopPrice };
}

function insertOrder(portfolioId, n) {
  ensureSchema();
  const info = db.prepare(`INSERT INTO market_queue_orders_v14
    (portfolio_id, symbol, side, quantity, percent, max_allotment, target_portfolio_pct, order_type, limit_price, stop_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(portfolioId, n.symbol, n.side, n.quantity, n.percent, n.maxAllotment ? 1 : 0, n.targetPortfolioPct, n.orderType, n.limitPrice, n.stopPrice);
  return Number(info.lastInsertRowid);
}
function enqueue(portfolioId, spec) {
  const eligibility = queueEligibility(portfolioId);
  if (!eligibility.queueable) throw new Error(eligibility.reason || 'The market is not currently in a queueable state.');
  const n = normalizeSpec({ ...spec, orderType:'market' });
  const id = insertOrder(portfolioId, n);
  return { id, ...n, targetOpenAt:eligibility.targetOpenAt.toISOString() };
}
function enqueueAdvanced(portfolioId, spec) {
  const eligibility = advancedEligibility(portfolioId);
  if (!eligibility.allowed) throw new Error(eligibility.reason || 'This advanced order cannot be placed right now.');
  const n = normalizeSpec(spec);
  if (n.orderType === 'market') throw new Error('Use the regular Market order button for market orders.');
  const id = insertOrder(portfolioId, n);
  return { id, ...n, targetOpenAt:eligibility.targetOpenAt ? eligibility.targetOpenAt.toISOString() : null };
}

function activeWindowAtExecution(portfolioId) {
  const w = contestWindow(portfolioId);
  if (!w || w.status !== 'open') return { active:false, expired:true };
  if (w.now.getTime() >= w.end.getTime()) return { active:false, expired:true };
  if (w.now.getTime() < w.start.getTime()) return { active:false, expired:false };
  if (w.compressed) return { active:true, expired:false };
  return { active:regularMarketOpen(w.now), expired:false };
}
function resolveQuantity(order, quote, portfolio, position, isDegen) {
  const pv = totalValueForPortfolio(portfolio.id);
  const existingCost = position ? position.avg_cost * position.quantity : 0;
  if (order.target_portfolio_pct != null) {
    const target = pv * (Number(order.target_portfolio_pct) / 100);
    const spend = Math.max(0, target - existingCost);
    return spend <= 0.01 ? 0 : spend / quote.price;
  }
  if (order.percent != null) {
    const pct = Number(order.percent);
    if (order.side === 'sell') return position ? position.quantity * (pct / 100) : 0;
    if (isDegen) return (portfolio.cash_balance * (pct / 100)) / quote.price;
    const target = pv * MAX_INITIAL_POSITION_PCT * (pct / 100);
    const spend = Math.max(0, target - existingCost);
    return spend <= 0.01 ? 0 : spend / quote.price;
  }
  if (order.max_allotment) {
    if (isDegen) return portfolio.cash_balance / quote.price;
    const room = Math.max(0, pv * MAX_INITIAL_POSITION_PCT - existingCost);
    return room <= 0.01 ? 0 : room / quote.price;
  }
  return Number(order.quantity || 0);
}
function shouldTrigger(order, price) {
  const type = order.order_type || 'market';
  const limit = Number(order.limit_price || 0);
  const stop = Number(order.stop_price || 0);
  if (type === 'market') return true;
  if (type === 'limit') return order.side === 'buy' ? price <= limit : price >= limit;
  if (type === 'stop') return order.side === 'buy' ? price >= stop : price <= stop;
  if (type === 'stop_limit') {
    if (!order.triggered_at) return false;
    return order.side === 'buy' ? price <= limit : price >= limit;
  }
  return false;
}
function execute(order) {
  const portfolio = db.prepare('SELECT * FROM portfolios WHERE id = ?').get(order.portfolio_id);
  if (!portfolio) throw new Error('Portfolio not found.');
  const quote = getQuote(order.symbol);
  if (!quote) throw new Error(`${order.symbol} is no longer available in SBC.`);
  const isDegen = isDegenHoursPortfolio(portfolio.id);
  const position = db.prepare('SELECT * FROM positions WHERE portfolio_id = ? AND symbol = ?').get(portfolio.id, order.symbol);
  const quantity = resolveQuantity(order, quote, portfolio, position, isDegen);
  if (!(quantity > 0)) throw new Error(order.side === 'sell' ? `You do not own enough ${order.symbol} to execute this order.` : `${order.symbol} is already at its target or there is no room left to buy.`);
  const cost = quote.price * quantity;

  if (order.side === 'buy') {
    if (quote.marketCap != null && quote.marketCap < MIN_MARKET_CAP) throw new Error(`${order.symbol} is below the SBC market-cap minimum.`);
    if (!isDegen) {
      const pv = totalValueForPortfolio(portfolio.id);
      const existingCost = position ? position.avg_cost * position.quantity : 0;
      if (existingCost + cost > pv * MAX_INITIAL_POSITION_PCT + 0.01) throw new Error(`${order.symbol} would exceed the 10% max position size at execution.`);
    }
  }

  db.exec('BEGIN');
  try {
    const fresh = db.prepare('SELECT * FROM portfolios WHERE id = ?').get(portfolio.id);
    const current = db.prepare('SELECT * FROM positions WHERE portfolio_id = ? AND symbol = ?').get(portfolio.id, order.symbol);
    if (order.side === 'buy') {
      if (cost > fresh.cash_balance + 0.01) throw new Error('Not enough cash when the order triggered.');
      db.prepare('UPDATE portfolios SET cash_balance = cash_balance - ? WHERE id = ?').run(cost, portfolio.id);
      if (current) {
        const nq = current.quantity + quantity;
        const na = (current.avg_cost * current.quantity + cost) / nq;
        db.prepare('UPDATE positions SET quantity = ?, avg_cost = ? WHERE id = ?').run(nq, na, current.id);
      } else {
        db.prepare('INSERT INTO positions (portfolio_id, symbol, quantity, avg_cost) VALUES (?, ?, ?, ?)').run(portfolio.id, order.symbol, quantity, quote.price);
      }
    } else {
      if (!current || current.quantity + 1e-9 < quantity) throw new Error('Not enough shares when the order triggered.');
      db.prepare('UPDATE portfolios SET cash_balance = cash_balance + ? WHERE id = ?').run(cost, portfolio.id);
      db.prepare('UPDATE positions SET quantity = quantity - ? WHERE id = ?').run(quantity, current.id);
    }
    db.prepare('INSERT INTO trades (portfolio_id, symbol, side, quantity, price) VALUES (?, ?, ?, ?, ?)').run(portfolio.id, order.symbol, order.side, quantity, quote.price);
    db.exec('COMMIT');
    return { price:quote.price, quantity };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw e;
  }
}

function tick() {
  ensureSchema();
  const pending = db.prepare("SELECT * FROM market_queue_orders_v14 WHERE status = 'pending' ORDER BY id").all();
  for (const order of pending) {
    const window = activeWindowAtExecution(order.portfolio_id);
    if (window.expired) {
      db.prepare("UPDATE market_queue_orders_v14 SET status='failed', fail_reason=? WHERE id=?").run('Contest closed before the queued order could execute.', order.id);
      continue;
    }
    if (!window.active) continue;
    const quote = getQuote(order.symbol);
    if (!quote) {
      db.prepare("UPDATE market_queue_orders_v14 SET status='failed', fail_reason=? WHERE id=?").run('Symbol is no longer available in SBC.', order.id);
      continue;
    }
    if (order.order_type === 'stop_limit' && !order.triggered_at) {
      const hit = order.side === 'buy' ? quote.price >= Number(order.stop_price) : quote.price <= Number(order.stop_price);
      if (hit) db.prepare('UPDATE market_queue_orders_v14 SET triggered_at=? WHERE id=?').run(testClock.getNow().toISOString(), order.id);
      else continue;
    }
    const freshOrder = db.prepare('SELECT * FROM market_queue_orders_v14 WHERE id=?').get(order.id);
    if (!shouldTrigger(freshOrder, quote.price)) continue;
    try {
      const result = execute(freshOrder);
      db.prepare("UPDATE market_queue_orders_v14 SET status='executed', executed_at=?, executed_price=?, fail_reason=NULL WHERE id=?").run(testClock.getNow().toISOString(), result.price, order.id);
    } catch (e) {
      db.prepare("UPDATE market_queue_orders_v14 SET status='failed', fail_reason=? WHERE id=?").run(String(e.message || e), order.id);
    }
  }
}
function start() {
  ensureSchema();
  tick();
  const timer = setInterval(tick, 5000);
  timer.unref?.();
}

module.exports = { start, tick, enqueue, enqueueAdvanced, queueEligibility, advancedEligibility, ensureSchema };
