const { postgres } = require('../../../../helpers');

const handleLogs = async (funcLogger, app) => {
  const logger = funcLogger.child({ endpoint: '/api/logs' });

  // GET /api/logs?limit=500&symbol=
  app.get('/api/logs', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 500, 1000);
      const symbol = req.query.symbol ? String(req.query.symbol).trim() : null;

      const filter = symbol ? { symbol } : {};

      const rows = await postgres.findAll(logger, 'trailing_trade_logs', filter, {
        sort: { loggedAt: -1 },
        limit
      });

      const logs = rows.map(row => {
        const data = row.data || {};
        return {
          id: String(row.id),
          symbol: row.symbol,
          msg: row.msg,
          level: data.level || 'info',
          loggedAt: row.loggedAt || row.logged_at,
          context: data.context || null
        };
      });

      res.json({ logs });
    } catch (err) {
      logger.error({ err }, 'Failed to list logs');
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

module.exports = { handleLogs };
