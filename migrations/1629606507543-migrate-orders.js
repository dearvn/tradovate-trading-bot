/* eslint-disable no-await-in-loop */
/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
const _ = require('lodash');
const path = require('path');
const { logger: rootLogger, mongo, cache } = require('../app/helpers');

module.exports.up = async () => {
  const logger = rootLogger.child({
    gitHash: process.env.GIT_HASH || 'unspecified',
    migration: path.basename(__filename)
  });

  const database = await mongo.connect(logger);

  //logger.info('Start migration');

  let keys;
  let result;

  // Create index
  const gridTradeOrderscollection = database.collection(
    'trailing_trade_grid_trade_orders'
  );
  try {
    result = await gridTradeOrderscollection.dropIndex(
      `trailing_trade_grid_trade_orders-key-idx`
    );
  } catch (e) {
    logger.warn(
      `Index 'trailing_trade_grid_trade_orders-key-idx' is not found. It's ok.`
    );
  }

  result = await gridTradeOrderscollection.createIndex(
    { key: 1 },
    { name: `trailing_trade_grid_trade_orders-key-idx` }
  );

  //logger.info({ result }, 'Created index for orders');

  // Migreate cache to mongo
  keys = await cache.keys('*grid-trade-last*');
  if (keys && keys.length > 0) {
    for (const key of keys) {
      // Get cache
      const order = JSON.parse(await cache.get(key)) || {};

      await mongo.insertOne(logger, 'trailing_trade_grid_trade_orders', {
        key,
        order
      });

      await cache.del(key);
    }
  }

  // Create index
  const manualOrdersCollection = database.collection(
    'trailing_trade_manual_orders'
  );
  try {
    result = await manualOrdersCollection.dropIndex(
      `trailing_trade_manual_orders-key-idx`
    );
  } catch (e) {
    logger.warn(
      `Index 'trailing_trade_manual_orders-key-idx' is not found. It's ok.`
    );
  }

  result = await manualOrdersCollection.createIndex(
    { symbol: 1, orderId: 1 },
    { name: `trailing_trade_manual_orders-key-idx` }
  );

  //logger.info({ result }, 'Created index for manual orders');

  keys = await cache.keys('trailing-trade-manual-order*');
  if (keys && keys.length > 0) {
    for (const key of keys) {
      const manualOrders = await cache.hgetall(key);

      if (_.isEmpty(manualOrders) === false) {
        for (const rawOrder of Object.values(manualOrders)) {
          const order = JSON.parse(rawOrder);
          await mongo.insertOne(logger, 'trailing_trade_manual_orders', {
            symbol: order.symbol,
            orderId: order.orderId,
            order
          });
        }
      }

      await cache.del(key);
    }
  }

  //logger.info({ result }, 'Finish migration');
};

module.exports.down = next => {
  next();
};
