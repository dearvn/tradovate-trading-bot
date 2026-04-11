const { cache } = require('../../../../helpers');

const handleHealthz = async (_logger, app) => {
  app.get('/api/healthz', async (_req, res) => {
    let redisOk = false;
    try {
      await cache.redis.ping();
      redisOk = true;
    } catch (_e) {
      // redis unreachable
    }

    const status = redisOk ? 'ok' : 'degraded';
    res.status(redisOk ? 200 : 503).json({
      status,
      uptime: Math.floor(process.uptime()),
      redis: redisOk ? 'ok' : 'error',
      timestamp: new Date().toISOString()
    });
  });
};

module.exports = { handleHealthz };
