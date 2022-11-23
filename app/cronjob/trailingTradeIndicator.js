const config = require('config');

const {
  getAPILimit
} = require('./trailingTradeHelper/common');

const {
  getGlobalConfiguration,
  getClosedTrades,
  saveDataToCache,
  refreshTokenTradovate
} = require('./trailingTradeIndicator/steps');
const { errorHandlerWrapper } = require('../error-handler');

const execute = async logger => {
  // Retrieve feature toggles
  const featureToggle = config.get('featureToggle');

  // Define sekeleton of data structure
  let data = {
    action: 'not-determined',
    featureToggle,
    globalConfiguration: {},
    symbol: null,
    symbolConfiguration: {},
    symbolInfo: {},
    overrideParams: {},
    //quoteAssetStats: {},
    tradingView: {},
    apiLimit: { start: getAPILimit(logger), end: null }
  };

  await errorHandlerWrapper(logger, 'Trailing Trade Indicator', async () => {
    data = await getGlobalConfiguration(logger, data);
    //data = await getNextSymbol(logger, data);

    //const { symbol } = data;
    /*logger.info(
      { debug: true, symbol },
      '▶ TrailingTradeIndicator: Start process...'
    );*/

    // Check if the symbol is locked, if it is locked, it means the symbol is still trading.
    //if ((await isSymbolLocked(logger, symbol)) === true) {

    /*logger.info(
      { debug: true, symbol },
      '⏯ TrailingTradeIndicator: Skip process as the symbol is currently locked.'
    );*/
    //  return;
    //}

    // Lock symbol for processing
    //await lockSymbol(logger, symbol);

    // eslint-disable-next-line no-restricted-syntax
    for (const { stepName, stepFunc } of [
      /*{
        stepName: 'get-symbol-configuration',
        stepFunc: getSymbolConfiguration
      },*/
      {
        stepName: 'get-closed-trades',
        stepFunc: getClosedTrades
      },
      {
        stepName: 'save-data-to-cache',
        stepFunc: saveDataToCache
      },
      {
        stepName: 'refresh-token-tradovate',
        stepFunc: refreshTokenTradovate
      }
    ]) {
      const stepLogger = logger.child({ stepName, symbol: data.symbol });

      //stepLogger.info({ data }, `Start step - ${stepName}`);

      // eslint-disable-next-line no-await-in-loop
      //if (stepName == 'save-data-to-cache') {
      //console.log("=============================>>>>>>>>>555", data);
      //}
      data = await stepFunc(stepLogger, data);


      //stepLogger.info({ data }, `Finish step - ${stepName}`);
    }


    // Unlock symbol for processing
    // await unlockSymbol(logger, symbol);

    //data.apiLimit.end = getAPILimit(logger);

    /*logger.info(
      { debug: true, symbol },
      '⏹ TrailingTradeIndicator: Finish process (Debug)...'
    );*/

    //logger.info({ symbol, data }, 'TrailingTradeIndicator: Finish process...');
  });
};

module.exports = { execute };
