/**
 * MarketDataAgent — Tradovate WebSocket bridge process.
 *
 * Responsibilities:
 *   - Connects to Tradovate trading WebSocket (orders, positions, account events).
 *   - Connects to Tradovate market-data WebSocket (quotes, candles, DOM).
 *   - Broadcasts all entity events to other agents via Redis pub/sub.
 *   - Listens for cmd:tradovate:reset-ws to reconnect.
 *
 * Channels published:
 *   evt:tradovate:ws-authorized   — { type: 'trading'|'market-data' }
 *   evt:tradovate:entity:{type}   — entity data from trading WS
 *   evt:market-data:quote         — md_Quote data
 *   evt:market-data:chart         — md_Chart data
 *   evt:market-data:dom           — md_DOM data
 *
 * Channels consumed:
 *   cmd:tradovate:reset-ws        — reconnects both WebSocket clients
 *   cmd:tradovate:reconnect       — re-authenticates Tradovate HTTP token
 */

const WebSocket = require('ws');
const config = require('config');

const rootLogger = require('../shared/logger');
const { createPublisher, createSubscriber } = require('../shared/redis-pubsub');
const CH = require('../shared/channels');
const cache = require('../shared/cache');
const { runErrorHandler } = require('../shared/error-handler');
const { getAccessToken } = require('../../app/tradovate/common');

const DEMO_WS_URL = 'wss://demo.tradovateapi.com/v1/websocket';
const LIVE_WS_URL = 'wss://live.tradovateapi.com/v1/websocket';
const MD_DEMO_WS_URL = 'wss://md-demo.tradovateapi.com/v1/websocket';
const MD_LIVE_WS_URL = 'wss://md.tradovateapi.com/v1/websocket';

const HEARTBEAT_MS = 2500;
const RECONNECT_MS = 5000;

// ── TradovateWsClient (self-contained, no uWS dependency) ────────────────────

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

  _buildFrame(endpoint, query = '', body = null) {
    const id = ++this._requestCounter;
    const bodyStr = body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
    return { id, frame: `${endpoint}\n${id}\n${query}\n${bodyStr}` };
  }

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

    this.ws.on('message', data => {
      this._handleFrame(data.toString());
    });

    this.ws.on('ping', () => {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.pong();
    });

    this.ws.on('error', err => {
      this.logger.error({ err, label: this.label }, 'Tradovate WS error');
    });

    this.ws.on('close', code => {
      this._stopHeartbeat();
      if (!this._destroyed) {
        this.logger.warn(
          { label: this.label, code },
          `Tradovate WS closed, reconnecting in ${RECONNECT_MS}ms`
        );
        setTimeout(() => this.connect(), RECONNECT_MS);
      }
    });
  }

  destroy() {
    this._destroyed = true;
    this._stopHeartbeat();
    if (this.ws) this.ws.terminate();
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => this._sendRaw('[]'), HEARTBEAT_MS);
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
        const { token } = await getAccessToken();
        if (!token) {
          this.logger.warn({ label: this.label }, 'No Tradovate token for WS auth, retrying in 10s');
          setTimeout(() => this._handleFrame('o'), 10_000);
          return;
        }
        this.sendRequest('authorize', '', token);
        this._startHeartbeat();
        break;
      }

      case 'h':
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

// ── Bridge factory ────────────────────────────────────────────────────────────

const BARS_CACHE_KEY = sym => `chart:bars:${sym}`;
const BARS_TTL_SECONDS = 7200;
const MAX_STORED_BARS = 500;

const storeBars = async (symbol, bars, isHistorical, logger) => {
  try {
    if (isHistorical) {
      const trimmed = bars.slice(-MAX_STORED_BARS);
      await cache.redis.set(BARS_CACHE_KEY(symbol), JSON.stringify(trimmed), 'EX', BARS_TTL_SECONDS);
    } else {
      const raw = await cache.redis.get(BARS_CACHE_KEY(symbol));
      let stored = raw ? JSON.parse(raw) : [];
      for (const bar of bars) {
        const idx = stored.findIndex(b => b.timestamp === bar.timestamp);
        if (idx >= 0) {
          stored[idx] = bar;
        } else {
          stored.push(bar);
          if (stored.length > MAX_STORED_BARS) stored = stored.slice(-MAX_STORED_BARS);
        }
      }
      await cache.redis.set(BARS_CACHE_KEY(symbol), JSON.stringify(stored), 'EX', BARS_TTL_SECONDS);
    }
  } catch (err) {
    logger.error({ err, symbol }, 'Failed to store chart bars in Redis');
  }
};

