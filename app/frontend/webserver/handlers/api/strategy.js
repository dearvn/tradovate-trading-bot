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
      const rows = await postgres.query(
        logger,
        `SELECT
           COUNT(*)::INTEGER AS total_trades,
           COALESCE(SUM(CASE WHEN (data->>'pnl')::NUMERIC > 0 THEN 1 ELSE 0 END), 0)::INTEGER AS winning_trades,
           COALESCE(SUM(CASE WHEN (data->>'pnl')::NUMERIC <= 0 THEN 1 ELSE 0 END), 0)::INTEGER AS losing_trades,
           COALESCE(AVG(CASE WHEN (data->>'pnl')::NUMERIC > 0 THEN (data->>'pnl')::NUMERIC END), 0) AS avg_win,
           COALESCE(ABS(AVG(CASE WHEN (data->>'pnl')::NUMERIC <= 0 THEN (data->>'pnl')::NUMERIC END)), 0) AS avg_loss,
           COALESCE(MAX((data->>'pnl')::NUMERIC), 0) AS max_win,
           COALESCE(MIN((data->>'pnl')::NUMERIC), 0) AS max_loss,
           COALESCE(SUM(CASE WHEN (data->>'pnl')::NUMERIC > 0 THEN (data->>'pnl')::NUMERIC ELSE 0 END), 0) AS gross_profit,
           COALESCE(ABS(SUM(CASE WHEN (data->>'pnl')::NUMERIC <= 0 THEN (data->>'pnl')::NUMERIC ELSE 0 END)), 0) AS gross_loss
         FROM orders
         WHERE status = 'closed'`
      );

      const r = rows[0] || {};
      const totalTrades = r.total_trades || 0;
      const winningTrades = r.winning_trades || 0;
      const losingTrades = r.losing_trades || 0;
      const avgWin = parseFloat(r.avg_win) || 0;
      const avgLoss = parseFloat(r.avg_loss) || 0;
      const grossProfit = parseFloat(r.gross_profit) || 0;
      const grossLoss = parseFloat(r.gross_loss) || 0;

      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
      const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 999 : 0;
      // Simplified Sharpe: (winRate/100 * avgWin - (1-winRate/100) * avgLoss) / (avgLoss || 1)
      const expectancy = (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss;
      const sharpeRatio = avgLoss > 0 ? expectancy / avgLoss : 0;

      res.json({
        winRate,
        currentDrawdown: 0,
        maxDrawdown: 0,
        totalTrades,
        winningTrades,
        losingTrades,
        riskRewardRatio,
        avgWin,
        avgLoss,
        profitFactor,
        sharpeRatio
      });
    } catch (err) {
      logger.error({ err }, 'Failed to get strategy performance');
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

module.exports = { handleStrategy };
