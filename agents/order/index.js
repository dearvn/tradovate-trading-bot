/**
 * OrderAgent — Tradovate order sync + Bull queue process.
 *
 * Responsibilities:
 *   - Initialises Bull queues for monitored symbols on startup.
 *   - Polls Tradovate REST API every ~40 s for open orders and caches them.
 *   - Listens for cmd:order:check-open / cmd:order:check-closed to trigger
 *     an immediate queue job for each open symbol.
 *   - Listens for cmd:tradovate:reconnect to re-authenticate the HTTP token.
 *   - Broadcasts a restart notification and re-syncs on cmd:tradovate:reset-ws.
 *
 * Channels consumed:
 *   cmd:order:check-open       — immediate open-order queue run
 *   cmd:order:check-closed     — immediate account refresh
 *   cmd:tradovate:reset-ws     — re-sync all queues + notify frontend
 *   cmd:tradovate:reconnect    — re-authenticate Tradovate HTTP token
 *   evt:config:changed         — reload globalConfiguration / symbols list
 *
 * Channels published:
 *   evt:notification:frontend  — { type: 'info', title: 'Restarting bot...' }
 */

const _ = require('lodash');
const config = require('config');

const rootLogger = require('../shared/logger');
const postgres = require('../shared/postgres');
const cache = require('../shared/cache');
const { createPublisher, createSubscriber } = require('../shared/redis-pubsub');
const CH = require('../shared/channels');
const { runErrorHandler, errorHandlerWrapper } = require('../shared/error-handler');

const { connect, getAccessToken } = require('../../app/tradovate/common');
const tradovate = require('../../app/helpers/tradovate');
const queue = require('../../app/cronjob/trailingTradeHelper/queue');
const {
  getGlobalConfiguration
} = require('../../app/cronjob/trailingTradeHelper/configuration');
const {
  getAccountInfoFromAPI,
  getOpenOrdersFromAPI
} = require('../../app/cronjob/trailingTradeHelper/common');

const DEMO_URL = 'https://demo.tradovateapi.com/v1';
const LIVE_URL = 'https://live.tradovateapi.com/v1';

let openOrdersInterval = null;

// ── Open-order sync loop ──────────────────────────────────────────────────────

const startOpenOrderSync = (logger, symbols) => {
  if (openOrdersInterval) clearInterval(openOrdersInterval);

  openOrdersInterval = setInterval(() => {
    errorHandlerWrapper(logger, 'Orders', async () => {
      const openOrders = await getOpenOrdersFromAPI(logger);

      const initializedSymbolOpenOrders = _.reduce(
        symbols,
        (obj, symbol) => { obj[symbol] = []; return obj; },
        {}
      );

      const symbolOpenOrders = _.groupBy(openOrders, 'symbol');
      const mergedOpenOrders = _.merge(initializedSymbolOpenOrders, symbolOpenOrders);

      await Promise.all(
        _.map(mergedOpenOrders, (orders, symbol) =>
          cache.hset('trailing-trade-open-orders', symbol, JSON.stringify(orders))
        )
      );
    });
  }, 30 * 1310);
};

// ── Full sync (queue init + open order poll) ──────────────────────────────────

const syncAll = async (logger, pub) => {
  const globalConfiguration = await getGlobalConfiguration(logger);

  if (globalConfiguration.botOptions && globalConfiguration.botOptions.stop_bot) {
    return;
  }

  let symbol = config.get('symbol');
  if (globalConfiguration.candles && globalConfiguration.candles.symbol) {
    symbol = globalConfiguration.candles.symbol;
  }
  const symbols = [symbol];

  await queue.init(logger, symbols);
  startOpenOrderSync(logger, symbols);

  logger.info({ symbols }, 'OrderAgent: queues initialised, open-order sync started');
};

// ── Entry point ───────────────────────────────────────────────────────────────

const run = async () => {
  const logger = rootLogger.child({
    agent: 'order',
    gitHash: process.env.GIT_HASH || 'unspecified'
  });

  runErrorHandler(logger);

  await postgres.connect(logger);

  const pub = createPublisher('order');
  const sub = createSubscriber();

  // Initial sync
  await syncAll(logger, pub);

  // ── cmd:tradovate:reconnect — re-authenticate HTTP token ──────────────────
  sub.subscribe(CH.CMD_TRADOVATE_RECONNECT, async (_channel, _data) => {
    logger.info('OrderAgent: reconnecting Tradovate HTTP token');
    const env = config.get('mode') === 'production' ? 'live' : 'demo';
    const conf = config.get('mode') === 'production'
      ? config.get('tradovate.live')
      : config.get('tradovate.demo');

    const opts = {
      env,
      name: conf.name,
      password: conf.password,
      appId: conf.appId,
      appVersion: conf.appVersion,
      cid: conf.cid,
      sec: conf.secret,
      endpoints: { httpDemo: DEMO_URL, httpLive: LIVE_URL }
    };

    await connect({ ...opts, endpoints: opts.endpoints });
  });

  // ── cmd:tradovate:reset-ws — re-sync on WS bridge restart ────────────────
  sub.subscribe(CH.CMD_TRADOVATE_RESET_WS, async (_channel, _data) => {
    logger.info('OrderAgent: WS reset received — re-syncing');
    pub.publish(CH.EVT_NOTIFICATION, { type: 'info', title: 'Restarting bot...' });
    await syncAll(logger, pub);
  });

  // ── cmd:order:check-open — queue a job for every open symbol ─────────────
  sub.subscribe(CH.CMD_ORDER_CHECK_OPEN, async (_channel, _data) => {
    await errorHandlerWrapper(logger, 'check-open-orders', async () => {
      await getAccountInfoFromAPI();
      const cachedOpenOrders = await cache.hgetall(
        'trailing-trade-open-orders:',
        'trailing-trade-open-orders:*'
      );
      const symbols = _.keys(cachedOpenOrders);
      logger.info({ symbols }, 'OrderAgent: check-open-orders — queuing jobs');
      symbols.forEach(symbol => queue.executeFor(logger, symbol));
    });
  });

  // ── cmd:order:check-closed — refresh account info ────────────────────────
  sub.subscribe(CH.CMD_ORDER_CHECK_CLOSED, async (_channel, _data) => {
    await errorHandlerWrapper(logger, 'check-closed-orders', async () => {
      await getAccountInfoFromAPI();
    });
  });

  // ── evt:config:changed — re-sync with new symbol if needed ───────────────
  sub.subscribe(CH.EVT_CONFIG_CHANGED, async (_channel, data) => {
    if (!data || !data.globalConfiguration) return;
    const gc = data.globalConfiguration;
    const stopped = gc.botOptions && gc.botOptions.stop_bot;
    if (!stopped) {
      await syncAll(logger, pub);
    }
  });

  logger.info('OrderAgent ready');
};

run().catch(err => {
  console.error('OrderAgent fatal error:', err);
  process.exit(1);
});
