/**
 * Error handler for agents.
 * Lightweight version of app/error-handler.js — no external helper dependencies.
 */

const runErrorHandler = logger => {
  process.on('unhandledRejection', err => {
    throw err;
  });

  process.on('uncaughtException', err => {
    logger.error({ err }, 'Uncaught exception');
  });
};

const handleError = (logger, job, err) => {
  if (err.message && err.message.includes('redlock')) {
    return;
  }
  logger.error(
    { err, errorCode: err.code, debug: true, saveLog: true },
    `⚠ Execution failed in: ${job}`
  );
};

const errorHandlerWrapper = async (logger, job, callback) => {
  try {
    await callback();
  } catch (err) {
    handleError(logger, job, err);
  }
};

module.exports = { runErrorHandler, errorHandlerWrapper, handleError };
