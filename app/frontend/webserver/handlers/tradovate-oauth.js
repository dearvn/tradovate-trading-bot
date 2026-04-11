const crypto = require('crypto');
const config = require('config');
require('isomorphic-fetch');

const cache = require('../../../helpers/cache');
const { setAccessToken, setUserData, getAccessToken, getUserData, tokenIsValid } = require('../../../tradovate/common');

const OAUTH_AUTHORIZE_URL = 'https://trader.tradovate.com/oauth';
const TOKEN_URL_LIVE = 'https://live.tradovateapi.com/auth/oauthtoken';
const TOKEN_URL_DEMO = 'https://demo.tradovateapi.com/v1/auth/oauthtoken';
const STATE_CACHE_KEY = 'tradovate-oauth-state';

const getEnvConf = () => {
  const env = config.get('mode') === 'production' ? 'live' : 'demo';
  return { env, conf: config.get(`tradovate.${env}`) };
};

const getCallbackUrl = () => {
  const base = config.has('tradovate.oauthCallbackUrl') && config.get('tradovate.oauthCallbackUrl')
    ? config.get('tradovate.oauthCallbackUrl')
    : `http://localhost:${process.env.PORT || 80}`;
  return `${base}/api/tradovate/oauth/callback`;
};

const handleTradovateOAuth = async (logger, app) => {

  // Step 1 — redirect browser to Tradovate login page
  app.get('/api/tradovate/oauth/start', async (_req, res) => {
    try {
      const { env, conf } = getEnvConf();
      const state = crypto.randomBytes(16).toString('hex');
      await cache.set(STATE_CACHE_KEY, state, 300); // 5-minute TTL

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: String(conf['cid']),
        redirect_uri: getCallbackUrl(),
        state,
      });

      logger.info({ env }, 'Starting Tradovate OAuth flow');
      res.redirect(`${OAUTH_AUTHORIZE_URL}?${params.toString()}`);
    } catch (err) {
      logger.error({ err }, 'Failed to start OAuth flow');
      res.redirect('/connect?error=start_failed');
    }
  });

  // Step 2 — Tradovate redirects here with the authorization code
  app.get('/api/tradovate/oauth/callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
      logger.error({ error }, 'Tradovate OAuth returned an error');
      return res.redirect(`/connect?error=${encodeURIComponent(String(error))}`);
    }

    if (!code) {
      return res.redirect('/connect?error=no_code');
    }

    // Verify state to prevent CSRF
    const storedState = await cache.get(STATE_CACHE_KEY);
    if (!storedState || storedState !== state) {
      logger.error({ storedState, state }, 'OAuth state mismatch');
      return res.redirect('/connect?error=invalid_state');
    }
    await cache.del(STATE_CACHE_KEY);

    const { env, conf } = getEnvConf();
    const tokenUrl = env === 'live' ? TOKEN_URL_LIVE : TOKEN_URL_DEMO;

    try {
      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          client_id: conf['cid'],
          client_secret: conf['secret'],
          redirect_uri: getCallbackUrl(),
        }),
      });

      const data = await tokenRes.json();

      if (data.errorText || data.error) {
        const msg = data.errorText || data.error;
        logger.error({ msg }, 'Token exchange failed');
        return res.redirect(`/connect?error=${encodeURIComponent(msg)}`);
      }

      const { accessToken, userId, userStatus, name, expirationTime } = data;

      setAccessToken(accessToken, expirationTime);
      setUserData({ name, ID: userId, status: userStatus });

      logger.info({ name, userId, env }, 'Tradovate OAuth connected successfully');
      return res.redirect('/connect?connected=true');
    } catch (err) {
      logger.error({ err }, 'Token exchange request failed');
      return res.redirect('/connect?error=token_exchange_failed');
    }
  });

  // Status — returns current connection state
  app.get('/api/tradovate/oauth/status', async (_req, res) => {
    try {
      const { token, expiration } = await getAccessToken();
      const connected = !!(token && tokenIsValid(expiration));
      const user = connected ? await getUserData() : null;
      res.json({ connected, user, expiration: expiration || null });
    } catch (err) {
      logger.error({ err }, 'Failed to get OAuth status');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Disconnect — clears the stored token
  app.delete('/api/tradovate/oauth/disconnect', async (_req, res) => {
    try {
      await cache.del('tradovate-api-access-token');
      await cache.del('tradovate-api-access-expiration');
      await cache.del('tradovate-user-data');
      logger.info('Tradovate account disconnected');
      res.json({ disconnected: true });
    } catch (err) {
      logger.error({ err }, 'Failed to disconnect');
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

module.exports = { handleTradovateOAuth };
