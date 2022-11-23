const config = require('config');
const jwt = require('jsonwebtoken');
const _ = require('lodash');
//const TradingView = require('@mathieuc/tradingview');

const { cache, mongo, PubSub, slack, tradovate } = require('../../helpers');


const getCachedExchangeInfo = async logger => {
  const cachedExchangeInfo =
    JSON.parse(await cache.hget('trailing_trade_common', 'exchange-info')) ||
    {};

  let exchangeInfo = cachedExchangeInfo;
  if (_.isEmpty(cachedExchangeInfo) === true) {
    /*logger.info(
      { function: 'exchangeInfo' },
      'Retrieving exchange info from API'
    );*/

    exchangeInfo = config.get('symbols');//await binance.client.exchangeInfo();

    await cache.hset(
      'trailing_trade_common',
      'exchange-info',
      JSON.stringify(exchangeInfo),
      3600
    );
  }

  return exchangeInfo;
};

const quote = async (symbol, items) => {

  items.forEach(item => {


    console.log("==================price", item.entries.SettlementPrice.price);
  });

}

const rep_user = async (item) => {


  console.log("==================syncrequest2222", item);

  if (item.users) {
    //this is the initial response. You will get any of these fields in the response
    const {
      accountRiskStatuses,
      accounts,
      cashBalances,
      commandReports,
      commands,
      contractGroups,
      contractMaturities,
      contracts,
      currencies,
      exchanges,
      executionReports,
      fillPairs,
      fills,
      marginSnapshots,
      orderStrategies,
      orderStrategyLinks,
      orderStrategyTypes,
      orderVersions,
      orders,
      positions,
      products,
      properties,
      spreadDefinitions,
      userAccountAutoLiqs,
      userPlugins,
      userProperties,
      userReadStatuses,
      users
    } = item



    console.log(`==================initial response:\n${JSON.stringify(item, null, 2)}`)
  } else {
    //otherwise this is a user data event, they look like this
    const { entityType, entity, eventType } = item
    console.log(`update event:\n${JSON.stringify(item, null, 2)}`)
  }
}

/**
 * Retrieve account information from API and filter balances
 *
 * @param {*} logger
 */
const getAccountInfoFromAPI = async logger => {
  //logger.info({ tag: 'get-account-info' }, 'Retrieving account info from API');

  //console.log("==================subscribechart");

  //await (await tradovate.client.ws).syncrequest(rep_user);

  //await (await tradovate.client.ws).subscribequote('MNQZ1', quote);


  //await (await tradovate.client.ws).subscribechart(bar_chart, 'ESZ1', 5);

  const accountInfo = []; //await (await tradovate.client.http).accountList();
  const cashBalances = [];//await (await tradovate.client.http).cashBalanceList();

  const cashBalance = cashBalances.reduce(function (acc, b) {
    acc[b.accountId] = b.amount;
    return acc;
  }, {});

  accountInfo.reduce((acc, b) => {
    const balance = cashBalance[b.id];
    b['balance'] = balance
    return b;
  }, []);

  console.log("============accountInfo", accountInfo)

  /*logger.info(
    { tag: 'get-account-info', accountInfo },
    'Retrieved account information from API'
  );*/

  await cache.hset(
    'trailing_trade_common',
    'account-info',
    JSON.stringify(accountInfo)
  );

  return accountInfo;
};

/**
 * Retrieve account info from cache
 *  If empty, retrieve from API
 *
 * @param {*} logger
 */
const getAccountInfo = async logger => {
  const accountInfo =
    JSON.parse(
      await cache.hgetWithoutLock('trailing_trade_common', 'account-info')
    ) || {};

  if (_.isEmpty(accountInfo) === false) {
    /*logger.info(
      { tag: 'get-account-info', accountInfo },
      'Retrieved account info from cache'
    );*/
    return accountInfo;
  }

  /*logger.info(
    { tag: 'get-account-info' },
    'Could not parse account information from cache, get from api'
  );*/
  console.log("==============getAccountInfoFromAPI10");
  return getAccountInfoFromAPI(logger);
};

