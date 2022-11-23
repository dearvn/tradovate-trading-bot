const { saveOrderStats } = require('../../trailingTradeHelper/common');

/**
 * Get order stats
 *
 * @param {*} logger
 * @param {*} rawData
 */
const execute = async (logger, rawData) => {
  const data = rawData;

  const {
    globalConfiguration: { symbols }
  } = rawData;


  return data;
};

module.exports = { execute };
