const { handleLatest } = require('./latest');
const { handleSettingUpdate } = require('./setting-update');
const {
  handleSymbolUpdateLastBuyPrice
} = require('./symbol-update-last-buy-price');
const { handleSymbolSettingUpdate } = require('./symbol-setting-update');
const { handleSymbolSettingDelete } = require('./symbol-setting-delete');
const { handleSymbolEnableAction } = require('./symbol-enable-action');
const { handleExchangeSymbolsGet } = require('./exchange-symbols-get');

module.exports = {
  handleLatest,
  handleSettingUpdate,
  handleSymbolUpdateLastBuyPrice,
  handleSymbolSettingUpdate,
  handleSymbolSettingDelete,
  handleSymbolEnableAction,
  handleExchangeSymbolsGet
};