/**
 * Get open orders
 *
 * @param {*} logger
 */
const getOpenOrdersFromAPI = async logger => {
  //logger.info({ function: 'openOrders' }, 'Retrieving open orders from API');


  const openOrders = mongo.findAll(logger, 'orders', { 'status': 'open' }, { "sort": [['entry_time', 'desc']] });//await (await tradovate.client.http).orderList();

  //console.log(">>>>>>>>>>>>openOrders2222", openOrders);

  //logger.info({ openOrders }, 'Retrieved open orders from API');

  return openOrders;
};

/**
 * Get open orders
 *
 * @param {*} logger
 * @param {*} symbol
 */
const getOpenOrdersBySymbolFromAPI = async (logger, symbol) => {
  /*logger.info(
    { function: 'openOrders' },
    'Retrieving open orders by symbol from API'
  );*/
  console.log(">>>>>>>>>>>>openOrders33333", openOrders);
  const openOrders = {};//await (await tradovate.client.http).orderList();

  //logger.info({ openOrders }, 'Retrieved open orders by symbol from API');

  return openOrders;
};

/**
 * Refresh open orders for symbol open orders
 *  Get cached open orders and merge with symbol open orders
 *  This is necessary step to cover 2 seconds gap.
 *  The open orders cache will be refreshed with indicator job.
 *
 * @param {*} logger
 * @param {*} symbol
 */
const getAndCacheOpenOrdersForSymbol = async (logger, symbol) => {
  // Retrieve open orders from API first
  console.log("============getAndCacheOpenOrdersForSymbol:", symbol)
  const symbolOpenOrders = await getOpenOrdersBySymbolFromAPI(logger, symbol);

  /*logger.info(
    {
      symbol,
      symbolOpenOrders
    },
    'Open orders from API'
  );*/

  await cache.hset(
    'trailing-trade-open-orders',
    symbol,
    JSON.stringify(symbolOpenOrders)
  );

  return symbolOpenOrders;
};

/**
 * Get last buy price from mongodb
 *
 * @param {*} logger
 * @param {*} symbol
 */
const getLastBuyPrice = async (logger, symbol) =>
  mongo.findOne(logger, 'trailing_trade_symbols', {
    key: `${symbol} - last - buy - price`
  });

/**
 * Save last buy price to mongodb
 *
 * @param {*} logger
 * @param {*} symbol
 * @param {*} param2
 */
const saveLastBuyPrice = async (logger, symbol, { lastBuyPrice, quantity }) => {
  /*logger.info(
    { lastBuyPrice, quantity, saveLog: true },
    'The last buy price has been saved.'
  );*/
  const result = await mongo.upsertOne(
    logger,
    'trailing_trade_symbols',
    { key: `${symbol} - last - buy - price` },
    {
      key: `${symbol} - last - buy - price`,
      lastBuyPrice,
      quantity
    }
  );

  // Refresh configuration
  await cache.hdel('trailing-trade-configurations', symbol);

  return result;
};

const removeLastBuyPrice = async (logger, symbol) => {
  //logger.info({ saveLog: true }, 'The last buy price has been removed.');

  const result = await mongo.deleteOne(logger, 'trailing_trade_symbols', {
    key: `${symbol} - last - buy - price`
  });

  // Refresh configuration
  await cache.hdel('trailing-trade-configurations', symbol);

  return result;
};

/**
 * Lock symbol
 *
 * @param {*} logger
 * @param {*} symbol
 * @param {*} ttl
 *
 * @returns
 */
const lockSymbol = async (logger, symbol, ttl = 5) => {
  //logger.info({ symbol }, `Lock ${ symbol } for ${ ttl } seconds`);
  return cache.hset('bot-lock', symbol, true, ttl);
};

/**
 * Check if symbol is locked
 *
 * @param {*} logger
 * @param {*} symbol
 * @returns
 */
