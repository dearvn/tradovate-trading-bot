const { cache } = require('../../../../helpers');

const handleBars = async (funcLogger, app) => {
  const logger = funcLogger.child({ endpoint: '/api/bars' });

  app.get('/api/bars', async (req, res) => {
    try {
      const symbol = (req.query.symbol || 'ES').toUpperCase();
      const raw = await cache.getWithoutLock(`chart:bars:${symbol}`);
      if (!raw) {
        return res.json([]);
      }
      const bars = JSON.parse(raw);
      res.json(bars);
    } catch (err) {
      logger.error({ err }, 'Failed to fetch bars');
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

module.exports = { handleBars };
