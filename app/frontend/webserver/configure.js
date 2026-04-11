const crypto = require('crypto');

const { cache } = require('../../helpers');

const { setHandlers } = require('./handlers');

const configureJWTToken = async () => {
  let jwtSecret = await cache.get('auth-jwt-secret');

  if (jwtSecret === null) {
    // Use 32 cryptographically random bytes for the JWT secret.
    // UUID v4 has only ~122 bits of randomness and uses a non-crypto PRNG
    // on some runtimes; crypto.randomBytes is always CSPRNG.
    jwtSecret = crypto.randomBytes(32).toString('hex');
    await cache.set('auth-jwt-secret', jwtSecret);
  }

  return jwtSecret;
};

const configureWebServer = async (app, funcLogger, { loginLimiter }) => {
  const logger = funcLogger.child({ server: 'webserver' });

  // Firstly get(or set) JWT secret
  await configureJWTToken();

  await setHandlers(logger, app, { loginLimiter });
};

module.exports = { configureWebServer };
