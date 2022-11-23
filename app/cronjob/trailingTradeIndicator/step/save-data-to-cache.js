const { cache } = require('../../../helpers');

/**
 * Save data to cache
 *
 * @param {*} _logger
 * @param {*} rawData
 */
const execute = async (_logger, rawData) => {
  const data = rawData;

  const { symbolInfo, closedTrades } = data;

  //const { quoteAsset } = symbolInfo;

  //console.log("===========2222closedTrades", symbolInfo.symbol, closedTrades);
  cache.hset(
    'trailing-trade-closed-trades',
    symbolInfo.symbol,
    JSON.stringify(closedTrades)
  );

  return data;
};

module.exports = { execute };
