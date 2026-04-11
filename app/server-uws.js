/**
 * uWebSockets microservice runner.
 *
 * Starts the high-performance uWebSockets server and the Tradovate
 * WebSocket bridge (market data + trading endpoints).
 *
 * Integrated into app/server.js alongside runTradovate, runCronjob,
 * and runFrontend.
 */

const config = require('config');

const { createUWSApp } = require('./uws/configure');
const { createTradovateWsBridge } = require('./uws/tradovate-ws-client');

const DEFAULT_PORT = 3001;

const runUWS = async (serverLogger) => {
  const logger = serverLogger.child({ server: 'uws' });

  const port = config.has('uws.port') ? config.get('uws.port') : DEFAULT_PORT;

  // Start uWebSockets server
  const app = await createUWSApp(port, logger);

  // Start Tradovate WebSocket bridge (connects to Tradovate WS and
  // broadcasts market data / order events to uWS topic subscribers)
  createTradovateWsBridge(app, logger);

  logger.info({ port }, 'UWS microservice ready');
};

module.exports = { runUWS };
