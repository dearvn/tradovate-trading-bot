const { logger: rootLogger, mongo } = require('./helpers');
const { runTradovate } = require('./server-tradovate');
const { runCronjob } = require('./server-cronjob');
const { runFrontend } = require('./server-frontend');
const { runErrorHandler } = require('./error-handler');

(async () => {
  const logger = rootLogger.child({
    gitHash: process.env.GIT_HASH || 'unspecified'
  });

  runErrorHandler(logger);

  await mongo.connect(logger);

  await Promise.all([
    runTradovate(logger),
    runCronjob(logger),
    runFrontend(logger)
  ]);
})();
