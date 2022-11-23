const {
  setDeviceId,
  getDeviceId,
  setAvailableAccounts,
  getAvailableAccounts,
  queryAvailableAccounts,
  setAccessToken,
  getAccessToken,
  tokenIsValid,
  setUserData,
  getUserData,
  waitForMs,
  connect,
  //reconnect,
  tvGet,
  tvPost
} = require("./common")

const DEMO_URL = 'https://demo.tradovateapi.com/v1'
const LIVE_URL = 'https://live.tradovateapi.com/v1'

const ORDER_TYPE = {
  Limit: 'Limit',
  MIT: 'MIT',
  Market: 'Market',
  QTS: 'QTS',
  Stop: 'Stop',
  StopLimit: 'StopLimit',
  TrailingStop: 'TralingStop',
  TrailingStopLimit: 'TrailingStopLimit'
}

const ping = async () => {
  console.log('ping');
}


const account_list = async (privGet, url) => {
  const accounts = await privGet(url)

  setAvailableAccounts(accounts)

  return accounts
}

const place_order = async (privPost, action, symbol, order_qty, order_type = 'Market', cl_ord_id = null, price = null,
  stop_price = null, max_show = null, peg_difference = null, time_in_force = null, expire_time = null, text = null,
  activation_time = null, custom_tag_50 = null, is_automated = false) => {

  const accounts = await getAvailableAccounts();
  //console.log("==========accounts", accounts);
  if (!accounts) {
    return;
  }

  const { id, name } = accounts[0]

  const payload = {
    "accountSpec": name, "accountId": id, "clOrdId": cl_ord_id,
    "action": action, "symbol": symbol, "orderQty": order_qty, "orderType": order_type,
    "price": price, "stopPrice": stop_price, "maxShow": max_show, "pegDifference": peg_difference,
    "timeInForce": time_in_force, "expireTime": expire_time, "text": text, "activationTime": activation_time,
    "customTag50": custom_tag_50, "isAutomated": is_automated,
  };

  console.log("===========payload", payload)

  const res = await privPost('/order/placeOrder', payload);

  console.log("=====================order", res);

  return res ? res['orderId'] : '';
}


const modify_order = async (privPost, order_id, stop_price, order_qty = 1, order_type = 'Market',
  cl_ord_id = null, price = null, max_show = null, peg_difference = null, time_in_force = null,
  expire_time = null, text = null, activation_time = null, custom_tag_50 = null, is_automated = null) => {



  const payload = {
    "orderId": order_id, "clOrdId": cl_ord_id,
    "orderQty": order_qty, "orderType": order_type,
    "price": price, "stopPrice": stop_price,
    "maxShow": max_show, "pegDifference": peg_difference,
    "timeInForce": time_in_force, "expireTime": expire_time,
    "text": text, "activationTime": activation_time,
    "customTag50": custom_tag_50, "isAutomated": is_automated
  };

  console.log("===========payload", payload)

  const res = await privPost('/order/modifyorder', payload);

  console.log("=====================order", res);

  return res ? res['orderId'] : '';
}

const exit_order = async (privGet, privPost, order_id) => {

  const item = await privGet('/order/item', { 'id': order_id })

  console.log(">>>>>>>>>>>>order item", item)
  if (!item['contractId']) {
    return;
  }

  const payload = {
    "accountId": item['accountId'], "contractId": item['contractId'], "admin": false
  };

  const res = await privPost('/order/liquidatePosition', payload);

  console.log("=====================exit order", res);

  return res ? res['orderId'] : '';

}

const httpMethods = async (opts) => {

  const endpoints = {
    httpDemo: (opts && opts.httpDemo) || DEMO_URL,
    httpLive: (opts && opts.httpLive) || LIVE_URL,
  }

  const token = await connect({ ...opts, endpoints })

  const params = { ...opts, token: token }

  const privGet = await tvGet({ ...params, endpoints })
  const privPost = await tvPost({ ...params, endpoints })

  const accounts = await account_list(privGet, '/account/list')

  //console.log(accounts)

  setAvailableAccounts(accounts)

  return {
    ping: async () => await ping(),
    accountList: async () => await account_list(privGet, '/account/list'),
    accountItem: async (id) => await privGet('/account/item', { 'id': id }),
    cashBalanceList: async () => await privGet('/cashBalance/list'),

    permissionList: async () => await privGet('/tradingPermission/list'),

    orderList: async () => await privGet('/order/list'),
    orderItem: async (id) => await privGet('/order/item', { 'id': id }),

    callOrder: async (ticker_id, order_qty) => await place_order(privPost, 'Buy', ticker_id, order_qty),
    putOrder: async (ticker_id, order_qty) => await place_order(privPost, 'Sell', ticker_id, order_qty),

    modifyOrder: async (order_id, stop_price) => await modify_order(privPost, order_id, stop_price),
    exitOrder: async (order_id) => await exit_order(privGet, privPost, order_id)
  }
}

module.exports = {
  httpMethods
}