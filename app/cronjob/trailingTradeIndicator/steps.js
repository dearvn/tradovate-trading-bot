const { execute: getNextSymbol } = require('./step/get-next-symbol');
const {
  execute: getGlobalConfiguration
} = require('./step/get-global-configuration');
const {
  execute: getSymbolConfiguration
} = require('./step/get-symbol-configuration');
const { execute: getOpenOrders } = require('./step/get-open-orders');
const { execute: getClosedTrades } = require('./step/get-closed-trades');
const { execute: saveDataToCache } = require('./step/save-data-to-cache');
const { execute: refreshTokenTradovate } = require('./step/refresh-token-tradovate');

module.exports = {
  getGlobalConfiguration,
  getOpenOrders,
  getClosedTrades,
  saveDataToCache,
  refreshTokenTradovate
};
