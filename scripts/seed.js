'use strict';

/**
 * Local development seed script — covers every table and every UI case
 *
 * Tables seeded:
 *   PostgreSQL: trailing_trade_common, trailing_trade_symbols, trailing_trade_grid_trade,
 *               trailing_trade_grid_trade_orders, trailing_trade_cache,
 *               trailing_trade_manual_orders, trailing_trade_logs,
 *               trailing_trade_grid_trade_archive, orders
 *   Redis:      auth-jwt-secret, trailing_trade_common/account-info,
 *               chart:bars:ES, chart:bars:NQ
 *
 * Run via:  node scripts/seed.js
 * (env vars must be exported first — run_local.sh does this automatically)
 */

const { Pool } = require('pg');
const Redis    = require('ioredis');
const crypto   = require('crypto');

// ── Connection config ────────────────────────────────────────────────────────
const pgConfig = {
  host:     process.env.TRADOVATE_POSTGRES_HOST     || 'localhost',
  port:     parseInt(process.env.TRADOVATE_POSTGRES_PORT || '5432', 10),
  database: process.env.TRADOVATE_POSTGRES_DATABASE || 'tradovate_bot',
  user:     process.env.TRADOVATE_POSTGRES_USER     || 'tradovate',
  password: process.env.TRADOVATE_POSTGRES_PASSWORD || 'tradovate_pass',
};

const redisConfig = {
  host:     process.env.TRADOVATE_REDIS_HOST     || 'localhost',
  port:     parseInt(process.env.TRADOVATE_REDIS_PORT || '6379', 10),
  password: process.env.TRADOVATE_REDIS_PASSWORD || undefined,
  lazyConnect: true,
};

const ADMIN_PASSWORD = process.env.TRADOVATE_AUTHENTICATION_PASSWORD || 'admin123';

// ── Helpers ──────────────────────────────────────────────────────────────────
const ok   = msg => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const skip = msg => console.log(`  \x1b[33m–\x1b[0m ${msg}`);
const head = msg => console.log(`\n\x1b[36m[seed]\x1b[0m ${msg}`);

const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const hoursAgo = n => new Date(Date.now() - n * 3600 * 1000);
const minutesAgo = n => new Date(Date.now() - n * 60 * 1000);

// ── 1. JWT Secret ────────────────────────────────────────────────────────────
async function seedJwtSecret(redis) {
  const existing = await redis.get('auth-jwt-secret');
  if (!existing) {
    const secret = crypto.randomBytes(32).toString('hex');
    await redis.set('auth-jwt-secret', secret);
    ok('JWT secret generated and stored in Redis');
  } else {
    skip('JWT secret already exists in Redis');
  }
}

// ── 2. Chart bars in Redis (feeds CandlestickChart via /api/bars) ───────────
async function seedChartBars(redis) {
  // Generate 120 realistic 5-minute OHLCV bars ending now
  function generateBars(basePrice, tickSize, tickValue, avgVol) {
    const bars = [];
    const now = Date.now();
    const interval = 5 * 60 * 1000; // 5 min in ms
    // Start 120 bars ago (= 10 hours of 5m bars)
    const startMs = now - 120 * interval;

    let price = basePrice;
    for (let i = 0; i < 120; i++) {
      const ts = new Date(startMs + i * interval).toISOString();
      const open = price;
      const move = (Math.random() - 0.48) * tickSize * 8; // slight upward bias
      const close = Math.round((open + move) / tickSize) * tickSize;
      const range = Math.abs(move) + tickSize * (2 + Math.random() * 4);
      const high = Math.round((Math.max(open, close) + range * Math.random()) / tickSize) * tickSize;
      const low  = Math.round((Math.min(open, close) - range * Math.random()) / tickSize) * tickSize;
      const vol  = Math.floor(avgVol * (0.5 + Math.random()));
      const upVol   = close >= open ? Math.floor(vol * (0.5 + Math.random() * 0.3)) : Math.floor(vol * (0.2 + Math.random() * 0.3));
      const downVol = vol - upVol;

      bars.push({ timestamp: ts, open, high, low, close, upVolume: upVol, downVolume: downVol });
      price = close;
    }
    return bars;
  }

  const symbols = [
    { key: 'chart:bars:ES',  base: 5258.75, tick: 0.25, tickVal: 12.50, vol: 1800 },
    { key: 'chart:bars:NQ',  base: 18445.50, tick: 0.25, tickVal: 5.00,  vol: 950  },
    { key: 'chart:bars:MES', base: 5258.75, tick: 0.25, tickVal: 1.25,  vol: 3200 },
    { key: 'chart:bars:MNQ', base: 18445.50, tick: 0.25, tickVal: 0.50,  vol: 2100 },
  ];

  for (const sym of symbols) {
    const existing = await redis.get(sym.key);
    if (existing) { skip(`${sym.key} already exists in Redis`); continue; }
    const bars = generateBars(sym.base, sym.tick, sym.tickVal, sym.vol);
    await redis.set(sym.key, JSON.stringify(bars));
    ok(`${sym.key} seeded (${bars.length} bars)`);
  }
}

