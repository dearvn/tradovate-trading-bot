const { cache, postgres } = require('../../../../helpers');

const handleDashboard = async (funcLogger, app) => {
  const logger = funcLogger.child({ endpoint: '/api/dashboard/summary' });

  app.get('/api/dashboard/summary', async (_req, res) => {
    try {
      // Account balance from cache (set by the indicator job)
      let accountInfo = null;
      try {
        const raw = await cache.hgetWithoutLock('trailing_trade_common', 'account-info');
        accountInfo = raw ? JSON.parse(raw) : null;
      } catch (_e) {
        // ignore cache errors
      }

      const balance = Array.isArray(accountInfo) && accountInfo.length > 0
        ? (accountInfo[0].balance || 0)
        : 0;

      // Open positions count
      let openCount = 0;
      try {
        openCount = await postgres.count(logger, 'orders', { status: 'open' });
      } catch (_e) {
        // ignore db errors
      }

      // Daily P&L from closed orders today
      let dailyPnl = 0;
      let totalTrades = 0;
      let winRate = 0;
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const pnlRows = await postgres.query(
          logger,
          `SELECT
             COUNT(*)::INTEGER AS total,
             COALESCE(SUM((data->>'pnl')::NUMERIC), 0) AS daily_pnl,
             COALESCE(SUM(CASE WHEN (data->>'pnl')::NUMERIC > 0 THEN 1 ELSE 0 END), 0)::INTEGER AS wins
           FROM orders
           WHERE status = 'closed'
             AND entry_time >= $1`,
          [todayStart]
        );

        if (pnlRows.length > 0) {
          totalTrades = pnlRows[0].total || 0;
          dailyPnl = parseFloat(pnlRows[0].daily_pnl) || 0;
          winRate = totalTrades > 0
            ? Math.round((pnlRows[0].wins / totalTrades) * 100)
            : 0;
        }
      } catch (_e) {
        // ignore db errors
      }

      res.json({
        balance,
        dailyPnl,
        openPositions: openCount,
        totalTrades,
        winRate
      });
    } catch (err) {
      logger.error({ err }, 'Failed to build dashboard summary');
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

module.exports = { handleDashboard };