const isSymbolLocked = async (logger, symbol) => {
  const isLocked = (await cache.hget('bot-lock', symbol)) === 'true';

  /*if (isLocked === true) {
    logger.info({ symbol, isLocked }, `🔒 Symbol is locked - ${ symbol } `);
  } else {
    logger.info({ symbol, isLocked }, `🔓 Symbol is not locked - ${ symbol } `);
  }*/
  return isLocked;
};

/**
 * Unlock symbol
 *
 * @param {*} logger
 * @param {*} symbol
 * @returns
 */
const unlockSymbol = async (logger, symbol) => {
  //logger.info({ symbol }, `Unlock ${ symbol } `);
  return cache.hdel('bot-lock', symbol);
};

/**
 * Disable action
 *
 * @param {*} logger
 * @param {*} symbol
 * @param {*} reason
 * @param {*} ttl
 *
 * @returns
 */
const disableAction = async (logger, symbol, reason, ttl) => {
  /*logger.info(
    { reason, ttl, saveLog: true },
    `The action is disabled.Reason: ${ _.get(reason, 'message', 'Unknown') } `
  );*/
  return cache.set(`${symbol} -disable - action`, JSON.stringify(reason), ttl);
};

/**
 * Check if the action is disabled.
 *
 * @param {*} symbol
 * @returns
 */
const isActionDisabled = async symbol => {
  const result = await cache.getWithTTL(`${symbol} -disable - action`);

  if (result === null) {
    return { isDisabled: false, ttl: -2 };
  }

  const ttl = result[0][1];
  const reason = JSON.parse(result[1][1]) || {};

  return { isDisabled: ttl > 0, ttl, ...reason };
};

/**
 * Re-enable action stopped by stop loss
 *
 * @param {*} logger
 * @param {*} symbol
 * @returns
 */
const deleteDisableAction = async (logger, symbol) => {
  //logger.info({ saveLog: true }, `The action is enabled.`);
  return cache.del(`${symbol} -disable - action`);
};

/**
 * Get API limit
 *
 * @param {*} logger
 * @returns
 */
const getAPILimit = logger => {
  const apiInfo = {};//binance.client.getInfo();
  //logger.info({ apiInfo }, 'API info');

  return parseInt(apiInfo.spot?.usedWeight1m || 0, 10);
};

/**
 * Check if API limit is over
 *
 * @param {*} logger
 * @returns
 */
const isExceedAPILimit = logger => {
  const usedWeight1m = getAPILimit(logger);
  return usedWeight1m > 1180;
};

/**
 * Get override data for Symbol
 *
 * @param {*} _logger
 * @param {*} symbol
 * @returns
 */
const getOverrideDataForSymbol = async (_logger, symbol) => {
  const overrideData = await cache.hget('trailing-trade-override', symbol);
  if (!overrideData) {
    return null;
  }

  return JSON.parse(overrideData);
};

/**
 * Remove override data for Symbol
 *
 * @param {*} logger
 * @param {*} symbol
 * @returns
 */
const removeOverrideDataForSymbol = async (logger, symbol) => {
  //logger.info({ saveLog: true }, 'The override data is removed.');

  return cache.hdel('trailing-trade-override', symbol);
};

/**
 * Get override data for Indicator
 *
 * @param {*} _logger
 * @param {*} key
 * @returns
 */
const getOverrideDataForIndicator = async (_logger, key) => {
  const overrideData = await cache.hget(
    'trailing-trade-indicator-override',
    key
  );
  if (!overrideData) {
    return null;
  }

  return JSON.parse(overrideData);
};

/**
 * Remove override data for Indicator
 *
 * @param {*} _logger
 * @param {*} key
 * @returns
 */
const removeOverrideDataForIndicator = async (_logger, key) =>
  cache.hdel('trailing-trade-indicator-override', key);

/**
 * Retrieve last buy price and recalculate new last buy price
 *
 * @param {*} logger
 * @param {*} symbol
 * @param {*} order
 */
