const { postgres } = require('../../../../helpers');

const handleTrades = async (funcLogger, app) => {
  const logger = funcLogger.child({ endpoint: '/api/trades' });

  // GET /api/trades?limit=20&offset=0&symbol=
  app.get('/api/trades', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
      const offset = parseInt(req.query.offset, 10) || 0;
      const symbol = req.query.symbol ? String(req.query.symbol).trim() : null;

      const filter = { status: 'closed' };
      if (symbol) filter.symbol = symbol;

      const [rows, totalRows] = await Promise.all([
        postgres.findAll(logger, 'orders', filter, {
          sort: { entryTime: -1 },
          limit,
          skip: offset
        }),
        postgres.query(
          logger,
          symbol
            ? `SELECT COUNT(*)::INTEGER AS cnt FROM orders WHERE status = 'closed' AND symbol = $1`
            : `SELECT COUNT(*)::INTEGER AS cnt FROM orders WHERE status = 'closed'`,
          symbol ? [symbol] : []
        )
      ]);

      const trades = rows.map(row => {
        const data = row.data || {};
        return {
          id: String(row.id),
          symbol: row.symbol,
          side: row.side || data.side || 'long',
          quantity: row.quantity || data.quantity || 1,
          entryPrice: row.entryPrice || data.entryPrice || 0,
          exitPrice: row.exitPrice || data.exitPrice || 0,
          pnl: row.pnl || data.pnl || 0,
          entryTime: row.entryTime || row.entry_time,
          exitTime: row.exitTime || row.exit_time || data.exitTime || null,
          status: row.status
        };
      });

      const total = (totalRows[0] || {}).cnt || 0;

      res.json({ trades, total, limit, offset });
    } catch (err) {
      logger.error({ err }, 'Failed to list trades');
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

module.exports = { handleTrades };
