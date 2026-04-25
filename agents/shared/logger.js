/**
 * Bunyan logger for agents.
 * Identical to app/helpers/logger.js — logs to stdout + PostgreSQL.
 */

const _ = require('lodash');
const moment = require('moment');
const bunyan = require('bunyan');
const packageJson = require('../../package.json');

const postgres = require('./postgres');

const fakeLogger = {
  child: _childData => ({
    info: (..._infoData) => {}
  })
};

const lastLogs = {};

function InfoStream() {}
InfoStream.prototype.write = rawLog => {
  const log = JSON.parse(rawLog);

  if (_.get(log, 'symbol', '') !== '' && _.get(log, 'saveLog', false)) {
    if (_.get(lastLogs, `${log.symbol}.message`, '') !== log.msg) {
      postgres.insertOne(fakeLogger, 'trailing_trade_logs', {
        symbol: log.symbol,
        msg: log.msg,
        loggedAt: moment(log.time).utc().toDate(),
        data: _.omit(log, [
          'msg', 'symbol', 'name', 'version', 'hostname',
          'pid', 'gitHash', 'server', 'job', 'level', 'saveLog', 'time', 'v'
        ])
      });
      lastLogs[log.symbol] = { message: log.msg };
    }
  }
};

const logger = bunyan.createLogger({
  name: 'tradovate-api',
  version: packageJson.version,
  serializers: bunyan.stdSerializers,
  streams: [
    {
      stream: process.stdout,
      level: process.env.TRADOVATE_LOG_LEVEL || 'TRACE'
    },
    {
      stream: new InfoStream(),
      level: 'INFO'
    }
  ]
});

module.exports = logger;
