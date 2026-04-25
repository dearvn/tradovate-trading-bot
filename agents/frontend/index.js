/**
 * FrontendAgent — Express HTTP + WebSocket server process.
 *
 * Responsibilities:
 *   - Serves the React SPA and REST API handlers.
 *   - Maintains WebSocket connections to browser clients.
 *   - Bridges Redis pub/sub events → WebSocket broadcasts:
 *       evt:notification:frontend → type:'notification'
 *       evt:strategy:price-tick   → type:'price-tick'
 *       evt:strategy:price-update → type:'price-update'
 *   - Rate-limits login attempts via Redis.
 *
 * Channels consumed:
 *   evt:notification:frontend  — broadcast as WS 'notification'
 *   evt:strategy:price-tick    — broadcast as WS 'price-tick'
 *   evt:strategy:price-update  — broadcast as WS 'price-update'
 *
 * Channels published: none
 */

const compression = require('compression');
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('config');
const requestIp = require('request-ip');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const fileUpload = require('express-fileupload');
const WebSocket = require('ws');

const rootLogger = require('../shared/logger');
const cache = require('../shared/cache');
const { createSubscriber } = require('../shared/redis-pubsub');
const CH = require('../shared/channels');
const { runErrorHandler } = require('../shared/error-handler');

// Re-use existing app-layer handlers (they only touch cache/postgres/tradovate HTTP)
const { configureWebServer } = require('../../app/frontend/webserver/configure');
const { configureBullBoard } = require('../../app/frontend/bull-board/configure');
const { verifyAuthenticated } = require('../../app/cronjob/trailingTradeHelper/common');

const {
  handleLatest,
  handleSettingUpdate,
  handleSymbolUpdateLastBuyPrice,
  handleSymbolSettingUpdate,
  handleSymbolSettingDelete,
  handleSymbolEnableAction,
  handleExchangeSymbolsGet
} = require('../../app/frontend/websocket/handlers');

// ── Entry point ───────────────────────────────────────────────────────────────

