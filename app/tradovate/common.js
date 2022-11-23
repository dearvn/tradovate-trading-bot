const { HttpsProxyAgent } = require('https-proxy-agent')
require('isomorphic-fetch');
//const P = require('free-http-proxy')


const cache = require('../helpers/cache');
//const PubSub = require('../helpers/pubsub');

const client = require('./tradovate');

const STORAGE_KEY = 'tradovate-api-access-token'
const EXPIRATION_KEY = 'tradovate-api-access-expiration'
const DEVICE_ID_KEY = 'tradovate-device-id'
const AVAIL_ACCTS_KEY = 'tradovate-api-available-accounts'
const USER_DATA_KEY = 'tradovate-user-data'

const defaultGetTime = () => Date.now()

const sleep = async ms => new Promise(resolve => setTimeout(resolve, ms));

const setDeviceId = (id) => {
  cache.set(DEVICE_ID_KEY, id)
}

const getDeviceId = async () => {
  return await cache.get(DEVICE_ID_KEY)
}

const setAvailableAccounts = accounts => {
  cache.set(AVAIL_ACCTS_KEY, JSON.stringify(accounts))
}

const getAvailableAccounts = async () => {
  return JSON.parse(await cache.get(AVAIL_ACCTS_KEY))

}

const queryAvailableAccounts = predicate => {
  return JSON.parse(getAvailableAccounts()).find(predicate)
}

const setAccessToken = (token, expiration) => {
  cache.set(STORAGE_KEY, token)
  cache.set(EXPIRATION_KEY, expiration)
}

const getAccessToken = async () => {
  const token = await cache.get(STORAGE_KEY)
  const expiration = await cache.get(EXPIRATION_KEY)
  if (!token) {
    console.warn('No access token retrieved. Please request an access token.')
  }
  return { token, expiration }
}

const tokenIsValid = expiration => new Date(expiration) - new Date() > 0

const setUserData = (data) => cache.set(USER_DATA_KEY, JSON.stringify(data))
const getUserData = async () => JSON.parse(await cache.get(USER_DATA_KEY))

const waitForMs = t => {
  return new Promise((res) => {
    setTimeout(() => {
      res()
    }, t)
  })
}

const handleRetry = async (data, json) => {
  const ticket = json['p-ticket'],
    time = json['p-time'],
    captcha = json['p-captcha']

  if (captcha) {
    console.error('Captcha present, cannot retry auth request via third party application. Please try again in an hour.')
    return
  }

  console.log(`Time Penalty present. Retrying operation in ${time}s`)

  await waitForMs(time * 1000)
  return await connect({ ...data, 'p-ticket': ticket })
}

const connect = async ({
  name,
  password,
  appId,
  appVersion,
  cid,
  sec,
  endpoints,
  env = 'demo',
  proxy = ''
}) => {
  let { token, expiration } = await getAccessToken()

  if (token && tokenIsValid(expiration)) {
    console.log('Already connected. Using valid token.')
    //const accounts = await tvGet('/account/list')
    //setAvailableAccounts(accounts)      
    return token
  }

  const credentials = {
    name: name,
    password: password,
    appId: appId,
    appVersion: appVersion,
    cid: cid,
    sec: sec
  }

  const privPost = await tvPost({ proxy, endpoints, env })

  const authResponse = await privPost('/auth/accesstokenrequest', credentials, false)

  //console.log("===============****************authResponse", authResponse);

  if (authResponse && authResponse['p-ticket']) {
    return await handleRetry({ ...credentials, proxy: proxy, endpoints: endpoints, env: env }, authResponse)
  } else {
    console.log("****************************************************************************************", authResponse);
    if (!authResponse) {
      console.log("****************************************************************************************");
      return;
    }
    const { errorText, accessToken, userId, userStatus, name, expirationTime } = authResponse

    if (errorText) {
      console.error(errorText)
      return
    }

    setAccessToken(accessToken, expirationTime)

    setUserData({ name: name, ID: userId, status: userStatus })

    console.log(`Successfully stored access token ${accessToken} for user {name: ${name}, ID: ${userId}, status: ${userStatus}}.`)


    return accessToken
  }
}

