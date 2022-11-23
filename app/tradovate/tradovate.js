const { httpMethods } = require('./tradovate-client');
const config = require('config');

const DEMO_URL = 'https://demo.tradovateapi.com/v1'
const LIVE_URL = 'https://live.tradovateapi.com/v1'
const WS_MD_URL = 'wss://md.tradovateapi.com/v1/websocket'
const WS_DEMO_URL = 'wss://demo.tradovateapi.com/v1/websocket'
const WS_LIVE_URL = 'wss://live.tradovateapi.com/v1/websocket'

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
  httpLive: LIVE_URL,
  wsMd: WS_MD_URL,
  wsDemo: WS_DEMO_URL,
  wsLive: WS_LIVE_URL
}

module.exports = {
  http: httpMethods(opts)
}
