const { cache, tradovate } = require('../../../helpers');
const config = require('config');

const { connect, getAccessToken, tokenIsValid } = require("../../../tradovate/common")
const DEMO_URL = 'https://demo.tradovateapi.com/v1'
const LIVE_URL = 'https://live.tradovateapi.com/v1'

const {
  getGlobalConfiguration
} = require('../../trailingTradeHelper/configuration');

/**
 * Get next symbol
 *
 * @param {*} logger
 * @param {*} rawData
 */
const execute = async (logger, rawData) => {
  const data = rawData;

  return;
  // Get configuration
  const globalConfiguration = await getGlobalConfiguration(logger);

  if (globalConfiguration.botOptions && globalConfiguration.botOptions.stop_bot) {
    return;
  }

  let { token, expiration } = await getAccessToken()

  console.log("**************************************reconnect-", new Date(expiration), "tradovate**************************************");

  if (token && tokenIsValid(expiration)) {
    return;
  }


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
};

module.exports = { execute };
