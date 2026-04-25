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
        const rawLevel = data.level || row.level || 'info';
        // Normalize level to severity enum: info | warning | error
        const severity = rawLevel === 'warn' || rawLevel === 'warning' ? 'warning'
          : rawLevel === 'error' || rawLevel === 'fatal' ? 'error'
          : 'info';
        const ts = row.loggedAt || row.logged_at || new Date();
        return {
          id: String(row.id),
          timestamp: ts.toISOString ? ts.toISOString() : String(ts),
          severity,
          message: row.msg || data.msg || '',
          context: data.context || null
        };
      });

      res.json(logs);
    } catch (err) {
      logger.error({ err }, 'Failed to list logs');
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

module.exports = { handleLogs };
