/**
 * Redis cache helper.
 * Identical to app/helpers/cache.js — each agent gets its own connection pool.
 */

const config = require('config');
const Redis = require('ioredis');
const Redlock = require('redlock');

const redis = new Redis({
  host: config.get('redis.host'),
  port: config.get('redis.port'),
  password: config.get('redis.password'),
  db: config.get('redis.db')
});

const redlock = new Redlock([redis], {
  driftFactor: 0.01,
  retryCount: 4,
  retryDelay: 200,
  retryJitter: 200
});

const keys = async pattern => redis.keys(pattern);

const set = async (key, value, ttl = undefined) => {
  const lock = await redlock.lock(`redlock:${key}`, 500);
  let result;
  if (ttl) {
    result = await redis.setex(key, ttl, value);
  } else {
    result = await redis.set(key, value);
  }
  await lock.unlock();
  return result;
};

const get = async key => {
  const lock = await redlock.lock(`redlock:${key}`, 500);
  const result = await redis.get(key);
  await lock.unlock();
  return result;
};

const getWithoutLock = async key => redis.get(key);

const getWithTTL = async key => redis.multi().ttl(key).get(key).exec();

const del = async key => {
  const lock = await redlock.lock(`redlock:${key}`, 500);
  const result = await redis.del(key);
  await lock.unlock();
  return result;
};

const hset = async (key, field, value, ttl = undefined) => {
  const newKey = `${key}:${field}`;
  return set(newKey, value, ttl);
};

const hget = async (key, field) => {
  const newKey = `${key}:${field}`;
  return get(newKey);
};

const hgetWithoutLock = async (key, field) => {
  const newKey = `${key}:${field}`;
  return getWithoutLock(newKey);
};

const hgetall = async (prefix, pattern, cursor = '0', result = {}) => {
  const newResult = result;
  const reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
  const replyCursor = reply[0];
  if (reply[1]) {
    await Promise.all(
      reply[1].map(async replyKey => {
        newResult[replyKey.replace(prefix, '')] = await getWithoutLock(replyKey);
      })
    );
  }
  if (replyCursor === '0') return newResult;
  return hgetall(prefix, pattern, replyCursor, newResult);
};

const hdel = async (key, field) => {
  const newKey = `${key}:${field}`;
  return del(newKey);
};

const hdelall = async (pattern, cursor = '0') => {
  const reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
  const replyCursor = reply[0];
  if (reply[1]) {
    await Promise.all(reply[1].map(async replyKey => del(replyKey)));
  }
  if (replyCursor === '0') return true;
  return hdelall(pattern, replyCursor);
};

module.exports = {
  redis,
  keys,
  set,
  get,
  getWithoutLock,
  getWithTTL,
  del,
  hset,
  hget,
  hgetWithoutLock,
  hgetall,
  hdel,
  hdelall
};
