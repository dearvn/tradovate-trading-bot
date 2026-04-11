const compression = require('compression');
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('config');
const requestIp = require('request-ip');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const fileUpload = require('express-fileupload');

const { maskConfig } = require('./cronjob/trailingTradeHelper/util');
const { cache } = require('./helpers');

const maxConsecutiveFails = config.get(
  'authentication.loginLimiter.maxConsecutiveFails'
);

const loginLimiter = new RateLimiterRedis({
  redis: cache.redis,
  keyPrefix: 'login',
  points: maxConsecutiveFails,
  duration: config.get('authentication.loginLimiter.duration'),
  blockDuration: config.get('authentication.loginLimiter.blockDuration')
});

const { configureWebServer } = require('./frontend/webserver/configure');
const { configureWebSocket } = require('./frontend/websocket/configure');
const { configureLocalTunnel } = require('./frontend/local-tunnel/configure');
const { configureBullBoard } = require('./frontend/bull-board/configure');


const runFrontend = async serverLogger => {
  const logger = serverLogger.child({ server: 'frontend' });
  /*logger.info(
    { config: maskConfig(config) },
    `API ${config.get('mode')} frontend started on`
  );*/


  const app = express();
  app.use(compression());

  // Security headers — applied before any route handler
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
  });

  // CORS: frontend is served from the same origin, so restrict cross-origin
  // requests to the same host. Pass allowedOrigin in config to whitelist
  // a specific external origin (e.g. during development).
  const allowedOrigin = config.get('frontend.allowedOrigin');
  app.use(cors(allowedOrigin ? { origin: allowedOrigin } : { origin: false }));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(
    fileUpload({
      safeFileNames: true,
      useTempFiles: true,
      tempFileDir: '/tmp/',
      limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max upload
      abortOnLimit: true
    })
  );
  app.use(express.static(path.join(__dirname, '/../public')));

  // Must configure bull board before listen.
  configureBullBoard(app, logger);

  const port = parseInt(process.env.PORT || '80', 10);
  const server = app.listen(port);

  if (config.get('authentication.enabled')) {
    const rateLimiterMiddleware = async (req, res, next) => {
      const clientIp = requestIp.getClientIp(req);

      // loginLimiter.get() returns null when the IP has never failed auth
      // (no key in Redis yet). Treat null as "not blocked".
      const rateLimiterLogin = await loginLimiter.get(clientIp);

      if (rateLimiterLogin !== null && rateLimiterLogin.remainingPoints <= 0) {
        res
          .status(403)
          .send(
            `You are blocked until ${new Date(
              Date.now() + rateLimiterLogin.msBeforeNext
            )}.`
          );
      } else {
        next();
      }
    };

    app.use(rateLimiterMiddleware);
  }

  await configureWebServer(app, logger, { loginLimiter });
  await configureWebSocket(server, logger, { loginLimiter });
  await configureLocalTunnel(logger);
};

module.exports = { runFrontend };