// ── 3. Account info in Redis (feeds dashboard balance) ──────────────────────
async function seedAccountInfo(redis) {
  const existing = await redis.hget('trailing_trade_common', 'account-info');
  if (!existing) {
    const accountInfo = [
      {
        id: 12345,
        name: 'Demo Account',
        userId: 99001,
        balance: 50000.00,
        cashBalance: 50000.00,
        openPositionPnl: 490.00,    // sum of open positions below
        initialMarginRequirement: 2200.00,
        maintenanceMarginRequirement: 1800.00,
        autoLiqThreshold: 0,
        dayTraderStatus: false,
        currencyCode: 'USD',
        canTrade: true
      }
    ];
    await redis.hset('trailing_trade_common', 'account-info', JSON.stringify(accountInfo));
    ok('Account info seeded in Redis');
  } else {
    skip('Account info already exists in Redis');
  }
}

// ── 3. Global bot configuration ──────────────────────────────────────────────
async function seedGlobalConfig(pool) {
  const { rowCount } = await pool.query(
    "SELECT 1 FROM trailing_trade_common WHERE key = 'configuration'"
  );
  if (rowCount > 0) { skip('Global configuration already exists'); return; }

  const config = {
    key: 'configuration',
    enabled: true,
    cronTime: '* * * * * *',
    symbols: ['MESZ2', 'ESZ2', 'MNQZ2', 'NQZ2'],
    botOptions: {
      authentication: { lockList: true, lockAfter: 120 },
      autoTriggerBuy: {
        enabled: false,
        triggerAfter: 20,
        conditions: {
          whenLessThanATHRestriction: true,
          afterDisabledPeriod: true,
          tradingView: { overrideInterval: '', whenStrongBuy: true, whenBuy: true },
        },
      },
      orderLimit: { enabled: true, maxBuyOpenOrders: 3, maxOpenTrades: 5 },
      tradingView: { interval: '', useOnlyWithin: 5, ifExpires: 'ignore' },
      logs: { deleteAfter: 30 },
    },
    candles: { interval: '5', limit: 100, share: 100 },
    buy: {
      enabled: true,
      lastBuyPriceRemoveThreshold: -1,
      athRestriction: {
        enabled: false,
        candles: { interval: '1d', share: 100 },
        restrictionPercentage: 1.0,
      },
      tradingView: { whenStrongBuy: false, whenBuy: false },
      gridTrade: [{ enabled: true, stoploss: 3.5, pointin: 3.5 }],
    },
    sell: {
      enabled: true,
      stopLoss: { enabled: false, maxLossPercentage: 0.8, disableBuyMinutes: 60, orderType: 'market' },
      tradingView: {
        forceExitAll13h: { whenNeutral: false, whenSell: false, whenStrongSell: false },
      },
      gridTrade: [{ enabled: true, stoploss: 3.5, pointin: 3.5 }],
    },
    system: {
      temporaryDisableActionAfterConfirmingOrder: 20,
      checkManualOrderPeriod: 5,
      placeManualOrderInterval: 5,
      refreshAccountInfoPeriod: 1,
      checkOrderExecutePeriod: 10,
    },
  };

  await pool.query(
    'INSERT INTO trailing_trade_common (key, data) VALUES ($1, $2)',
    ['configuration', JSON.stringify(config)]
  );
  ok('Global bot configuration seeded');
}

// ── 4. Bot state in trailing_trade_common ────────────────────────────────────
async function seedBotState(pool) {
  const states = [
    {
      key: 'stop_bot',
      data: { enabled: false, updatedAt: new Date().toISOString() }
    },
    {
      key: 'last-processed-candle',
      data: {
        symbol: 'MESZ2', interval: '5m',
        openTime: hoursAgo(1).toISOString(),
        closeTime: hoursAgo(0).toISOString(),
        open: 5248.50, high: 5262.00, low: 5244.25, close: 5258.75, volume: 12340
      }
    }
  ];

  for (const s of states) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM trailing_trade_common WHERE key = $1', [s.key]
    );
    if (rowCount > 0) { skip(`trailing_trade_common[${s.key}] already exists`); continue; }
    await pool.query(
      'INSERT INTO trailing_trade_common (key, data) VALUES ($1, $2)',
      [s.key, JSON.stringify(s.data)]
    );
    ok(`trailing_trade_common[${s.key}] seeded`);
  }
}

