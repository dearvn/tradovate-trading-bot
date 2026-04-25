/**
 * ConfigAgent — configuration management process.
 *
 * Responsibilities:
 *   - Connects to PostgreSQL and reads the global configuration on startup.
 *   - Publishes evt:config:changed on startup so other agents can warm up.
 *   - Polls for configuration changes every 30 seconds and re-broadcasts.
 *   - Exposes no HTTP — other agents read config from Postgres directly
 *     or listen on the Redis channel.
 *
 * Channels published:
 *   evt:config:changed  — { globalConfiguration }
 */

const rootLogger = require('../shared/logger');
const postgres = require('../shared/postgres');
const { createPublisher } = require('../shared/redis-pubsub');
const CH = require('../shared/channels');
const { runErrorHandler } = require('../shared/error-handler');

const POLL_INTERVAL_MS = 30_000;

const run = async () => {
  const logger = rootLogger.child({
    agent: 'config',
    gitHash: process.env.GIT_HASH || 'unspecified'
  });

  runErrorHandler(logger);

  await postgres.connect(logger);

  const pub = createPublisher('config');

  let lastHash = null;

  const broadcast = async () => {
    try {
      const row = await postgres.findOne(logger, 'trailing_trade_common', { key: 'configuration' });
      const globalConfiguration = row || {};

      const hash = JSON.stringify(globalConfiguration);
      if (hash === lastHash) return;
      lastHash = hash;

      await pub.publish(CH.EVT_CONFIG_CHANGED, { globalConfiguration });
      logger.info('Configuration broadcast sent');
    } catch (err) {
      logger.error({ err }, 'ConfigAgent: failed to read/broadcast configuration');
    }
  };

  // Initial broadcast
  await broadcast();

  // Poll for changes
  setInterval(broadcast, POLL_INTERVAL_MS);

  logger.info('ConfigAgent ready');
};

run().catch(err => {
  console.error('ConfigAgent fatal error:', err);
  process.exit(1);
});
