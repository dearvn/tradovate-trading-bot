const _ = require('lodash');
const { version } = require('../../../../package.json');

const { tradovate, cache } = require('../../../helpers');
const {
  getConfiguration
} = require('../../../cronjob/trailingTradeHelper/configuration');


const {
  isActionDisabled,
  getCacheTrailingTradeSymbols,
  getCacheOpenTrades,
  getAccountInfoFromAPI,
  getCacheTrailingTradeQuoteEstimates
} = require('../../../cronjob/trailingTradeHelper/common');

const handleLatest = async (logger, ws, payload) => {
  const globalConfiguration = await getConfiguration(logger);
  // logger.info({ globalConfiguration }, 'Configuration from MongoDB');

  const { sortByDesc, sortBy, searchKeyword, page } = payload.data;

  // If not authenticated and lock list is enabled, then do not send any information.
  if (
    payload.isAuthenticated === false &&
    globalConfiguration.botOptions.authentication.lockList === true
  ) {
    ws.send(
      JSON.stringify({
        result: true,
        type: 'latest',
        isAuthenticated: payload.isAuthenticated,
        botOptions: globalConfiguration.botOptions,
        configuration: {},
        common: {},
        closedTradesSetting: {},
        closedTrades: [],
        stats: {}
      })
    );

    return;
  }

  const cacheTrailingTradeCommon = await cache.hgetall(
    'trailing_trade_common:',
    'trailing_trade_common:*'
  );
  const cacheTradingView = await cache.hgetall(
    'trailing-trade-tradingview:',
    'trailing-trade-tradingview:*'
  );

  const symbolsPerPage = 12;

  const symbolsCount = globalConfiguration.symbols.length;
  const totalPages = _.ceil(symbolsCount / symbolsPerPage);

  /*const cacheTrailingTradeSymbols = await getCacheTrailingTradeSymbols(
    logger,
    sortByDesc,
    sortBy,
    page,
    symbolsPerPage,
    searchKeyword
  );*/

  // Calculate total profit/loss
  const cacheOpenTrades =
    await getCacheOpenTrades(logger);

  const cacheClosedTrades = _.map(
    await cache.hgetall(
      'trailing-trade-closed-trades:',
      'trailing-trade-closed-trades:*'
    ),
    stats => JSON.parse(stats)
  );

  //console.log("==========cacheClosedTrades33335555", cacheClosedTrades)

  const streamsCount = await cache.hgetWithoutLock(
    'trailing-trade-streams',
    'count'
  );

  const stats = {};/*
    symbols: await Promise.all(


      _.map(cacheTrailingTradeSymbols, async symbol => {
        const newSymbol = { ...symbol };
        //console.log("===============newSymbol2", newSymbol);
        try {
          newSymbol.tradingView = JSON.parse(
            cacheTradingView[newSymbol.symbol]
          );
        } catch (e) {
          _.unset(newSymbol, 'tradingView');
        }

        // Retrieve action disabled
        newSymbol.isActionDisabled = await isActionDisabled(newSymbol.symbol);

        //console.log("===============newSymbol", newSymbol);
        return newSymbol;
      })
    )
  };*/

  /*const cacheTrailingTradeQuoteEstimates =
    await getCacheTrailingTradeQuoteEstimates(logger);
  const quoteEstimatesGroupedByBaseAsset = _.groupBy(
    cacheTrailingTradeQuoteEstimates,
    'baseAsset'
  );*/

  let common = {};
  try {

    var accountInfo = JSON.parse(await cache.hgetWithoutLock('trailing_trade_common', 'account-info')) || [];
    if (!accountInfo || !accountInfo.length) {

      accountInfo = await getAccountInfoFromAPI();
      console.log("======================accountInfo23:", accountInfo);

    }


    //cacheTrailingTradeCommon['account-info'] ? JSON.parse(cacheTrailingTradeCommon['account-info']) : {};
    //accountInfo.balances = {};

    /*accountInfo.balances.map(balance => {
      const quoteEstimate = {
        quote: null,
        estimate: null,
        tickSize: null
      };
  
      if (quoteEstimatesGroupedByBaseAsset[balance.asset]) {
        quoteEstimate.quote =
          quoteEstimatesGroupedByBaseAsset[balance.asset][0].quoteAsset;
        quoteEstimate.estimate =
          quoteEstimatesGroupedByBaseAsset[balance.asset][0].estimatedValue;
        quoteEstimate.tickSize =
          quoteEstimatesGroupedByBaseAsset[balance.asset][0].tickSize;
      }
  
      return {
        ...balance,
        ...quoteEstimate
      };
    });*/

    common = {
      version,
      gitHash: process.env.GIT_HASH || 'unspecified',
      accountInfo,
      apiInfo: {},//binance.client.getInfo(),
      closedTradesSetting: JSON.parse(
        cacheTrailingTradeCommon['closed-trades'] || '{}'
      ),
      orderStats: {
        numberOfOpenTrades: parseInt(
          cacheTrailingTradeCommon['number-of-open-trades'],
          10
        ),
        numberOfBuyOpenOrders: parseInt(
          cacheTrailingTradeCommon['number-of-buy-open-orders'],
          10
        )
      },
      closedTrades: cacheClosedTrades,
      openTrades: cacheOpenTrades,
      streamsCount,
      symbolsCount,
      totalPages
    };
  } catch (err) {
    logger.error({ err }, 'Something wrong with trailing_trade_common cache');
    return;
  }

  logger.info(
    {
      account: common.accountInfo,
      publicURL: common.publicURL,
      stats,
      configuration: globalConfiguration
    },
    'stats'
  );

  ws.send(
    JSON.stringify({
      result: true,
      type: 'latest',
      isAuthenticated: payload.isAuthenticated,
      botOptions: globalConfiguration.botOptions,
      configuration: globalConfiguration,
      common,
      stats
    })
  );
};

module.exports = { handleLatest };
