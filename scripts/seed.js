'use strict';

/**
 * Local development seed script
 *
 * - Generates a JWT secret and stores it in Redis
 * - Seeds global bot configuration into PostgreSQL (trailing_trade_common)
 * - Seeds default symbols into trailing_trade_symbols
 *
 * Run via:  node scripts/seed.js
 * (env vars must be exported first — run_local.sh does this automatically)
 */

const { Pool } = require('pg');
const Redis = require('ioredis');
const crypto = require('crypto');

// ── Connection config from env vars (set by run_local.sh or .env) ─────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const ok   = msg => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const skip = msg => console.log(`  \x1b[33m–\x1b[0m ${msg}`);

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

async function seedGlobalConfig(pool) {
  const { rowCount } = await pool.query(
    "SELECT 1 FROM trailing_trade_common WHERE key = 'configuration'"
  );
  if (rowCount > 0) {
    skip('Global configuration already exists');
    return;
  }

  const config = {
    key: 'configuration',
    enabled: true,
    cronTime: '* * * * * *',
    symbols: ['MESZ2', 'ESZ2', 'MNQZ2', 'NQZ2'],
    botOptions: {
      authentication: {
        lockList: true,
        lockAfter: 120,
      },
      autoTriggerBuy: {
        enabled: false,
        triggerAfter: 20,
        conditions: {
          whenLessThanATHRestriction: true,
          afterDisabledPeriod: true,
          tradingView: { overrideInterval: '', whenStrongBuy: true, whenBuy: true },
        },
      },
      orderLimit: {
        enabled: true,
        maxBuyOpenOrders: 3,
        maxOpenTrades: 5,
      },
      tradingView: {
        interval: '',
        useOnlyWithin: 5,
        ifExpires: 'ignore',
      },
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
      stopLoss: {
        enabled: false,
        maxLossPercentage: 0.8,
        disableBuyMinutes: 60,
        orderType: 'market',
      },
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

async function seedSymbols(pool) {
  const symbols = [
    { symbol: 'MESZ2', status: 'TRADING', short: 'ES' },
    { symbol: 'ESZ2',  status: 'TRADING', short: 'ES' },
    { symbol: 'MNQZ2', status: 'TRADING', short: 'NQ' },
    { symbol: 'NQZ2',  status: 'TRADING', short: 'NQ' },
  ];

  for (const sym of symbols) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM trailing_trade_symbols WHERE key = $1',
      [sym.symbol]
    );
    if (rowCount > 0) {
      skip(`Symbol ${sym.symbol} already exists`);
      continue;
    }
    await pool.query(
      'INSERT INTO trailing_trade_symbols (key, data) VALUES ($1, $2)',
      [sym.symbol, JSON.stringify({ ...sym, enabled: true })]
    );
    ok(`Symbol ${sym.symbol} seeded`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('\n\x1b[36m[seed]\x1b[0m Connecting...');

  const pool  = new Pool(pgConfig);
  const redis = new Redis(redisConfig);
  await redis.connect();

  console.log('\x1b[36m[seed]\x1b[0m PostgreSQL + Redis connected\n');

  await seedJwtSecret(redis);
  await seedGlobalConfig(pool);
  await seedSymbols(pool);

  await pool.end();
  await redis.quit();

  console.log(`
\x1b[32m[seed] Done.\x1b[0m

  Super admin password : \x1b[1m${ADMIN_PASSWORD}\x1b[0m
  Dashboard URL        : http://localhost:3000
`);
}

seed().catch(err => {
  console.error('\x1b[31m[seed] FAILED:\x1b[0m', err.message);
  process.exit(1);
});