const run = async () => {
  const logger = rootLogger.child({
    agent: 'frontend',
    gitHash: process.env.GIT_HASH || 'unspecified'
  });

  runErrorHandler(logger);

  // ── Rate limiter (shared Redis key with app layer) ────────────────────────
  const maxConsecutiveFails = config.get('authentication.loginLimiter.maxConsecutiveFails');
  const loginLimiter = new RateLimiterRedis({
    redis: cache.redis,
    keyPrefix: 'login',
    points: maxConsecutiveFails,
    duration: config.get('authentication.loginLimiter.duration'),
    blockDuration: config.get('authentication.loginLimiter.blockDuration')
  });

  // ── Express app ───────────────────────────────────────────────────────────
  const app = express();
  app.use(compression());

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
  });

  const allowedOrigin = config.get('frontend.allowedOrigin');
  app.use(cors(allowedOrigin ? { origin: allowedOrigin } : { origin: false }));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(fileUpload({
    safeFileNames: true,
    useTempFiles: true,
    tempFileDir: '/tmp/',
    limits: { fileSize: 50 * 1024 * 1024 },
    abortOnLimit: true
  }));
  app.use(express.static(path.join(__dirname, '/../../public')));

  configureBullBoard(app, logger);

  const port = parseInt(process.env.PORT || '80', 10);
  const server = app.listen(port);

  if (config.get('authentication.enabled')) {
    app.use(async (req, res, next) => {
      const clientIp = requestIp.getClientIp(req);
      const rateLimiterLogin = await loginLimiter.get(clientIp);
      if (rateLimiterLogin !== null && rateLimiterLogin.remainingPoints <= 0) {
        res.status(403).send(
          `You are blocked until ${new Date(Date.now() + rateLimiterLogin.msBeforeNext)}.`
        );
      } else {
        next();
      }
    });
  }

  await configureWebServer(app, logger, { loginLimiter });

  // ── WebSocket server ──────────────────────────────────────────────────────
  const wss = new WebSocket.Server({ noServer: true });

  const COMMAND_MAP = {
    latest: handleLatest,
    'setting-update': handleSettingUpdate,
    'symbol-update-last-buy-price': handleSymbolUpdateLastBuyPrice,
    'symbol-setting-update': handleSymbolSettingUpdate,
    'symbol-setting-delete': handleSymbolSettingDelete,
    'symbol-enable-action': handleSymbolEnableAction,
    'exchange-symbols-get': handleExchangeSymbolsGet
  };

  const handleWarning = (ws, message) => {
    ws.send(JSON.stringify({ result: false, type: 'notification', message: { type: 'warning', title: message } }));
  };

  wss.on('connection', ws => {
    ws.send(JSON.stringify({ result: true, type: 'connection_success', message: 'Connected.' }));

    ws.on('message', async rawMessage => {
      const clientIp = ws._socket.remoteAddress;
      const rateLimiterLogin = await loginLimiter.get(clientIp);

      if (config.get('authentication.enabled') && rateLimiterLogin && rateLimiterLogin.remainingPoints <= 0) {
        handleWarning(ws, `You are blocked until ${new Date(Date.now() + rateLimiterLogin.msBeforeNext)}.`);
        return;
      }

      let payload;
      try { payload = JSON.parse(rawMessage); } catch (e) { payload = null; }

      if (!payload || payload.command === undefined) {
        handleWarning(ws, 'Command is not provided.');
        return;
      }

      if (!COMMAND_MAP[payload.command]) {
        handleWarning(ws, 'Command is not recognised.');
        return;
      }

      const isAuthenticated = await verifyAuthenticated(logger, payload.authToken);
      if (payload.command === 'latest') {
        payload.isAuthenticated = isAuthenticated;
      } else if (!isAuthenticated && config.get('authentication.enabled')) {
        handleWarning(ws, 'You must be authenticated.');
        return;
      }

      await COMMAND_MAP[payload.command](logger, ws, payload);
    });
  });

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, wSocket => {
      wss.emit('connection', wSocket, request);
    });
  });

  // ── Bridge Redis pub/sub → WebSocket broadcasts ───────────────────────────
  const sub = createSubscriber();

  const broadcast = (type, payload) => {
    const msg = JSON.stringify(payload);
    wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  };

  sub.subscribe(CH.EVT_NOTIFICATION, (_channel, data) => {
    if (!data) return;
    broadcast('notification', { result: true, type: 'notification', message: data });
  });

  sub.subscribe(CH.EVT_PRICE_TICK, (_channel, data) => {
    if (!data) return;
    broadcast('price-tick', { result: true, type: 'price-tick', data });
  });

  sub.subscribe(CH.EVT_PRICE_UPDATE, (_channel, data) => {
    if (!data) return;
    broadcast('price-update', { result: true, type: 'price-update', data });
  });

  sub.subscribe(CH.EVT_MD_CHART, (_channel, data) => {
    if (!data) return;
    broadcast('bar-update', { result: true, type: 'bar-update', data });
  });

  sub.subscribe(CH.EVT_ORDER_FLOW_SNAPSHOT, (_channel, data) => {
    if (!data) return;
    broadcast('order-flow', { result: true, type: 'order-flow', data });
  });

  sub.subscribe(CH.EVT_VOL_PROFILE_SNAPSHOT, (_channel, data) => {
    if (!data) return;
    broadcast('vol-profile', { result: true, type: 'vol-profile', data });
  });

  sub.subscribe(CH.EVT_REGIME_SNAPSHOT, (_channel, data) => {
    if (!data) return;
    broadcast('regime', { result: true, type: 'regime', data });
  });

  logger.info({ port }, 'FrontendAgent ready');
};

run().catch(err => {
  console.error('FrontendAgent fatal error:', err);
  process.exit(1);
});
