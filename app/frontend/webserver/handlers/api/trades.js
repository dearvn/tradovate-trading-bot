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
        const entryPrice = row.entryPrice || data.entryPrice || 0;
        const size = row.quantity || data.quantity || 1;
        const realizedPnl = row.pnl || data.pnl || 0;
        const realizedPnlPercent = entryPrice > 0
          ? (realizedPnl / (entryPrice * size)) * 100
          : 0;
        const openedAt = row.entryTime || row.entry_time || new Date();
        const closedAt = row.exitTime || row.exit_time || data.exitTime || new Date();
        return {
          id: String(row.id),
          symbol: row.symbol,
          side: row.side || data.side || 'long',
          size,
          entryPrice,
          exitPrice: row.exitPrice || data.exitPrice || 0,
          realizedPnl,
          realizedPnlPercent,
          openedAt: openedAt.toISOString ? openedAt.toISOString() : String(openedAt),
          closedAt: closedAt.toISOString ? closedAt.toISOString() : String(closedAt)
        };
      });

      res.json(trades);
    } catch (err) {
      logger.error({ err }, 'Failed to list trades');
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

module.exports = { handleTrades };