const calculateLastBuyPrice = async (logger, symbol, order) => {
  const { type, executedQty, cummulativeQuoteQty } = order;
  const lastBuyPriceDoc = await getLastBuyPrice(logger, symbol);

  const orgLastBuyPrice = _.get(lastBuyPriceDoc, 'lastBuyPrice', 0);
  const orgQuantity = _.get(lastBuyPriceDoc, 'quantity', 0);
  const orgTotalAmount = orgLastBuyPrice * orgQuantity;

  /*logger.info(
    { orgLastBuyPrice, orgQuantity, orgTotalAmount },
    'Existing last buy price'
  );*/

  const filledQuoteQty = parseFloat(cummulativeQuoteQty);
  const filledQuantity = parseFloat(executedQty);

  const newQuantity = orgQuantity + filledQuantity;
  const newTotalAmount = orgTotalAmount + filledQuoteQty;

  const newLastBuyPrice = newTotalAmount / newQuantity;

  /*logger.info(
    { newLastBuyPrice, newTotalAmount, newQuantity, saveLog: true },
    `The last buy price will be saved.New last buy price: ${ newLastBuyPrice } `
  );*/
  await saveLastBuyPrice(logger, symbol, {
    lastBuyPrice: newLastBuyPrice,
    quantity: newQuantity
  });

  PubSub.publish('frontend-notification', {
    type: 'success',
    title: `New last buy price for ${symbol} has been updated.`
  });

  slack.sendMessage(
    `* ${symbol}* Last buy price Updated: * ${type}*\n` +
    `- Order Result: \`\`\`${JSON.stringify(
      {
        orgLastBuyPrice,
        orgQuantity,
        orgTotalAmount,
        newLastBuyPrice,
        newQuantity,
        newTotalAmount
      },
      undefined,
      2
    )}\`\`\``,
    { symbol, apiLimit: getAPILimit(logger) }
  );
};

/**
 * Get symbol information
 *
 * @param {*} logger
 * @param {*} symbol
 */
const getSymbolInfo = async (logger, symbol) => {
  const cachedSymbolInfo =
    JSON.parse(
      await cache.hget('trailing_trade_symbols', `${symbol}-symbol-info`)
    ) || {};

  if (_.isEmpty(cachedSymbolInfo) === false) {
    //logger.info({ cachedSymbolInfo }, 'Retrieved symbol info from the cache.');
    return cachedSymbolInfo;
  }

  const exchangeInfo = await getCachedExchangeInfo(logger);

  //logger.info({}, 'Retrieved exchange info.', exchangeInfo);
  const symbolInfo = _.filter(
    exchangeInfo,
    s => s.symbol === symbol
  )[0];

  //logger.info({ symbolInfo }, 'Retrieved symbol info from Tradovate.');

  const finalSymbolInfo = _.pick(symbolInfo, [
    'symbol',
    'status',
  ]);

  await cache.hset(
    'trailing_trade_symbols',
    `${symbol}-symbol-info`,
    JSON.stringify(finalSymbolInfo),
    3600
  );

  return finalSymbolInfo;
};

/**
 * Verify authentication
 *
 * @param {*} funcLogger
 * @param {*} authToken
 * @returns
 */
const verifyAuthenticated = async (funcLogger, authToken) => {
  const logger = funcLogger.child({ tag: 'verifyAuthenticated' });

  const authenticationEnabled = config.get('authentication.enabled');
  if (authenticationEnabled === false) {
    //logger.info('Authentication is not enabled.');
    return true;
  }

  const jwtSecret = await cache.get('auth-jwt-secret');

  //logger.info({ authToken, jwtSecret }, 'Verifying authentication');
  let data = null;
  try {
    data = jwt.verify(authToken, jwtSecret, { algorithm: 'HS256' });
  } catch (err) {
    //logger.info({ err }, 'Failed authentication');
    return false;
  }

  //logger.info({ data }, 'Success authentication');
  return true;
};



/**
 * Update account info with new one
 *
 * @param {*} logger
 * @param balances
 * @param lastAccountUpdate
 */
