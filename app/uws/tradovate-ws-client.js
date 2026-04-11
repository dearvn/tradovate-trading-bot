/**
 * Tradovate WebSocket Bridge for uWebSockets microservice.
 *
 * Connects to Tradovate's market data and trading WebSocket endpoints,
 * parses the SockJS-like frame protocol, and broadcasts events to uWS
 * topic subscribers and internal PubSub.
 *
 * Frame protocol (outgoing):
 *   {endpoint}\n{request_id}\n{query}\n{json_body}
 *
 * Frame protocol (incoming):
 *   o        — socket opened
 *   h        — server heartbeat
 *   c[...]   — socket closed
 *   a[...]   — array of message objects
 */

const WebSocket = require('ws');
const config = require('config');

const { getAccessToken } = require('../tradovate/common');
const { PubSub } = require('../helpers');

const DEMO_WS_URL = 'wss://demo.tradovateapi.com/v1/websocket';
const LIVE_WS_URL = 'wss://live.tradovateapi.com/v1/websocket';
const MD_DEMO_WS_URL = 'wss://md-demo.tradovateapi.com/v1/websocket';
const MD_LIVE_WS_URL = 'wss://md.tradovateapi.com/v1/websocket';

const HEARTBEAT_MS = 2500;
const RECONNECT_MS = 5000;

// Entity types that belong to the order/trading domain
const ORDER_ENTITY_TYPES = new Set([
  'order',
  'orderVersion',
  'fill',
  'executionReport',
  'commandReport',
  'command',
  'position',
  'cashBalance',
  'tradingPermission',
  'marginSnapshot',
  'userAccountPositionLimit',
  'userAccountRiskParameter',
]);

class TradovateWsClient {
  constructor({ url, label, logger, onMessage }) {
    this.url = url;
    this.label = label;
    this.logger = logger;
    this.onMessage = onMessage;
    this.ws = null;
    this._requestCounter = 0;
    this._heartbeatTimer = null;
    this._destroyed = false;
  }

  /**
   * Build a Tradovate WebSocket request frame.
   * Returns { id, frame } where frame is the raw string to send.
   */
  _buildFrame(endpoint, query = '', body = null) {
    const id = ++this._requestCounter;
    const bodyStr = body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
    return { id, frame: `${endpoint}\n${id}\n${query}\n${bodyStr}` };
  }

  /** Send a Tradovate request frame, returns request id. */
  sendRequest(endpoint, query = '', body = null) {
    const { id, frame } = this._buildFrame(endpoint, query, body);
    this._sendRaw(frame);
    return id;
  }

  _sendRaw(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  connect() {
    if (this._destroyed) return;

    this.logger.info({ label: this.label, url: this.url }, 'Tradovate WS connecting...');
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.logger.info({ label: this.label }, 'Tradovate WS connected');
    });

    this.ws.on('message', (data) => {
      this._handleFrame(data.toString());
    });

    this.ws.on('ping', () => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.pong();
      }
    });

    this.ws.on('error', (err) => {
      this.logger.error({ err, label: this.label }, 'Tradovate WS error');
    });

    this.ws.on('close', (code) => {
      this._stopHeartbeat();
      if (!this._destroyed) {
        this.logger.warn({ label: this.label, code }, `Tradovate WS closed, reconnecting in ${RECONNECT_MS}ms`);
        setTimeout(() => this.connect(), RECONNECT_MS);
      }
    });
  }

  destroy() {
    this._destroyed = true;
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.terminate();
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      this._sendRaw('[]');
    }, HEARTBEAT_MS);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  async _handleFrame(raw) {
    if (!raw || raw.length === 0) return;

    const prefix = raw[0];
    const content = raw.slice(1);

    switch (prefix) {
      case 'o': {
        // Socket opened — authorize immediately
        const { token } = await getAccessToken();
        if (!token) {
          this.logger.warn({ label: this.label }, 'No Tradovate token for WS auth, retrying in 10s');
          setTimeout(() => this._handleFrame('o'), 10000);
          return;
        }
        // Authorize: body is the raw token string (not JSON-wrapped)
        this.sendRequest('authorize', '', token);
        this._startHeartbeat();
        break;
      }

      case 'h':
        // Server heartbeat — no response needed
        break;

      case 'c':
        this._stopHeartbeat();
        break;

      case 'a': {
        let messages;
        try {
          messages = JSON.parse(content);
        } catch (e) {
          this.logger.warn({ label: this.label, content }, 'Failed to parse WS message array');
          return;
        }
        for (const msg of messages) {
          const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg;
          try {
            await this.onMessage(parsed, this);
          } catch (err) {
            this.logger.error({ err, label: this.label }, 'Error in WS message handler');
          }
        }
        break;
      }

      default:
        break;
    }
  }
}