// ── 5. Symbols ───────────────────────────────────────────────────────────────
async function seedSymbols(pool) {
  const symbols = [
    // Active, profitable — currently in long trade
    {
      symbol: 'MESZ2',
      data: {
        symbol: 'MESZ2', enabled: true, status: 'TRADING', short: 'ES',
        tickSize: 0.25, tickValue: 1.25, contractSize: 5,
        lastBuyPrice: 5250.00, nextBuyTrigger: 5231.25, nextSellTrigger: 5268.75,
        strategyState: 'monitoring', tradingView: { signal: 'BUY', lastUpdated: minutesAgo(3).toISOString() }
      }
    },
    // Active — in short trade, loss
    {
      symbol: 'ESZ2',
      data: {
        symbol: 'ESZ2', enabled: true, status: 'TRADING', short: 'ES',
        tickSize: 0.25, tickValue: 12.50, contractSize: 50,
        lastBuyPrice: 5300.00, nextBuyTrigger: 5281.50, nextSellTrigger: 5318.50,
        strategyState: 'in_position', tradingView: { signal: 'SELL', lastUpdated: minutesAgo(8).toISOString() }
      }
    },
    // Active — in long trade, loss
    {
      symbol: 'MNQZ2',
      data: {
        symbol: 'MNQZ2', enabled: true, status: 'TRADING', short: 'NQ',
        tickSize: 0.25, tickValue: 0.50, contractSize: 2,
        lastBuyPrice: 18500.00, nextBuyTrigger: 18312.50, nextSellTrigger: 18687.50,
        strategyState: 'in_position', tradingView: { signal: 'NEUTRAL', lastUpdated: minutesAgo(15).toISOString() }
      }
    },
    // Active — no open position, waiting
    {
      symbol: 'NQZ2',
      data: {
        symbol: 'NQZ2', enabled: true, status: 'TRADING', short: 'NQ',
        tickSize: 0.25, tickValue: 5.00, contractSize: 20,
        lastBuyPrice: null, nextBuyTrigger: null, nextSellTrigger: null,
        strategyState: 'waiting', tradingView: { signal: 'STRONG_BUY', lastUpdated: minutesAgo(2).toISOString() }
      }
    },
    // Disabled symbol
    {
      symbol: 'RTYZ2',
      data: {
        symbol: 'RTYZ2', enabled: false, status: 'BREAK', short: 'RTY',
        tickSize: 0.10, tickValue: 5.00, contractSize: 50,
        lastBuyPrice: null, disabledReason: 'Manual disable — low liquidity session',
        strategyState: 'disabled', tradingView: null
      }
    },
  ];

  for (const sym of symbols) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM trailing_trade_symbols WHERE key = $1', [sym.symbol]
    );
    if (rowCount > 0) { skip(`Symbol ${sym.symbol} already exists`); continue; }
    await pool.query(
      'INSERT INTO trailing_trade_symbols (key, data) VALUES ($1, $2)',
      [sym.symbol, JSON.stringify(sym.data)]
    );
    ok(`Symbol ${sym.symbol} seeded`);
  }
}

// ── 6. Grid trade configs ────────────────────────────────────────────────────
async function seedGridTrades(pool) {
  const grids = [
    {
      key: 'MESZ2',
      data: {
        symbol: 'MESZ2', status: 'active',
        buy: { enabled: true, stoploss: 3.5, pointin: 3.5, gridTradeIndex: 0 },
        sell: { enabled: true, stoploss: 3.5, pointin: 3.5, gridTradeIndex: 0 },
        totalBuyQuoteQty: 10500.00, totalSellQuoteQty: 0,
        profit: 0, profitPercentage: 0,
        createdAt: hoursAgo(6).toISOString()
      }
    },
    {
      key: 'ESZ2',
      data: {
        symbol: 'ESZ2', status: 'active',
        buy: { enabled: true, stoploss: 3.5, pointin: 3.5, gridTradeIndex: 0 },
        sell: { enabled: true, stoploss: 3.5, pointin: 3.5, gridTradeIndex: 0 },
        totalBuyQuoteQty: 5300.00, totalSellQuoteQty: 0,
        profit: 0, profitPercentage: 0,
        createdAt: hoursAgo(3).toISOString()
      }
    },
    {
      key: 'MNQZ2',
      data: {
        symbol: 'MNQZ2', status: 'active',
        buy: { enabled: true, stoploss: 3.5, pointin: 3.5, gridTradeIndex: 0 },
        sell: { enabled: true, stoploss: 3.5, pointin: 3.5, gridTradeIndex: 0 },
        totalBuyQuoteQty: 18500.00, totalSellQuoteQty: 0,
        profit: 0, profitPercentage: 0,
        createdAt: hoursAgo(1).toISOString()
      }
    },
    // Completed grid (sold out, no active trade)
    {
      key: 'NQZ2-grid-completed',
      data: {
        symbol: 'NQZ2', status: 'completed',
        buy: { enabled: false, stoploss: 3.5, pointin: 3.5, gridTradeIndex: 0 },
        sell: { enabled: false, stoploss: 3.5, pointin: 3.5, gridTradeIndex: 0 },
        totalBuyQuoteQty: 18600.00, totalSellQuoteQty: 19200.00,
        profit: 600.00, profitPercentage: 3.22,
        createdAt: daysAgo(1).toISOString(), completedAt: hoursAgo(10).toISOString()
      }
    },
  ];

  for (const g of grids) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM trailing_trade_grid_trade WHERE key = $1', [g.key]
    );
    if (rowCount > 0) { skip(`Grid trade ${g.key} already exists`); continue; }
    await pool.query(
      'INSERT INTO trailing_trade_grid_trade (key, data) VALUES ($1, $2)',
      [g.key, JSON.stringify(g.data)]
    );
    ok(`Grid trade ${g.key} seeded`);
  }
}