const updateAccountInfo = async (logger, balances, lastAccountUpdate) => {
  //logger.info({ balances }, 'Updating account balances');
  const accountInfo = await getAccountInfo(logger);

  const mergedBalances = _.merge(
    _.keyBy(accountInfo.balances, 'asset'),
    _.keyBy(balances, 'asset')
  );
  accountInfo.balances = _.reduce(
    _.values(mergedBalances),
    (acc, b) => {
      const balance = b;
      if (+balance.free > 0 || +balance.locked > 0) {
        acc.push(balance);
      }

      return acc;
    },
    []
  );

  // set updateTime manually because we are updating account info from websocket
  accountInfo.updateTime = lastAccountUpdate;

  await cache.hset(
    'trailing_trade_common',
    'account-info',
    JSON.stringify(accountInfo)
  );

  return accountInfo;
};

const getCacheTrailingTradeSymbols = async (
  logger,
  sortByDesc,
  sortByParam,
  page,
  symbolsPerPage,
  searchKeyword
) => {
  const match = {};

  if (searchKeyword) {
    match.symbol = {
      $regex: searchKeyword,
      $options: 'i'
    };
  } else {
    match.symbol = {
      $exists: true
    };
  }

  const sortBy = sortByParam || 'default';
  const sortDirection = sortByDesc === true ? -1 : 1;
  const pageNum = _.toNumber(page) >= 1 ? _.toNumber(page) : 1;

  //logger.info({ sortBy, sortDirection }, 'latest');

  let sortField = {
    $cond: {
      if: { $gt: [{ $size: '$buy.openOrders' }, 0] },
      then: {
        $multiply: [
          {
            $add: [
              {
                $let: {
                  vars: {
                    buyOpenOrder: {
                      $arrayElemAt: ['$buy.openOrders', 0]
                    }
                  },
                  in: '$buyOpenOrder.differenceToCancel'
                }
              },
              3000
            ]
          },
          -10
        ]
      },
      else: {
        $cond: {
          if: { $gt: [{ $size: '$sell.openOrders' }, 0] },
          then: {
            $multiply: [
              {
                $add: [
                  {
                    $let: {
                      vars: {
                        sellOpenOrder: {
                          $arrayElemAt: ['$sell.openOrders', 0]
                        }
                      },
                      in: '$sellOpenOrder.differenceToCancel'
                    }
                  },
                  2000
                ]
              },
              -10
            ]
          },
          else: {
            $cond: {
              if: {
                $eq: ['$sell.difference', null]
              },
              then: '$buy.difference',
              else: {
                $multiply: [{ $add: ['$sell.difference', 1000] }, -10]
              }
            }
          }
        }
      }
    }
  };

  if (sortBy === 'buy-difference') {
    sortField = {
      $cond: {
        if: {
          $eq: ['$buy.difference', null]
        },
        then: '$symbol',
        else: '$buy.difference'
      }
    };
  }

  if (sortBy === 'sell-profit') {
    sortField = {
      $cond: {
        if: {
          $eq: ['$sell.currentProfitPercentage', null]
        },
        then: '$symbol',
        else: '$sell.currentProfitPercentage'
      }
    };
  }

  if (sortBy === 'alpha') {
    sortField = '$symbol';
  }

  const trailingTradeCacheQuery = [
    {
      $match: match
    },
    {
      $project: {
        symbol: '$symbol',
        lastCandle: '$lastCandle',
        symbolInfo: '$symbolInfo',
        symbolConfiguration: '$symbolConfiguration',
        baseAssetBalance: '$baseAssetBalance',
        quoteAssetBalance: '$quoteAssetBalance',
        buy: '$buy',
        sell: '$sell',
        tradingView: '$tradingView',
        overrideData: '$overrideData',
        sortField
      }
    },
    { $sort: { sortField: sortDirection } },
    { $skip: (pageNum - 1) * symbolsPerPage },
    { $limit: symbolsPerPage }
  ];

  return mongo.aggregate(
    logger,
    'trailing_trade_cache',
    trailingTradeCacheQuery
  );
};

