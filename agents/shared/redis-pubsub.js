/**
 * Redis pub/sub factory.
 *
 * Redis requires separate connections for publishers and subscribers —
 * a subscribed connection can only receive messages, not issue commands.
 *
 * Usage:
 *   const { createPublisher, createSubscriber } = require('../shared/redis-pubsub');
 *
 *   const pub = createPublisher('strategy');
 *   pub.publish(CH.EVT_PRICE_TICK, { price: 4200 });
 *
 *   const sub = createSubscriber();
 *   sub.subscribe(CH.EVT_STRATEGY_SIGNAL, (channel, data) => { ... });
 *   sub.subscribe([CH.EVT_MD_QUOTE, CH.EVT_MD_CHART], (channel, data) => { ... });
 *   sub.psubscribe('evt:tradovate:entity:*', (channel, data) => { ... });
 *
 * Message envelope: { v: 1, ts: <epoch-ms>, src: '<agent-name>', data: <payload> }
 */

const Redis = require('ioredis');
const config = require('config');

const ENVELOPE_VERSION = 1;

const createRedisClient = () =>
  new Redis({
    host: config.get('redis.host'),
    port: config.get('redis.port'),
    password: config.get('redis.password'),
    db: config.get('redis.db'),
  });

// ── Publisher ──────────────────────────────────────────────────────────────

/**
 * @param {string} agentName  Stamped as `src` in every envelope.
 */
const createPublisher = (agentName = 'unknown') => {
  const client = createRedisClient();

  const publish = (channel, data) => {
    const envelope = JSON.stringify({
      v: ENVELOPE_VERSION,
      ts: Date.now(),
      src: agentName,
      data,
    });
    return client.publish(channel, envelope);
  };

  const quit = () => client.quit();

  return { publish, quit, client };
};

// ── Subscriber ────────────────────────────────────────────────────────────

const createSubscriber = () => {
  const client = createRedisClient();

  /**
   * Subscribe to one or more exact channels.
   * @param {string|string[]} channels
   * @param {(channel: string, data: any, envelope: object) => void} handler
   */
  const subscribe = (channels, handler) => {
    const list = Array.isArray(channels) ? channels : [channels];
    client.subscribe(...list);

    client.on('message', (ch, raw) => {
      try {
        const envelope = JSON.parse(raw);
        handler(ch, envelope.data, envelope);
      } catch (_) {
        // ignore malformed messages
      }
    });
  };

  /**
   * Pattern subscribe (Redis PSUBSCRIBE).
   * @param {string} pattern  e.g. 'evt:tradovate:entity:*'
   * @param {(channel: string, data: any, envelope: object) => void} handler
   */
  const psubscribe = (pattern, handler) => {
    client.psubscribe(pattern);

    client.on('pmessage', (_pat, ch, raw) => {
      try {
        const envelope = JSON.parse(raw);
        handler(ch, envelope.data, envelope);
      } catch (_) {
        // ignore malformed messages
      }
    });
  };

  const quit = () => client.quit();

  return { subscribe, psubscribe, quit, client };
};

module.exports = { createPublisher, createSubscriber };