// ── 7. Grid trade orders ─────────────────────────────────────────────────────
async function seedGridTradeOrders(pool) {
  const orders = [
    // Pending buy order
    {
      key: 'MESZ2-buy-grid-0',
      data: {
        symbol: 'MESZ2', side: 'buy', type: 'limit', status: 'pending',
        price: 5250.00, quantity: 2, orderId: 'ORD-MES-001',
        placedAt: minutesAgo(30).toISOString()
      }
    },
    // Filled buy order
    {
      key: 'ESZ2-buy-grid-0',
      data: {
        symbol: 'ESZ2', side: 'buy', type: 'market', status: 'filled',
        price: 5300.00, quantity: 1, orderId: 'ORD-ES-001',
        placedAt: hoursAgo(3).toISOString(), filledAt: hoursAgo(3).toISOString(),
        fillPrice: 5300.25
      }
    },
    // Pending sell order
    {
      key: 'ESZ2-sell-grid-0',
      data: {
        symbol: 'ESZ2', side: 'sell', type: 'limit', status: 'pending',
        price: 5318.50, quantity: 1, orderId: 'ORD-ES-002',
        placedAt: hoursAgo(2).toISOString()
      }
    },
    // Cancelled order
    {
      key: 'MNQZ2-buy-grid-cancelled',
      data: {
        symbol: 'MNQZ2', side: 'buy', type: 'limit', status: 'cancelled',
        price: 18450.00, quantity: 1, orderId: 'ORD-MNQ-001',
        placedAt: hoursAgo(5).toISOString(), cancelledAt: hoursAgo(4).toISOString(),
        cancelReason: 'Price moved away from limit'
      }
    },
    // Stop loss order (triggered)
    {
      key: 'NQZ2-stoploss-triggered',
      data: {
        symbol: 'NQZ2', side: 'sell', type: 'stop', status: 'filled',
        stopPrice: 18312.50, quantity: 1, orderId: 'ORD-NQ-SL-001',
        placedAt: daysAgo(1).toISOString(), filledAt: daysAgo(1).toISOString(),
        fillPrice: 18308.00, pnl: -960.00
      }
    },
  ];

  for (const o of orders) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM trailing_trade_grid_trade_orders WHERE key = $1', [o.key]
    );
    if (rowCount > 0) { skip(`Grid trade order ${o.key} already exists`); continue; }
    await pool.query(
      'INSERT INTO trailing_trade_grid_trade_orders (key, data) VALUES ($1, $2)',
      [o.key, JSON.stringify(o.data)]
    );
    ok(`Grid trade order ${o.key} seeded`);
  }
}

// ── 8. Symbol cache (live price snapshots) ───────────────────────────────────
async function seedCache(pool) {
  const caches = [
    {
      symbol: 'MESZ2',
      data: {
        currentPrice: 5258.75, previousClose: 5241.50,
        bid: 5258.50, ask: 5259.00, volume: 245810,
        change: 17.25, changePercent: 0.33,
        candles: {
          '5m': [
            { t: minutesAgo(10).toISOString(), o: 5252, h: 5261, l: 5250, c: 5258, v: 1823 },
            { t: minutesAgo(5).toISOString(),  o: 5258, h: 5265, l: 5255, c: 5262, v: 2101 },
            { t: new Date().toISOString(),      o: 5262, h: 5268, l: 5258, c: 5258.75, v: 987 },
          ]
        },
        updatedAt: new Date().toISOString()
      }
    },
    {
      symbol: 'ESZ2',
      data: {
        currentPrice: 5285.00, previousClose: 5301.00,
        bid: 5284.75, ask: 5285.25, volume: 128430,
        change: -16.00, changePercent: -0.30,
        candles: {
          '5m': [
            { t: minutesAgo(10).toISOString(), o: 5295, h: 5298, l: 5283, c: 5287, v: 943 },
            { t: minutesAgo(5).toISOString(),  o: 5287, h: 5289, l: 5281, c: 5284, v: 1102 },
            { t: new Date().toISOString(),      o: 5284, h: 5286, l: 5282, c: 5285, v: 611 },
          ]
        },
        updatedAt: new Date().toISOString()
      }
    },
    {
      symbol: 'MNQZ2',
      data: {
        currentPrice: 18430.00, previousClose: 18510.00,
        bid: 18429.75, ask: 18430.25, volume: 78920,
        change: -80.00, changePercent: -0.43,
        updatedAt: new Date().toISOString()
      }
    },
    {
      symbol: 'NQZ2',
      data: {
        currentPrice: 18445.50, previousClose: 18420.00,
        bid: 18445.25, ask: 18445.75, volume: 52340,
        change: 25.50, changePercent: 0.14,
        updatedAt: new Date().toISOString()
      }
    },
  ];

  for (const c of caches) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM trailing_trade_cache WHERE symbol = $1', [c.symbol]
    );
    if (rowCount > 0) { skip(`Cache ${c.symbol} already exists`); continue; }
    await pool.query(
      'INSERT INTO trailing_trade_cache (symbol, data) VALUES ($1, $2)',
      [c.symbol, JSON.stringify(c.data)]
    );
    ok(`Cache ${c.symbol} seeded`);
  }
}

