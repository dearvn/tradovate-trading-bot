const {
  verifyAuthenticated
} = require('../../../cronjob/trailingTradeHelper/common');

const { postgres } = require('../../../helpers');

const handleGridTradeLogsGet = async (funcLogger, app) => {
  const logger = funcLogger.child({
    endpoint: '/grid-trade-logs-get'
  });

  app.route('/grid-trade-logs-get').post(async (req, res) => {
    const { authToken, symbol, page: rawPage, limit: rawLimit } = req.body;

    const page = rawPage || 1;
    const limit = rawLimit || 5;

    const isAuthenticated = await verifyAuthenticated(logger, authToken);

    if (isAuthenticated === false) {
      return res.send({
        success: false,
        status: 403,
        message: 'Please authenticate first.',
        data: {
          rows: [],
          stats: {}
        }
      });
    }

    const rows = await postgres.findAll(logger, 'trailing_trade_logs', { symbol }, {
      sort: { loggedAt: -1 },
      skip: (page - 1) * limit,
      limit
    });

    const countResult = await postgres.query(
      logger,
      `SELECT COUNT(*)::INTEGER AS rows FROM trailing_trade_logs WHERE symbol = $1`,
      [symbol]
    );

    const stats = {
      symbol,
      rows: (countResult[0] || { rows: 0 }).rows
    };

    return res.send({
      success: true,
      status: 200,
      message: 'Retrieved grid-trade-logs-get',
      data: {
        rows,
        stats
      }
    });
  });
};

module.exports = { handleGridTradeLogsGet };
