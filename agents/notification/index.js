/**
 * NotificationAgent — alive-check cron + Slack relay process.
 *
 * Responsibilities:
 *   - Runs the alive-check cron (account info sync → Slack).
 *   - Subscribes to evt:notification:frontend to relay critical alerts to Slack.
 *   - Runs log cleanup on an hourly schedule.
 *
 * Channels consumed:
 *   evt:notification:frontend  — { type, title, message? }
 *
 * Channels published: none
 */

const { CronJob } = require('cron');
const config = require('config');

const rootLogger = require('../shared/logger');
const postgres = require('../shared/postgres');
const cache = require('../shared/cache');
const slack = require('../shared/slack');
const { createSubscriber } = require('../shared/redis-pubsub');
const CH = require('../shared/channels');
const { runErrorHandler, errorHandlerWrapper } = require('../shared/error-handler');

// ── Alive helper (adapted from app/cronjob/alive/helper.js) ─────────────────

const getAccountInfo = async logger => {
  try {
    const { connect, tvGet, tvPost } = require('../../app/tradovate/common');

    const isLive = config.get('mode') === 'production';
    const conf = isLive ? config.get('tradovate.live') : config.get('tradovate.demo');
    const DEMO_URL = 'https://demo.tradovateapi.com/v1';
    const LIVE_URL = 'https://live.tradovateapi.com/v1';
    const endpoints = { httpDemo: DEMO_URL, httpLive: LIVE_URL };

    const opts = {
      env: isLive ? 'live' : 'demo',
      name: conf.name,
      password: conf.password,
      appId: conf.appId,
      appVersion: conf.appVersion,
      cid: conf.cid,
      sec: conf.secret,
      endpoints
    };

    const token = await connect({ ...opts, endpoints });
    if (!token) return null;

    const privGet = await tvGet({ ...opts, token, endpoints });
    const accounts = await privGet('/account/list');
    const balances = await privGet('/cashBalance/list');

    return { accounts, balances };
  } catch (err) {
    logger.error({ err }, 'NotificationAgent: getAccountInfo failed');
    return null;
  }
};

// ── Alive check ──────────────────────────────────────────────────────────────

const executeAlive = async logger => {
  await errorHandlerWrapper(logger, 'alive', async () => {
    const info = await getAccountInfo(logger);
    if (!info) return;

    await cache.set(
      'trailing_trade_common:account-info',
      JSON.stringify(info)
    );

    const text = `Account info refreshed: ${info.accounts ? info.accounts.length : 0} account(s)`;
    await slack.sendMessage(text);
    logger.info({ info }, 'Alive check completed');
  });
};

// ── Log cleanup ──────────────────────────────────────────────────────────────

const executeLogCleanup = async logger => {
  await errorHandlerWrapper(logger, 'log-cleanup', async () => {
    const deleteAfterMinutes = config.has('logs.deleteAfterMinutes')
      ? config.get('logs.deleteAfterMinutes')
      : 0;
    await postgres.cleanupLogs(logger, deleteAfterMinutes);
  });
};

// ── Entry point ──────────────────────────────────────────────────────────────

const run = async () => {
  const logger = rootLogger.child({
    agent: 'notification',
    gitHash: process.env.GIT_HASH || 'unspecified'
  });

  runErrorHandler(logger);

  await postgres.connect(logger);

  // ── Subscribe to notification events for Slack relay ─────────────────────
  const sub = createSubscriber();
  sub.subscribe(CH.EVT_NOTIFICATION, (_channel, data) => {
    if (!data) return;
    // Only relay error/warning level notifications to Slack
    if (data.type === 'error' || data.type === 'warning') {
      slack
        .sendMessage(`[${data.type.toUpperCase()}] ${data.title || data.message || ''}`)
        .catch(err => logger.error({ err }, 'Slack send failed'));
    }
  });

  // ── Alive check every 10 minutes ─────────────────────────────────────────
  const aliveCron = new CronJob('*/10 * * * *', async () => {
    await executeAlive(logger);
  });
  aliveCron.start();

  // ── Log cleanup every hour ────────────────────────────────────────────────
  const cleanupCron = new CronJob('0 * * * *', async () => {
    await executeLogCleanup(logger);
  });
  cleanupCron.start();

  // Run alive check on startup
  await executeAlive(logger);

  logger.info('NotificationAgent ready');
};

run().catch(err => {
  console.error('NotificationAgent fatal error:', err);
  process.exit(1);
});