/*
const reconnect = async ({
  name,
  password,
  appId,
  appVersion,
  cid,
  sec,
  endpoints,
  env = 'demo',
  proxy = ''
}) => {
  const credentials = {
    name: name,
    password: password,
    appId: appId,
    appVersion: appVersion,
    cid: cid,
    sec: sec
  }

  console.log("=========Reconnect Successfully stored access token");
  const privPost = await tvPost({ proxy, endpoints, env })

  const authResponse = await privPost('/auth/accesstokenrequest', credentials, false)

  if (authResponse['p-ticket']) {
    return await handleRetry({ ...credentials, proxy: proxy, endpoints: endpoints, env: env }, authResponse)
  } else {
    const { errorText, accessToken, userId, userStatus, name, expirationTime } = authResponse

    if (errorText) {
      console.error(errorText)
      return
    }

    setAccessToken(accessToken, expirationTime)

    setUserData({ name: name, ID: userId, status: userStatus })

    console.log(`Reconnect Successfully stored access token ${accessToken} for user {name: ${name}, ID: ${userId}, status: ${userStatus}}.`)


    return accessToken
  }
}
*/

const tvGet = async ({
  endpoints,
  token = '',
  env = 'demo',
  proxy = ''
}) => async (path, query = {}) => {

  if (!token) {
    throw new Error('You need to pass an token to make authenticated calls.')
  }

  try {
    let q = ''
    if (query) {
      q = Object.keys(query).reduce((acc, next, i, arr) => {
        acc += next + '=' + query[next]
        if (i !== arr.length - 1) acc += '&'
        return acc
      }, '?')
    }

    let baseURL = env === 'live' ? endpoints.httpLive : endpoints.httpDemo
    if (!baseURL) throw new Error(`[Services:tvGet] => 'env' variable should be either 'live' or 'demo'.`)

    let url = query !== null
      ? baseURL + path + q
      : baseURL + path


    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      ...(proxy ? { agent: new HttpsProxyAgent(proxy) } : {}),
    })

    const js = await res.json()

    return js

  } catch (err) {
    console.error("===========err1", err);
    /*if (err.code == 'ETIMEDOUT') {
      console.error("===========sleep get");
      setTimeout(function (c) {
        console.error("===========sleep post2");
        c.reconnect();
      }, 5000, (await client.http));
    } else {
      (await client.http).reconnect();
    }*/
    //PubSub.publish('reconnect-tradovate', true);
  }
}

const tvPost = async ({
  endpoints,
  token = '',
  env = 'demo',
  proxy = ''
}) => async (path, data = {}, _usetoken = true) => {
  console.log('path:', path.toString() || '<no path>')

  if (!token && _usetoken == true) {
    throw new Error('You need to pass an token to make authenticated calls.')
  }

  try {

    const bearer = _usetoken ? { Authorization: `Bearer ${token}` } : {}

    let baseURL = env === 'live' ? endpoints.httpLive : endpoints.httpDemo
    if (!baseURL) throw new Error(`[Services:tvGet] => 'env' variable should be either 'live' or 'demo'.`)

    let url = baseURL + path


    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...bearer,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data),
      ...(proxy ? { agent: new HttpsProxyAgent(proxy) } : {}),
    })

    const js = await res.json()

    return js

  } catch (err) {
    //console.error("===========err", err);
    console.error("===========err", err);
    /*if (err.code == 'ETIMEDOUT') {
      console.error("===========sleep post");
      setTimeout(function (c) {
        console.error("===========sleep post2");
        c.reconnect();
      }, 5000, (await client.http));
    }

    (await client.http).reconnect();
    */
    //PubSub.publish('reconnect-tradovate', true);
  }
}

module.exports = {
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
};
