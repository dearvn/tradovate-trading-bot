const config = require('config');
const { postgres } = require('../../../../helpers');

const STRATEGY_KEY = 'api-strategy';

// Derive default strategy from bot config
const getDefaultStrategy = () => {
  const trailingTrade = config.get('jobs.trailingTrade');
  const symbols = config.get('symbols');
  const instruments = Array.isArray(symbols)
    ? symbols.map(s => s.symbol)
    : [];

  const buyGrid = trailingTrade.buy.gridTrade[0] || {};
  const sellGrid = trailingTrade.sell.gridTrade[0] || {};

  return {
    name: config.get('appName') || 'Tradovate Bot',
    enabled: trailingTrade.enabled !== false,
    maxPositions: trailingTrade.botOptions.orderLimit.maxOpenTrades || 5,
    riskPerTrade: buyGrid.stoploss || 3.5,
    stopLossPercent: buyGrid.stoploss || 3.5,
    takeProfitPercent: buyGrid.pointin || 3.5,
    tradingHoursStart: '09:30',
    tradingHoursEnd: '16:00',
    instruments
  };
};

const handleStrategy = async (funcLogger, app) => {
  const logger = funcLogger.child({ endpoint: '/api/strategy' });

  // GET /api/strategy
  app.get('/api/strategy', async (_req, res) => {
    try {
      // Check for a saved override in postgres
      let saved = null;
      try {
        saved = await postgres.findOne(logger, 'trailing_trade_common', { key: STRATEGY_KEY });
      } catch (_e) {
        // table may not have this key yet
      }

      const strategy = saved && saved.name
        ? saved
        : getDefaultStrategy();

      res.json(strategy);
    } catch (err) {
      logger.error({ err }, 'Failed to get strategy');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/strategy
  app.put('/api/strategy', async (req, res) => {
    try {
      const {
        name,
        enabled,
        maxPositions,
        riskPerTrade,
        stopLossPercent,
        takeProfitPercent,
        tradingHoursStart,
        tradingHoursEnd,
        instruments
      } = req.body;

      // Basic validation
      if (typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: 'name is required' });
      }

      const strategy = {
        key: STRATEGY_KEY,
        name: name.trim(),
        enabled: Boolean(enabled),
        maxPositions: parseInt(maxPositions, 10) || 5,
        riskPerTrade: parseFloat(riskPerTrade) || 3.5,
        stopLossPercent: parseFloat(stopLossPercent) || 3.5,
        takeProfitPercent: parseFloat(takeProfitPercent) || 3.5,
        tradingHoursStart: tradingHoursStart || '09:30',
        tradingHoursEnd: tradingHoursEnd || '16:00',
        instruments: Array.isArray(instruments) ? instruments : []
      };

      await postgres.upsertOne(
        logger,
        'trailing_trade_common',
        { key: STRATEGY_KEY },
        strategy
      );

      res.json(strategy);
    } catch (err) {
      logger.error({ err }, 'Failed to update strategy');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/strategy/performance
  app.get('/api/strategy/performance', async (_req, res) => {
    try {
      // Daily aggregated P&L for the last 7 days
      const rows = await postgres.query(
        logger,
        `SELECT
           DATE(entry_time) AS day,
           COALESCE(SUM((data->>'pnl')::NUMERIC), 0) AS pnl,
           COUNT(*)::INTEGER AS trades,
           COALESCE(SUM(CASE WHEN (data->>'pnl')::NUMERIC > 0 THEN 1 ELSE 0 END), 0)::INTEGER AS wins
         FROM orders
         WHERE status = 'closed'
           AND entry_time >= NOW() - INTERVAL '7 days'
         GROUP BY DATE(entry_time)
         ORDER BY day ASC`
      );

      const performance = rows.map(r => ({
        date: r.day,
        pnl: parseFloat(r.pnl) || 0,
        trades: r.trades || 0,
        winRate: r.trades > 0 ? Math.round((r.wins / r.trades) * 100) : 0
      }));

      res.json({ performance });
    } catch (err) {
      logger.error({ err }, 'Failed to get strategy performance');
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

module.exports = { handleStrategy };
