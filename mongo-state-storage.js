/* eslint-disable no-useless-catch */
/* eslint-disable no-console */
/* eslint-disable class-methods-use-this */

/**
 * PostgreSQL-based migration state store (replaces the old MongoDB store).
 * Used by the `migrate` CLI: migrate up/down --store=/srv/mongo-state-storage.js
 */
const { Pool } = require('pg');
const config = require('config');

let pool;

const getPool = () => {
  if (!pool) {
    const pgConfig = config.get('postgres');
    pool = new Pool({
      host: pgConfig.host,
      port: pgConfig.port,
      database: pgConfig.database,
      user: pgConfig.user,
      password: pgConfig.password
    });
  }
  return pool;
};

const ensureTable = async client => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS trailing_trade_migrations (
      id         SERIAL PRIMARY KEY,
      last_run   TEXT,
      migrations JSONB NOT NULL DEFAULT '[]'
    )
  `);
};

class PostgresStore {
  async load(fn) {
    const client = await getPool().connect();
    try {
      await ensureTable(client);
      const result = await client.query(
        'SELECT last_run, migrations FROM trailing_trade_migrations LIMIT 1'
      );
      if (result.rows.length === 0) {
        console.log(
          'Cannot read migrations from database. If this is the first time you run migrations, then this is normal.'
        );
        return fn(null, {});
      }
      const row = result.rows[0];
      return fn(null, { lastRun: row.last_run, migrations: row.migrations });
    } catch (err) {
      throw err;
    } finally {
      client.release();
    }
  }

  async save(set, fn) {
    const client = await getPool().connect();
    try {
      await ensureTable(client);
      const existing = await client.query(
        'SELECT id FROM trailing_trade_migrations LIMIT 1'
      );
      if (existing.rows.length === 0) {
        await client.query(
          'INSERT INTO trailing_trade_migrations (last_run, migrations) VALUES ($1, $2)',
          [set.lastRun, JSON.stringify(set.migrations)]
        );
      } else {
        await client.query(
          'UPDATE trailing_trade_migrations SET last_run = $1, migrations = $2 WHERE id = $3',
          [set.lastRun, JSON.stringify(set.migrations), existing.rows[0].id]
        );
      }
      return fn(null, set);
    } catch (err) {
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = PostgresStore;