/**
 * Create and connect Tradovate WebSocket bridge clients.
 * @param {object} uwsApp  — uWebSockets App instance for topic publishing
 * @param {object} logger
 * @returns {{ tradingWs: TradovateWsClient, mdWs: TradovateWsClient }}
 */
const createTradovateWsBridge = (uwsApp, logger) => {
  const isLive = config.get('mode') === 'production';
  const tradingUrl = isLive ? LIVE_WS_URL : DEMO_WS_URL;
  const mdUrl = isLive ? MD_LIVE_WS_URL : MD_DEMO_WS_URL;

  // ── Trading WebSocket (orders, positions, account events) ────────────────
  const tradingWs = new TradovateWsClient({
    url: tradingUrl,
    label: 'trading',
    logger,
    onMessage: async (msg, client) => {
      // Authorization response (request id 1)
      if (msg.s === 200 && msg.i === 1) {
        logger.info('Tradovate trading WS authorized');
        PubSub.publish('tradovate-ws-authorized', { type: 'trading' });

        // Request account sync so we start receiving account entity events
        client.sendRequest('user/syncrequest', '', { accounts: [] });
        return;
      }

      // Entity events pushed by server
      if (msg.e) {
        const payload = JSON.stringify({
          type: 'tradovate-event',
          entityType: msg.e,
          data: msg.d,
        });

        // Publish to uWS order-updates topic
        uwsApp.publish('order-updates', payload, false);

        // Also relay via PubSub so existing cronjob code can react
        PubSub.publish(`tradovate-event-${msg.e}`, msg.d);
        return;
      }

      // Generic response
      if (msg.s !== undefined) {
        logger.info({ status: msg.s, requestId: msg.i }, 'Tradovate trading WS response');
      }
    },
  });

  // ── Market Data WebSocket (quotes, candles, DOM) ─────────────────────────
  const mdWs = new TradovateWsClient({
    url: mdUrl,
    label: 'market-data',
    logger,
    onMessage: async (msg, client) => {
      // Authorization response (request id 1)
      if (msg.s === 200 && msg.i === 1) {
        logger.info('Tradovate market-data WS authorized');
        PubSub.publish('tradovate-ws-authorized', { type: 'market-data' });

        // Subscribe to the configured symbol's quotes
        const symbol = config.get('symbol');
        if (symbol) {
          client.sendRequest('md/subscribeQuote', '', { symbol });
          logger.info({ symbol }, 'Subscribed to Tradovate quote feed');
        }

        // Subscribe to all configured symbols
        const symbols = config.get('symbols') || [];
        symbols.forEach(({ symbol: sym }) => {
          if (sym && sym !== symbol) {
            client.sendRequest('md/subscribeQuote', '', { symbol: sym });
          }
        });
        return;
      }

      // Market data entity events
      if (msg.e) {
        const payload = JSON.stringify({
          type: 'tradovate-event',
          entityType: msg.e,
          data: msg.d,
        });

        // Publish to uWS market-data topic
        uwsApp.publish('market-data', payload, false);

        // Bridge to PubSub for trading strategy consumption
        if (msg.e === 'md_Quote') {
          PubSub.publish('market-data-quote', msg.d);
        } else if (msg.e === 'md_Chart') {
          PubSub.publish('market-data-chart', msg.d);
        } else if (msg.e === 'md_DOM') {
          PubSub.publish('market-data-dom', msg.d);
        }
        return;
      }

      if (msg.s !== undefined) {
        logger.info({ status: msg.s, requestId: msg.i }, 'Tradovate market-data WS response');
      }
    },
  });

  tradingWs.connect();
  mdWs.connect();

  logger.info('Tradovate WS bridge started (trading + market-data)');

  return { tradingWs, mdWs };
};

module.exports = { createTradovateWsBridge, TradovateWsClient };
