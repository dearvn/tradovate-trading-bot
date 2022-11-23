const _ = require('lodash');
const config = require('config');
const { PubSub, cache, mongo, tradovate } = require('./helpers');
const queue = require('./cronjob/trailingTradeHelper/queue');

const { connect } = require("./tradovate/common")
const DEMO_URL = 'https://demo.tradovateapi.com/v1'
const LIVE_URL = 'https://live.tradovateapi.com/v1'

//const { maskConfig } = require('./cronjob/trailingTradeHelper/util');
const {
  getGlobalConfiguration
} = require('./cronjob/trailingTradeHelper/configuration');

const {
  lockSymbol,
  unlockSymbol,
  getAccountInfoFromAPI
} = require('./cronjob/trailingTradeHelper/common');

const {
  tradeLogic,
  tradeLogic10m,
  tradeLogic5m
} = require('./cronjob/trailingTradeHelper/strategy');

const { syncOpenOrders } = require('./tradovate/orders');

/**
 * Setup web socket for retrieving candles
 *
 * @param {*} logger
 */
const syncAll = async logger => {
  //logger.info('Start syncing the bot...');



  // Get configuration
  const globalConfiguration = await getGlobalConfiguration(logger);

  //console.log("==========globalConfiguration", globalConfiguration);
  // TODO Can run data from here 

  // stop bot from config


  if (globalConfiguration.botOptions && globalConfiguration.botOptions.stop_bot) {
    return;
  }

  //await tradeLogic10m(logger, globalConfiguration);

  //await tradeLogic5m(logger, globalConfiguration);

  //await tradeLogic(logger, globalConfiguration);


  // Retrieve list of monitoring symbols
  var symbol = config.get('symbol');
  if (globalConfiguration.candles && globalConfiguration.candles.symbol) {
    symbol = globalConfiguration.candles.symbol;
  }
  const symbols = [symbol];


  await queue.init(logger, symbols);

  await syncOpenOrders(logger, symbols);

  // Unlock all symbols when all data has been retrieved
  //await Promise.all(symbols.map(symbol => unlockSymbol(logger, symbol)));
};

/**
 * Setup retrieving latest candle from live server via Web Socket
 *
 * @param {*} logger
 */
const setupTradovate = async logger => {
  PubSub.subscribe('reconnect-tradovate', async (message, data) => {
    //logger.info(`Message: ${message}, Data: ${data}`);

    console.log("========reconnect-tradovate");

    var env = config.get('mode') == 'production' ? 'live' : 'demo';
    var conf = config.get('mode') == 'production' ? config.get('tradovate.live') : config.get('tradovate.demo')

    const opts = {
      env: env,
      name: conf['name'],
      password: conf['password'],
      appId: conf['appId'],
      appVersion: conf['appVersion'],
      cid: conf['cid'],
      sec: conf['secret'],
      httpDemo: DEMO_URL,
      httpLive: LIVE_URL
    }

    const endpoints = {
      httpDemo: (opts && opts.httpDemo) || DEMO_URL,
      httpLive: (opts && opts.httpLive) || LIVE_URL,
    }

    console.log("=================reconnect");
    await connect({ ...opts, endpoints })

  });


  PubSub.subscribe('reset-all-websockets', async (message, data) => {
    //logger.info(`Message: ${message}, Data: ${data}`);

    PubSub.publish('frontend-notification', {
      type: 'info',
      title: 'Restarting bot...'
    });

    console.log("===========syncAll1");
    await syncAll(logger);

  });
  PubSub.subscribe('check-open-orders', async (message, data) => {
    //logger.info(`Message: ${message}, Data: ${data}`);

    await getAccountInfoFromAPI();

    const cachedOpenOrders = await cache.hgetall(
      'trailing-trade-open-orders:',
      'trailing-trade-open-orders:*'
    );

    const symbols = _.keys(cachedOpenOrders);

    console.log("=============>>>>>>check-open-orders", cachedOpenOrders);
    symbols.forEach(symbol => queue.executeFor(logger, symbol));
  });

  PubSub.subscribe('check-closed-orders', async (message, data) => {
    //logger.info(`Message: ${message}, Data: ${data}`);

    await getAccountInfoFromAPI();


  });

  console.log("===========syncAll2");
  await syncAll(logger);
};



/**
 * Configure Tradovate Web Socket
 *
 * @param {*} serverLogger
 */
const runTradovate = async serverLogger => {
  const logger = serverLogger.child({ server: 'tradovate' });

  /*logger.info(
    { config: maskConfig(config) },
    `Tradovate ${config.get('mode')} started on`
  );*/


  await setupTradovate(logger);
};

module.exports = { runTradovate };