// ── 9. Manual orders ─────────────────────────────────────────────────────────
async function seedManualOrders(pool) {
  const manualOrders = [
    // Open manual buy
    { symbol: 'MESZ2', orderId: 'MAN-001',
      data: { side: 'buy', type: 'limit', price: 5245.00, quantity: 1,
              status: 'open', note: 'Manual breakout entry',
              placedAt: minutesAgo(45).toISOString() } },
    // Open manual sell (hedge)
    { symbol: 'ESZ2', orderId: 'MAN-002',
      data: { side: 'sell', type: 'market', price: 5285.00, quantity: 1,
              status: 'open', note: 'Manual hedge — news event',
              placedAt: minutesAgo(12).toISOString() } },
    // Filled manual order
    { symbol: 'NQZ2', orderId: 'MAN-003',
      data: { side: 'buy', type: 'market', price: 18440.00, quantity: 1,
              status: 'filled', fillPrice: 18440.50, pnl: 0,
              placedAt: hoursAgo(4).toISOString(), filledAt: hoursAgo(4).toISOString() } },
  ];

  for (const mo of manualOrders) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM trailing_trade_manual_orders WHERE symbol = $1 AND order_id = $2',
      [mo.symbol, mo.orderId]
    );
    if (rowCount > 0) { skip(`Manual order ${mo.symbol}/${mo.orderId} already exists`); continue; }
    await pool.query(
      'INSERT INTO trailing_trade_manual_orders (symbol, order_id, data) VALUES ($1, $2, $3)',
      [mo.symbol, mo.orderId, JSON.stringify(mo.data)]
    );
    ok(`Manual order ${mo.symbol}/${mo.orderId} seeded`);
  }
}

// ── 10. Activity logs ────────────────────────────────────────────────────────
async function seedLogs(pool) {
  const { rowCount } = await pool.query(
    "SELECT 1 FROM trailing_trade_logs WHERE msg = '__seed_marker__'"
  );
  if (rowCount > 0) { skip('Logs already seeded'); return; }

  const logs = [
    // Info — normal operation
    { symbol: 'MESZ2', msg: 'Buy signal detected — TradingView BUY confirmed',
      logged_at: minutesAgo(55), data: { level: 'info', context: { signal: 'BUY', price: 5248.50 } } },
    { symbol: 'MESZ2', msg: 'Buy order placed at 5250.00 (qty: 2)',
      logged_at: minutesAgo(54), data: { level: 'info', context: { orderId: 'ORD-MES-001', price: 5250.00 } } },
    { symbol: 'MESZ2', msg: 'Order filled at 5250.00',
      logged_at: minutesAgo(53), data: { level: 'info', context: { fillPrice: 5250.00, qty: 2 } } },
    { symbol: 'ESZ2', msg: 'Short signal detected — TradingView SELL confirmed',
      logged_at: hoursAgo(3), data: { level: 'info', context: { signal: 'SELL', price: 5302.00 } } },
    { symbol: 'ESZ2', msg: 'Sell order placed at 5300.00 (qty: 1)',
      logged_at: hoursAgo(3), data: { level: 'info', context: { orderId: 'ORD-ES-001' } } },
    { symbol: 'NQZ2', msg: 'Strategy scan completed — no signal',
      logged_at: minutesAgo(2), data: { level: 'info', context: { price: 18445.50 } } },
    { symbol: 'MNQZ2', msg: 'Position opened at 18500.00',
      logged_at: hoursAgo(1), data: { level: 'info', context: { side: 'long', qty: 1 } } },

    // Warning
    { symbol: 'MESZ2', msg: 'Access token expiring in 25 minutes — refreshing',
      logged_at: minutesAgo(25), data: { level: 'warn', context: { expiresIn: '25m' } } },
    { symbol: 'MNQZ2', msg: 'Stop loss threshold approaching (current loss: -2.1%)',
      logged_at: minutesAgo(10), data: { level: 'warn', context: { unrealizedPnl: -350, threshold: -3.5 } } },
    { symbol: 'ESZ2', msg: 'Spread too wide — order not placed this cycle',
      logged_at: hoursAgo(2), data: { level: 'warn', context: { spread: 2.50, maxSpread: 1.00 } } },
    { symbol: 'NQZ2', msg: 'Order partially filled (1 of 2 contracts)',
      logged_at: daysAgo(1), data: { level: 'warn', context: { filled: 1, total: 2 } } },

    // Error
    { symbol: 'MESZ2', msg: 'Failed to fetch account balance: request timeout',
      logged_at: hoursAgo(5), data: { level: 'error', context: { error: 'ETIMEDOUT', retrying: true } } },
    { symbol: 'ESZ2', msg: 'Order rejected by exchange: insufficient margin',
      logged_at: daysAgo(2), data: { level: 'error', context: { orderId: 'ORD-ES-FAIL-001', marginRequired: 6600, available: 5900 } } },
    { symbol: 'MNQZ2', msg: 'WebSocket disconnected — reconnecting',
      logged_at: hoursAgo(8), data: { level: 'error', context: { code: 1006 } } },
    { symbol: 'NQZ2', msg: 'Stop loss triggered — position closed at 18308.00 (PnL: -$960)',
      logged_at: daysAgo(1), data: { level: 'error', context: { pnl: -960, stoplossPrice: 18312.50, fillPrice: 18308.00 } } },

    // Closed trade confirmations
    { symbol: 'MESZ2', msg: 'Trade closed — PnL: +$90.00 (+0.86%)',
      logged_at: hoursAgo(2), data: { level: 'info', context: { pnl: 90, side: 'long', entry: 5240, exit: 5249 } } },
    { symbol: 'NQZ2', msg: 'Trade closed — PnL: +$1200.00 (+6.45%)',
      logged_at: hoursAgo(6), data: { level: 'info', context: { pnl: 1200, side: 'short', entry: 18600, exit: 18540 } } },
    { symbol: 'ESZ2', msg: 'Trade closed — PnL: -$750.00 (-2.83%)',
      logged_at: hoursAgo(9), data: { level: 'info', context: { pnl: -750, side: 'long', entry: 5290, exit: 5275 } } },

    // Sentinel marker (idempotency)
    { symbol: '__system__', msg: '__seed_marker__',
      logged_at: new Date(), data: { level: 'info' } },
  ];

  for (const log of logs) {
    await pool.query(
      'INSERT INTO trailing_trade_logs (symbol, msg, logged_at, data) VALUES ($1, $2, $3, $4)',
      [log.symbol, log.msg, log.logged_at, JSON.stringify(log.data)]
    );
  }
  ok(`${logs.length} log entries seeded`);
}

