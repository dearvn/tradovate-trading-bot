const { handleAuth } = require('./auth');
const { handleTradovateOAuth } = require('./tradovate-oauth');
const { handleGridTradeArchiveGet } = require('./grid-trade-archive-get');
const { handleGridTradeArchiveDelete } = require('./grid-trade-archive-delete');
const { handleClosedTradesSetPeriod } = require('./closed-trades-set-period');
const { handleGridTradeLogsGet } = require('./grid-trade-logs-get');
const { handleGridTradeLogsExport } = require('./grid-trade-logs-export');
const { handleStatus } = require('./status');
const { handleSymbolDelete } = require('./symbol-delete');
const { handleBackupGet } = require('./backup-get');
const { handleRestorePost } = require('./restore-post');
const { handle404 } = require('./404');

// New React dashboard API handlers
const { handleHealthz } = require('./api/healthz');
const { handleDashboard } = require('./api/dashboard');
const { handlePositions } = require('./api/positions');
const { handleStrategy } = require('./api/strategy');
const { handleTrades } = require('./api/trades');
const { handleLogs } = require('./api/logs');
const { handleBars } = require('./api/bars');

const setHandlers = async (logger, app, { loginLimiter }) => {
  await handleAuth(logger, app, { loginLimiter });
  await handleTradovateOAuth(logger, app);
  await handleGridTradeArchiveGet(logger, app);
  await handleGridTradeArchiveDelete(logger, app);
  await handleClosedTradesSetPeriod(logger, app);
  await handleGridTradeLogsGet(logger, app);
  await handleGridTradeLogsExport(logger, app);
  await handleStatus(logger, app);
  await handleSymbolDelete(logger, app);
  await handleBackupGet(logger, app);
  await handleRestorePost(logger, app);

  // React dashboard API routes (must be before 404 catch-all)
  await handleHealthz(logger, app);
  await handleDashboard(logger, app);
  await handlePositions(logger, app);
  await handleStrategy(logger, app);
  await handleTrades(logger, app);
  await handleLogs(logger, app);
  await handleBars(logger, app);

  await handle404(logger, app);
};

module.exports = {
  setHandlers
};