const getCacheOpenTrades = logger => {
  return mongo.findAll(
    logger,
    'orders',
    { 'status': 'open' }
  );
};
/*mongo.aggregate(logger, 'trailing_trade_cache', [
    {
      $group: {
        _id: '$quoteAssetBalance.asset',
        amount: {
          $sum: {
            $multiply: ['$baseAssetBalance.total', '$sell.lastBuyPrice']
          }
        },
        profit: { $sum: '$sell.currentProfit' },
        estimatedBalance: { $sum: '$baseAssetBalance.estimatedValue' },
        free: { $first: '$quoteAssetBalance.free' },
        locked: { $first: '$quoteAssetBalance.locked' }
      }
    },
    {
      $project: {
        asset: '$_id',
        amount: '$amount',
        profit: '$profit',
        estimatedBalance: '$estimatedBalance',
        free: '$free',
        locked: '$locked'
      }
    }
  ]);*/

const getCacheTrailingTradeQuoteEstimates = logger =>
  mongo.aggregate(logger, 'trailing_trade_cache', [
    {
      $match: {
        'baseAssetBalance.estimatedValue': {
          $gt: 0
        }
      }
    },
    {
      $project: {
        baseAsset: '$symbolInfo.baseAsset',
        quoteAsset: '$symbolInfo.quoteAsset',
        estimatedValue: '$baseAssetBalance.estimatedValue',
        tickSize: '$symbolInfo.filterPrice.tickSize'
      }
    }
  ]);

/**
 * Check whether max number of open trades has reached
 *
 * @param {*} logger
 * @param {*} data
 * @returns
 */
const isExceedingMaxOpenTrades = async (logger, data) => {
  const {
    symbolConfiguration: {
      botOptions: {
        orderLimit: {
          enabled: orderLimitEnabled,
          maxOpenTrades: orderLimitMaxOpenTrades
        }
      }
    },
    sell: { lastBuyPrice }
  } = data;

  if (orderLimitEnabled === false) {
    return false;
  }

  // If the last buy price is recorded, this is one of open trades.
  if (lastBuyPrice) {
    return false;
  }

  return (await getNumberOfOpenTrades(logger)) >= orderLimitMaxOpenTrades;
};

const refreshOpenOrdersAndAccountInfo = async (logger, symbol) => {
  // Get open orders
  const openOrders = await getAndCacheOpenOrdersForSymbol(logger, symbol);

  // Refresh account info
  console.log("==================refreshOpenOrdersAndAccountInfo")
  const accountInfo = await getAccountInfoFromAPI(logger);

  const buyOpenOrders = openOrders.filter(o => o.side.toLowerCase() === 'buy');

  const sellOpenOrders = openOrders.filter(
    o => o.side.toLowerCase() === 'sell'
  );

  return {
    accountInfo,
    openOrders,
    buyOpenOrders,
    sellOpenOrders
  };
};

module.exports = {
  getCachedExchangeInfo,
  getAccountInfoFromAPI,
  getAccountInfo,
  getOpenOrdersFromAPI,
  getOpenOrdersBySymbolFromAPI,
  getAndCacheOpenOrdersForSymbol,
  getLastBuyPrice,
  saveLastBuyPrice,
  removeLastBuyPrice,
  lockSymbol,
  isSymbolLocked,
  unlockSymbol,
  disableAction,
  isActionDisabled,
  deleteDisableAction,
  getAPILimit,
  isExceedAPILimit,
  getOverrideDataForSymbol,
  removeOverrideDataForSymbol,
  getOverrideDataForIndicator,
  removeOverrideDataForIndicator,
  calculateLastBuyPrice,
  getSymbolInfo,
  verifyAuthenticated,
  updateAccountInfo,
  getCacheTrailingTradeSymbols,
  getCacheOpenTrades,
  getCacheTrailingTradeQuoteEstimates,
  isExceedingMaxOpenTrades,
  refreshOpenOrdersAndAccountInfo
};