// ── 11. Grid trade archive (completed trades history) ────────────────────────
async function seedArchive(pool) {
  const archives = [
    // Profitable ES trade
    {
      key: 'MESZ2-archive-001',
      symbol: 'MESZ2', quoteAsset: 'USD',
      archivedAt: daysAgo(3),
      totalBuyQuoteQty: 10487.50, totalSellQuoteQty: 10577.50,
      buyGridTradeQuoteQty: 10487.50, buyManualQuoteQty: 0,
      sellGridTradeQuoteQty: 10577.50, sellManualQuoteQty: 0,
      stopLossQuoteQty: 0, profit: 90.00, profitPercentage: 0.86,
      data: { symbol: 'MESZ2', side: 'long', entryPrice: 5243.75, exitPrice: 5288.75,
              qty: 2, note: 'Trend follow long — pre-market breakout' }
    },
    // Losing NQ trade
    {
      key: 'NQZ2-archive-002',
      symbol: 'NQZ2', quoteAsset: 'USD',
      archivedAt: daysAgo(2),
      totalBuyQuoteQty: 18450.00, totalSellQuoteQty: 17490.00,
      buyGridTradeQuoteQty: 18450.00, buyManualQuoteQty: 0,
      sellGridTradeQuoteQty: 0, sellManualQuoteQty: 0,
      stopLossQuoteQty: 17490.00, profit: -960.00, profitPercentage: -5.20,
      data: { symbol: 'NQZ2', side: 'long', entryPrice: 18450.00, exitPrice: 18308.00,
              qty: 1, note: 'Stop loss triggered — unexpected macro event' }
    },
    // Profitable NQ short trade
    {
      key: 'NQZ2-archive-003',
      symbol: 'NQZ2', quoteAsset: 'USD',
      archivedAt: daysAgo(5),
      totalBuyQuoteQty: 18540.00, totalSellQuoteQty: 19140.00,
      buyGridTradeQuoteQty: 0, buyManualQuoteQty: 0,
      sellGridTradeQuoteQty: 19140.00, sellManualQuoteQty: 0,
      stopLossQuoteQty: 0, profit: 600.00, profitPercentage: 3.24,
      data: { symbol: 'NQZ2', side: 'short', entryPrice: 18600.00, exitPrice: 18540.00,
              qty: 1, note: 'Short on resistance — FOMC fade' }
    },
    // Profitable ES long from last week
    {
      key: 'ESZ2-archive-004',
      symbol: 'ESZ2', quoteAsset: 'USD',
      archivedAt: daysAgo(9),
      totalBuyQuoteQty: 5230.00, totalSellQuoteQty: 6480.00,
      buyGridTradeQuoteQty: 5230.00, buyManualQuoteQty: 0,
      sellGridTradeQuoteQty: 6480.00, sellManualQuoteQty: 0,
      stopLossQuoteQty: 0, profit: 1250.00, profitPercentage: 23.90,
      data: { symbol: 'ESZ2', side: 'long', entryPrice: 5230.00, exitPrice: 5255.00,
              qty: 1, note: 'Weekly trend long' }
    },
  ];

  for (const a of archives) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM trailing_trade_grid_trade_archive WHERE key = $1', [a.key]
    );
    if (rowCount > 0) { skip(`Archive ${a.key} already exists`); continue; }
    await pool.query(
      `INSERT INTO trailing_trade_grid_trade_archive
         (key, symbol, quote_asset, archived_at,
          total_buy_quote_qty, total_sell_quote_qty,
          buy_grid_trade_quote_qty, buy_manual_quote_qty,
          sell_grid_trade_quote_qty, sell_manual_quote_qty,
          stop_loss_quote_qty, profit, profit_percentage, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        a.key, a.symbol, a.quoteAsset, a.archivedAt,
        a.totalBuyQuoteQty, a.totalSellQuoteQty,
        a.buyGridTradeQuoteQty, a.buyManualQuoteQty,
        a.sellGridTradeQuoteQty, a.sellManualQuoteQty,
        a.stopLossQuoteQty, a.profit, a.profitPercentage,
        JSON.stringify(a.data)
      ]
    );
    ok(`Archive ${a.key} seeded`);
  }
}

// ── 12. Orders (main table — positions + trade history) ──────────────────────
async function seedOrders(pool) {
  const { rowCount } = await pool.query(
    "SELECT 1 FROM orders WHERE data->>'_seed' = 'true' LIMIT 1"
  );
  if (rowCount > 0) { skip('Orders already seeded'); return; }

  const now = new Date();

  // Helper: date offsets within today
  const todayAt = h => { const d = new Date(now); d.setHours(h, 0, 0, 0); return d; };

  const orders = [
    // ── Open positions (status = 'open') ─────────────────────────────────────
    {
      symbol: 'MESZ2', status: 'open',
      entry_time: hoursAgo(1),
      data: {
        _seed: 'true', side: 'long', quantity: 2,
        entryPrice: 5250.00, currentPrice: 5258.75, pnl: 90.00,
        unrealizedPnlPercent: 0.86, orderId: 'ORD-MES-OPEN-001',
        strategy: 'trailing-trade', note: 'Long — momentum breakout'
      }
    },
    {
      symbol: 'ESZ2', status: 'open',
      entry_time: hoursAgo(3),
      data: {
        _seed: 'true', side: 'short', quantity: 1,
        entryPrice: 5300.00, currentPrice: 5285.00, pnl: 750.00,
        unrealizedPnlPercent: 2.83, orderId: 'ORD-ES-OPEN-002',
        strategy: 'trailing-trade', note: 'Short — failed breakout'
      }
    },
    {
      symbol: 'MNQZ2', status: 'open',
      entry_time: hoursAgo(1),
      data: {
        _seed: 'true', side: 'long', quantity: 1,
        entryPrice: 18500.00, currentPrice: 18430.00, pnl: -350.00,
        unrealizedPnlPercent: -1.89, orderId: 'ORD-MNQ-OPEN-003',
        strategy: 'trailing-trade', note: 'Long — near stop loss'
      }
    },

    // ── Closed trades today ───────────────────────────────────────────────────
    // Win: MES long
    {
      symbol: 'MESZ2', status: 'closed',
      entry_time: todayAt(9),
      data: {
        _seed: 'true', side: 'long', quantity: 2,
        entryPrice: 5240.00, exitPrice: 5249.50, pnl: 90.00,
        exitTime: todayAt(10).toISOString(),
        orderId: 'ORD-MES-CLOSED-001', strategy: 'trailing-trade'
      }
    },
    // Loss: ES long
    {
      symbol: 'ESZ2', status: 'closed',
      entry_time: todayAt(8),
      data: {
        _seed: 'true', side: 'long', quantity: 1,
        entryPrice: 5290.00, exitPrice: 5275.00, pnl: -750.00,
        exitTime: todayAt(9).toISOString(),
        orderId: 'ORD-ES-CLOSED-002', strategy: 'trailing-trade'
      }
    },
    // Win: NQ short
    {
      symbol: 'MNQZ2', status: 'closed',
      entry_time: todayAt(7),
      data: {
        _seed: 'true', side: 'short', quantity: 2,
        entryPrice: 18600.00, exitPrice: 18540.00, pnl: 240.00,
        exitTime: todayAt(8).toISOString(),
        orderId: 'ORD-MNQ-CLOSED-003', strategy: 'trailing-trade'
      }
    },
    // Win: MES short
    {
      symbol: 'MESZ2', status: 'closed',
      entry_time: todayAt(10),
      data: {
        _seed: 'true', side: 'short', quantity: 3,
        entryPrice: 5270.00, exitPrice: 5265.00, pnl: 187.50,
        exitTime: todayAt(11).toISOString(),
        orderId: 'ORD-MES-CLOSED-004', strategy: 'trailing-trade'
      }
    },
    // Win: NQZ2 long
    {
      symbol: 'NQZ2', status: 'closed',
      entry_time: todayAt(11),
      data: {
        _seed: 'true', side: 'long', quantity: 1,
        entryPrice: 18420.00, exitPrice: 18445.50, pnl: 510.00,
        exitTime: todayAt(12).toISOString(),
        orderId: 'ORD-NQ-CLOSED-005', strategy: 'manual'
      }
    },

    // ── Closed trades yesterday ───────────────────────────────────────────────
    {
      symbol: 'ESZ2', status: 'closed',
      entry_time: daysAgo(1),
      data: {
        _seed: 'true', side: 'long', quantity: 1,
        entryPrice: 5270.00, exitPrice: 5295.00, pnl: 1250.00,
        exitTime: new Date(daysAgo(1).getTime() + 2 * 3600000).toISOString(),
        orderId: 'ORD-ES-YEST-001', strategy: 'trailing-trade'
      }
    },
    {
      symbol: 'NQZ2', status: 'closed',
      entry_time: daysAgo(1),
      data: {
        _seed: 'true', side: 'short', quantity: 1,
        entryPrice: 18550.00, exitPrice: 18580.00, pnl: -600.00,
        exitTime: new Date(daysAgo(1).getTime() + 4 * 3600000).toISOString(),
        orderId: 'ORD-NQ-YEST-002', strategy: 'trailing-trade'
      }
    },

    // ── Closed trades this week (3–5 days ago) ────────────────────────────────
    {
      symbol: 'ESZ2', status: 'closed',
      entry_time: daysAgo(3),
      data: {
        _seed: 'true', side: 'long', quantity: 1,
        entryPrice: 5220.00, exitPrice: 5237.50, pnl: 875.00,
        exitTime: new Date(daysAgo(3).getTime() + 3 * 3600000).toISOString(),
        orderId: 'ORD-ES-WEEK-001', strategy: 'trailing-trade'
      }
    },
    {
      symbol: 'MESZ2', status: 'closed',
      entry_time: daysAgo(4),
      data: {
        _seed: 'true', side: 'short', quantity: 3,
        entryPrice: 5280.00, exitPrice: 5261.25, pnl: 281.25,
        exitTime: new Date(daysAgo(4).getTime() + 5 * 3600000).toISOString(),
        orderId: 'ORD-MES-WEEK-002', strategy: 'trailing-trade'
      }
    },
    {
      symbol: 'MNQZ2', status: 'closed',
      entry_time: daysAgo(5),
      data: {
        _seed: 'true', side: 'long', quantity: 1,
        entryPrice: 18600.00, exitPrice: 18520.00, pnl: -400.00,
        exitTime: new Date(daysAgo(5).getTime() + 2 * 3600000).toISOString(),
        orderId: 'ORD-MNQ-WEEK-003', strategy: 'trailing-trade'
      }
    },

    // ── Older closed trades (> 7 days — historical) ───────────────────────────
    {
      symbol: 'ESZ2', status: 'closed',
      entry_time: daysAgo(10),
      data: {
        _seed: 'true', side: 'long', quantity: 1,
        entryPrice: 5180.00, exitPrice: 5210.00, pnl: 1500.00,
        exitTime: new Date(daysAgo(10).getTime() + 6 * 3600000).toISOString(),
        orderId: 'ORD-ES-OLD-001', strategy: 'trailing-trade'
      }
    },
    {
      symbol: 'NQZ2', status: 'closed',
      entry_time: daysAgo(14),
      data: {
        _seed: 'true', side: 'short', quantity: 1,
        entryPrice: 18700.00, exitPrice: 18655.00, pnl: 900.00,
        exitTime: new Date(daysAgo(14).getTime() + 3 * 3600000).toISOString(),
        orderId: 'ORD-NQ-OLD-002', strategy: 'manual'
      }
    },
    // Stop-loss hit (old)
    {
      symbol: 'MESZ2', status: 'closed',
      entry_time: daysAgo(21),
      data: {
        _seed: 'true', side: 'long', quantity: 2,
        entryPrice: 5310.00, exitPrice: 5273.75, pnl: -453.75,
        exitTime: new Date(daysAgo(21).getTime() + 1 * 3600000).toISOString(),
        orderId: 'ORD-MES-OLD-SL-003', strategy: 'trailing-trade',
        closeReason: 'stop_loss'
      }
    },
    // Break-even trade (old)
    {
      symbol: 'NQZ2', status: 'closed',
      entry_time: daysAgo(7),
      data: {
        _seed: 'true', side: 'long', quantity: 1,
        entryPrice: 18440.00, exitPrice: 18441.25, pnl: 6.25,
        exitTime: new Date(daysAgo(7).getTime() + 1.5 * 3600000).toISOString(),
        orderId: 'ORD-NQ-BE-004', strategy: 'trailing-trade',
        closeReason: 'break_even_exit'
      }
    },
  ];

  for (const o of orders) {
    await pool.query(
      `INSERT INTO orders (symbol, status, entry_time, data)
       VALUES ($1, $2, $3, $4)`,
      [o.symbol, o.status, o.entry_time, JSON.stringify(o.data)]
    );
  }
  ok(`${orders.length} orders seeded (3 open, ${orders.length - 3} closed)`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('\n\x1b[36m[seed]\x1b[0m Connecting...');

  const pool  = new Pool(pgConfig);
  const redis = new Redis(redisConfig);
  await redis.connect();

  console.log('\x1b[36m[seed]\x1b[0m PostgreSQL + Redis connected\n');

  head('Redis');
  await seedJwtSecret(redis);
  await seedAccountInfo(redis);
  await seedChartBars(redis);

  head('trailing_trade_common');
  await seedGlobalConfig(pool);
  await seedBotState(pool);

  head('trailing_trade_symbols');
  await seedSymbols(pool);

  head('trailing_trade_grid_trade');
  await seedGridTrades(pool);

  head('trailing_trade_grid_trade_orders');
  await seedGridTradeOrders(pool);

  head('trailing_trade_cache');
  await seedCache(pool);

  head('trailing_trade_manual_orders');
  await seedManualOrders(pool);

  head('trailing_trade_logs');
  await seedLogs(pool);

  head('trailing_trade_grid_trade_archive');
  await seedArchive(pool);

  head('orders');
  await seedOrders(pool);

  await pool.end();
  await redis.quit();

  console.log(`
\x1b[32m[seed] Done.\x1b[0m

  Dashboard URL        : \x1b[1mhttp://localhost:3000\x1b[0m
  Super admin password : \x1b[1m${ADMIN_PASSWORD}\x1b[0m

  Seeded data overview:
    Symbols     : 5  (4 active, 1 disabled)
    Open orders : 3  (MES long +$90, ES short +$750, MNQ long -$350)
    Closed today: 5  (net P&L ≈ +$277.50)
    Grid trades : 4  (3 active, 1 completed)
    Archive     : 4  completed trade records
    Logs        : 19 entries  (info / warning / error)
    Chart bars  : 120 × 5m bars for ES, NQ, MES, MNQ
`);
}

seed().catch(err => {
  console.error('\x1b[31m[seed] FAILED:\x1b[0m', err.message);
  process.exit(1);
});
