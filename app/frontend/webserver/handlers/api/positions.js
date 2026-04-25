const { postgres } = require('../../../../helpers');

const handlePositions = async (funcLogger, app) => {
  const logger = funcLogger.child({ endpoint: '/api/positions' });

  // GET /api/positions — list open positions
  app.get('/api/positions', async (_req, res) => {
    try {
      const rows = await postgres.findAll(
        logger,
        'orders',
        { status: 'open' },
        { sort: { entryTime: -1 } }
      );

      const positions = rows.map(row => {
        const data = row.data || {};
        const entryPrice = row.entryPrice || data.entryPrice || 0;
        const currentPrice = row.currentPrice || data.currentPrice || 0;
        const size = row.quantity || data.quantity || 1;
        const unrealizedPnl = row.pnl || data.pnl || 0;
        const unrealizedPnlPercent = entryPrice > 0
          ? (unrealizedPnl / (entryPrice * size)) * 100
          : 0;
        return {
          id: String(row.id),
          symbol: row.symbol,
          side: row.side || data.side || 'long',
          size,
          entryPrice,
          currentPrice,
          unrealizedPnl,
          unrealizedPnlPercent,
          openedAt: (row.entryTime || row.entry_time || new Date()).toISOString
            ? (row.entryTime || row.entry_time || new Date()).toISOString()
            : String(row.entryTime || row.entry_time || new Date())
        };
      });

      res.json(positions);
    } catch (err) {
      logger.error({ err }, 'Failed to list positions');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/positions — close all open positions
  app.delete('/api/positions', async (_req, res) => {
    try {
      await postgres.query(
        logger,
        `UPDATE orders SET status = 'closed', updated_at = NOW() WHERE status = 'open'`
      );
      res.json({ success: true, message: 'All positions closed' });
    } catch (err) {
      logger.error({ err }, 'Failed to close all positions');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/positions/:id — close single position
  app.delete('/api/positions/:id', async (req, res) => {
    const { id } = req.params;
    const positionId = parseInt(id, 10);

    if (!positionId || isNaN(positionId)) {
      return res.status(400).json({ error: 'Invalid position id' });
    }

    try {
      const result = await postgres.query(
        logger,
        `UPDATE orders SET status = 'closed', updated_at = NOW() WHERE id = $1 AND status = 'open' RETURNING id`,
        [positionId]
      );

      if (result.length === 0) {
        return res.status(404).json({ error: 'Position not found or already closed' });
      }

      res.json({ success: true, message: 'Position closed' });
    } catch (err) {
      logger.error({ err }, 'Failed to close position');
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

module.exports = { handlePositions };
