/**
 * uWebSockets.js server configuration.
 *
 * Creates a high-performance WebSocket server using uWebSockets.js.
 * Handles browser client connections, command routing (same protocol as
 * the existing ws server), and broadcasts via uWS built-in pub/sub topics.
 *
 * Topics:
 *   notifications  — forwarded from PubSub 'frontend-notification'
 *   market-data    — Tradovate market data events
 *   order-updates  — Tradovate order/position/fill events
 *
 * Message protocol (same as existing ws server):
 *   Client → Server: { command, authToken, data }
 *   Server → Client: { result, type, message|... }
 */

const uWS = require('uWebSockets.js');
const config = require('config');

const { PubSub } = require('../helpers');
const { verifyAuthenticated } = require('../cronjob/trailingTradeHelper/common');

const {
  handleLatest,
  handleSettingUpdate,
  handleSymbolUpdateLastBuyPrice,
  handleSymbolSettingUpdate,
  handleSymbolSettingDelete,
  handleSymbolEnableAction,
  handleExchangeSymbolsGet,
} = require('../frontend/websocket/handlers');

const TOPIC_NOTIFICATIONS = 'notifications';
const TOPIC_MARKET_DATA = 'market-data';
const TOPIC_ORDER_UPDATES = 'order-updates';

const decoder = new TextDecoder();

const COMMAND_MAP = {
  latest: handleLatest,
  'setting-update': handleSettingUpdate,
  'symbol-update-last-buy-price': handleSymbolUpdateLastBuyPrice,
  'symbol-setting-update': handleSymbolSettingUpdate,
  'symbol-setting-delete': handleSymbolSettingDelete,
  'symbol-enable-action': handleSymbolEnableAction,
  'exchange-symbols-get': handleExchangeSymbolsGet,
};

/**
 * Create and start the uWebSockets server.
 * @param {number} port
 * @param {object} logger  — Bunyan logger instance
 * @returns {Promise<object>} uWS App instance
 */
const createUWSApp = (port, logger) => {
  const app = uWS.App();

  // ── Bridge PubSub frontend-notification → uWS 'notifications' topic ─────
  PubSub.subscribe('frontend-notification', (_msg, data) => {
    app.publish(
      TOPIC_NOTIFICATIONS,
      JSON.stringify({ result: true, type: 'notification', message: data }),
      false // not binary
    );
  });

  // ── WebSocket handler ─────────────────────────────────────────────────────
  app.ws('/*', {
    compression: uWS.SHARED_COMPRESSOR,
    maxPayloadLength: 16 * 1024 * 1024, // 16 MB
    idleTimeout: 32, // seconds

    // Attach client IP from upgrade request
    upgrade: (res, req, context) => {
      const ip = decoder.decode(res.getRemoteAddressAsText());
      res.upgrade(
        { ip },
        req.getHeader('sec-websocket-key'),
        req.getHeader('sec-websocket-protocol'),
        req.getHeader('sec-websocket-extensions'),
        context
      );
    },

    open: (ws) => {
      // Subscribe to all broadcast topics
      ws.subscribe(TOPIC_NOTIFICATIONS);
      ws.subscribe(TOPIC_MARKET_DATA);
      ws.subscribe(TOPIC_ORDER_UPDATES);

      ws.send(
        JSON.stringify({
          result: true,
          type: 'connection_success',
          message: 'Connected to uWebSockets server.',
        }),
        false
      );

      const { ip } = ws.getUserData();
      logger.info({ ip }, 'UWS client connected');
    },

    message: async (ws, message, isBinary) => {
      if (isBinary) return;

      let payload;
      try {
        payload = JSON.parse(decoder.decode(message));
      } catch (e) {
        ws.send(
          JSON.stringify({ result: false, type: 'error', message: 'Invalid JSON.' }),
          false
        );
        return;
      }

      if (!payload || !payload.command) {
        ws.send(
          JSON.stringify({ result: false, type: 'warning', message: 'Command is not provided.' }),
          false
        );
        return;
      }

      const handler = COMMAND_MAP[payload.command];
      if (!handler) {
        ws.send(
          JSON.stringify({ result: false, type: 'warning', message: 'Command is not recognised.' }),
          false
        );
        return;
      }

      const isAuthenticated = await verifyAuthenticated(logger, payload.authToken);

      if (payload.command === 'latest') {
        // latest handles auth state internally (unauthenticated gets limited data)
        payload.isAuthenticated = isAuthenticated;
      } else if (!isAuthenticated) {
        if (config.get('authentication.enabled')) {
          ws.send(
            JSON.stringify({ result: false, type: 'warning', message: 'You must be authenticated.' }),
            false
          );
          return;
        }
      }

      await handler(logger, ws, payload);
    },

    drain: (ws) => {
      logger.warn({ buffered: ws.getBufferedAmount() }, 'UWS client backpressure');
    },

    close: (ws, code) => {
      const { ip } = ws.getUserData();
      logger.info({ ip, code }, 'UWS client disconnected');
    },
  });

  // ── HTTP health endpoint ──────────────────────────────────────────────────
  app.get('/health', (res) => {
    res.writeHeader('Content-Type', 'application/json').end(
      JSON.stringify({ status: 'ok', server: 'uWebSockets' })
    );
  });

  // ── Start listening ───────────────────────────────────────────────────────
  return new Promise((resolve, reject) => {
    app.listen(port, (listenToken) => {
      if (listenToken) {
        logger.info({ port }, 'uWebSockets server listening');
        resolve(app);
      } else {
        reject(new Error(`uWebSockets failed to bind port ${port}`));
      }
    });
  });
};

module.exports = { createUWSApp, TOPIC_NOTIFICATIONS, TOPIC_MARKET_DATA, TOPIC_ORDER_UPDATES };