const createBridge = (pub, logger) => {
  const isLive = config.get('mode') === 'production';
  const tradingUrl = isLive ? LIVE_WS_URL : DEMO_WS_URL;
  const mdUrl = isLive ? MD_LIVE_WS_URL : MD_DEMO_WS_URL;

  // Trading WebSocket
  const tradingWs = new TradovateWsClient({
    url: tradingUrl,
    label: 'trading',
    logger,
    onMessage: async (msg, client) => {
      if (msg.s === 200 && msg.i === 1) {
        logger.info('Tradovate trading WS authorized');
        await pub.publish(CH.EVT_TRADOVATE_WS_AUTHORIZED, { type: 'trading' });
        client.sendRequest('user/syncrequest', '', { accounts: [] });
        return;
      }

      if (msg.e) {
        await pub.publish(CH.EVT_TRADOVATE_ENTITY(msg.e), {
          entityType: msg.e,
          data: msg.d
        });
        return;
      }

      if (msg.s !== undefined) {
        logger.info({ status: msg.s, requestId: msg.i }, 'Tradovate trading WS response');
      }
    }
  });

  // Map: pendingReqId -> symbol, realtimeChartId -> symbol
  const pendingChartReqs = new Map();
  const chartIdToSymbol = new Map();

  // Market-data WebSocket
  const mdWs = new TradovateWsClient({
    url: mdUrl,
    label: 'market-data',
    logger,
    onMessage: async (msg, client) => {
      if (msg.s === 200 && msg.i === 1) {
        logger.info('Tradovate market-data WS authorized');
        await pub.publish(CH.EVT_TRADOVATE_WS_AUTHORIZED, { type: 'market-data' });

        const symbol = config.get('symbol');
        if (symbol) {
          client.sendRequest('md/subscribeQuote', '', { symbol });
          logger.info({ symbol }, 'Subscribed to Tradovate quote feed');

          const chartReqId = client.sendRequest('md/subscribeChart', '', {
            symbol,
            chartDescription: {
              underlyingType: 'MinuteBar',
              elementSize: 5,
              elementSizeUnit: 'UnderlyingUnits',
              withHistogram: false
            },
            timeRange: { asMuchAsElements: 300 }
          });
          pendingChartReqs.set(chartReqId, symbol);
          logger.info({ symbol, chartReqId }, 'Subscribed to Tradovate chart feed');
        }

        const symbols = config.has('symbols') ? config.get('symbols') : [];
        symbols.forEach(({ symbol: sym }) => {
          if (sym && sym !== symbol) {
            client.sendRequest('md/subscribeQuote', '', { symbol: sym });
          }
        });
        return;
      }

      // Handle subscribeChart response — maps realtimeId -> symbol
      if (msg.s === 200 && msg.i && pendingChartReqs.has(msg.i) && msg.d && msg.d.realtimeId) {
        const sym = pendingChartReqs.get(msg.i);
        pendingChartReqs.delete(msg.i);
        chartIdToSymbol.set(msg.d.realtimeId, sym);
        logger.info({ sym, realtimeId: msg.d.realtimeId }, 'Chart subscription confirmed');
        return;
      }

      if (msg.e) {
        if (msg.e === 'md_Quote') {
          await pub.publish(CH.EVT_MD_QUOTE, msg.d);
        } else if (msg.e === 'md_Chart') {
          await pub.publish(CH.EVT_MD_CHART, msg.d);
          // Store bars per symbol
          for (const chart of (msg.d.charts || [])) {
            const sym = chartIdToSymbol.get(chart.id);
            if (!sym || !Array.isArray(chart.bars) || chart.bars.length === 0) continue;
            await storeBars(sym, chart.bars, !!chart.td, logger);
          }
        } else if (msg.e === 'md_DOM') {
          await pub.publish(CH.EVT_MD_DOM, msg.d);
        }
        return;
      }

      if (msg.s !== undefined) {
        logger.info({ status: msg.s, requestId: msg.i }, 'Tradovate market-data WS response');
      }
    }
  });

  return { tradingWs, mdWs };
};

// ── Entry point ───────────────────────────────────────────────────────────────

const run = async () => {
  const logger = rootLogger.child({
    agent: 'market-data',
    gitHash: process.env.GIT_HASH || 'unspecified'
  });

  runErrorHandler(logger);

  const pub = createPublisher('market-data');
  const sub = createSubscriber();

  let bridge = createBridge(pub, logger);
  bridge.tradingWs.connect();
  bridge.mdWs.connect();

  // ── Handle reset command ──────────────────────────────────────────────────
  sub.subscribe(
    [CH.CMD_TRADOVATE_RESET_WS, CH.CMD_TRADOVATE_RECONNECT],
    (channel, _data) => {
      logger.info({ channel }, 'MarketDataAgent: reconnecting WS bridge');
      bridge.tradingWs.destroy();
      bridge.mdWs.destroy();
      bridge = createBridge(pub, logger);
      bridge.tradingWs.connect();
      bridge.mdWs.connect();
    }
  );

  logger.info('MarketDataAgent ready (trading + market-data WS bridge)');
};

run().catch(err => {
  console.error('MarketDataAgent fatal error:', err);
  process.exit(1);
});
