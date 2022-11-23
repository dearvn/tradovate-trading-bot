const {
  removeOverrideDataForSymbol,
  verifyAuthenticated
} = require('../../../cronjob/trailingTradeHelper/common');
const { mongo, cache, PubSub } = require('../../../helpers');

const handleSymbolDelete = async (funcLogger, app) => {
  const logger = funcLogger.child({
    method: 'DELETE',
    endpoint: '/symbol'
  });

  app.route('/symbol/:symbol').delete(async (req, res) => {
    const { symbol } = req.params;

    const { authToken } = req.body;

    const isAuthenticated = await verifyAuthenticated(logger, authToken);

    if (isAuthenticated === false) {
      //logger.info('Not authenticated');
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

    // Delete symbols
    await Promise.all(
      Object.keys(
        await cache.hgetall(
          'trailing_trade_symbols:',
          `trailing_trade_symbols:${symbol}*`
        )
      ).map(key => cache.hdel('trailing_trade_symbols', key))
    );

    // Delete tradingview
    await cache.hdel('trailing-trade-tradingview', symbol);

    // Delete last buy price
    [`${symbol}-last-buy-price`].forEach(async key => {
      await mongo.deleteOne(logger, 'trailing_trade_symbols', { key });
    });

    // Delete trade cache
    await mongo.deleteOne(logger, 'trailing_trade_cache', { symbol });

    // Remove override data
    await removeOverrideDataForSymbol(logger, symbol);

    PubSub.publish('frontend-notification', {
      type: 'info',
      title: `${symbol} cache has been deleted successfully.`
    });

    return res.send({
      success: true,
      status: 200,
      message: 'Executed symbol-delete',
      data: {
        result: true
      }
    });
  });
};

module.exports = { handleSymbolDelete };
