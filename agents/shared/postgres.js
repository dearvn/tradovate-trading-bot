'use strict';

/**
 * PostgreSQL helper.
 * Identical to app/helpers/postgres.js — each agent connects its own pool
 * (max 3 connections per agent, 6 agents × 3 = 18 total).
 */

const { Pool } = require('pg');
const config = require('config');
const fs = require('fs');
const path = require('path');

let pool;

const TABLE_TYPE = {
  trailing_trade_logs: 'logs',
  trailing_trade_grid_trade_archive: 'archive',
  trailing_trade_manual_orders: 'manual',
  trailing_trade_cache: 'kv-symbol',
  orders: 'orders'
};

const getTableType = tableName => TABLE_TYPE[tableName] || 'kv-key';

const buildWhere = (filter, tableType) => {
  if (!filter || Object.keys(filter).length === 0) {
    return { clause: '', values: [] };
  }

  const conditions = [];
  const values = [];

  for (const [field, value] of Object.entries(filter)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      if (value.$regex !== undefined) {
        const pattern =
          value.$regex instanceof RegExp ? value.$regex.source : String(value.$regex);
        values.push(pattern);
        conditions.push(`key ~ $${values.length}`);
      } else if (value.$gte !== undefined || value.$lte !== undefined) {
        const col = field === 'archivedAt' ? 'archived_at' : field;
        if (value.$gte !== undefined) {
          values.push(value.$gte);
          conditions.push(`${col} >= $${values.length}`);
        }
        if (value.$lte !== undefined) {
          values.push(value.$lte);
          conditions.push(`${col} <= $${values.length}`);
        }
      }
    } else {
      if (field === 'symbol') {
        values.push(value);
        conditions.push(`symbol = $${values.length}`);
      } else if (field === 'quoteAsset') {
        values.push(value);
        conditions.push(`quote_asset = $${values.length}`);
      } else if (field === 'order_id' || field === 'orderId') {
        values.push(value);
        conditions.push(`order_id = $${values.length}`);
      } else if (field === 'status') {
        values.push(value);
        conditions.push(`status = $${values.length}`);
      } else if (field === 'id') {
        values.push(value);
        conditions.push(`id = $${values.length}`);
      } else {
        values.push(value);
        conditions.push(`key = $${values.length}`);
      }
    }
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
};

const rowToDoc = (row, tableType) => {
  if (!row) return null;

  switch (tableType) {
    case 'kv-key':
    case 'kv-symbol':
    case 'manual':
      return row.data || {};

    case 'logs':
      return {
        id: row.id,
        symbol: row.symbol,
        msg: row.msg,
        loggedAt: row.logged_at,
        ...(row.data || {})
      };

    case 'archive':
      return {
        key: row.key,
        symbol: row.symbol,
        quoteAsset: row.quote_asset,
        archivedAt: row.archived_at,
        totalBuyQuoteQty: parseFloat(row.total_buy_quote_qty),
        totalSellQuoteQty: parseFloat(row.total_sell_quote_qty),
        buyGridTradeQuoteQty: parseFloat(row.buy_grid_trade_quote_qty),
        buyManualQuoteQty: parseFloat(row.buy_manual_quote_qty),
        sellGridTradeQuoteQty: parseFloat(row.sell_grid_trade_quote_qty),
        sellManualQuoteQty: parseFloat(row.sell_manual_quote_qty),
        stopLossQuoteQty: parseFloat(row.stop_loss_quote_qty),
        profit: parseFloat(row.profit),
        profitPercentage: parseFloat(row.profit_percentage),
        ...(row.data || {})
      };

    case 'orders':
      return {
        id: row.id,
        symbol: row.symbol,
        status: row.status,
        entryTime: row.entry_time,
        ...(row.data || {})
      };

    default:
      return row.data || {};
  }
};

const toSortCol = field => {
  const map = {
    loggedAt: 'logged_at',
    archivedAt: 'archived_at',
    updatedAt: 'updated_at',
    createdAt: 'created_at',
    entryTime: 'entry_time'
  };
  return map[field] || field;
};

const connect = async funcLogger => {
  const pgConfig = config.get('postgres');

  pool = new Pool({
    host: pgConfig.host,
    port: pgConfig.port,
    database: pgConfig.database,
    user: pgConfig.user,
    password: pgConfig.password,
    max: 3  // 3 connections per agent (6 agents × 3 = 18 total)
  });

  pool.on('error', err => {
    funcLogger.error({ err }, 'Unexpected PostgreSQL client error');
  });

  const schemaPath = path.resolve(__dirname, '../../migrations/001_initial_schema.sql');
  if (fs.existsSync(schemaPath)) {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    funcLogger.info('PostgreSQL schema migration applied');
  }

  funcLogger.info(
    { host: pgConfig.host, port: pgConfig.port, database: pgConfig.database },
    'PostgreSQL connected'
  );
};

const count = async (funcLogger, tableName, filter) => {
  const tableType = getTableType(tableName);
  const { clause, values } = buildWhere(filter, tableType);
  const result = await pool.query(
    `SELECT COUNT(*)::INT AS cnt FROM ${tableName} ${clause}`,
    values
  );
  return result.rows[0].cnt;
};

const findOne = async (funcLogger, tableName, filter) => {
  const tableType = getTableType(tableName);
  const { clause, values } = buildWhere(filter, tableType);
  const result = await pool.query(
    `SELECT * FROM ${tableName} ${clause} LIMIT 1`,
    values
  );
  return rowToDoc(result.rows[0] || null, tableType);
};

const findAll = async (funcLogger, tableName, filter = {}, params = {}) => {
  const tableType = getTableType(tableName);
  const { clause, values } = buildWhere(filter, tableType);

  let orderBy = '';
  if (params.sort && Object.keys(params.sort).length > 0) {
    const parts = Object.entries(params.sort).map(
      ([field, dir]) => `${toSortCol(field)} ${dir === -1 ? 'DESC' : 'ASC'}`
    );
    orderBy = `ORDER BY ${parts.join(', ')}`;
  } else if (tableType === 'logs') {
    orderBy = 'ORDER BY logged_at DESC';
  } else if (tableType === 'archive') {
    orderBy = 'ORDER BY archived_at DESC';
  }

  const limitClause = params.limit ? `LIMIT ${parseInt(params.limit, 10)}` : '';
  const offsetClause = params.skip ? `OFFSET ${parseInt(params.skip, 10)}` : '';

  const sql = `SELECT * FROM ${tableName} ${clause} ${orderBy} ${limitClause} ${offsetClause}`
    .replace(/\s+/g, ' ')
    .trim();

  const result = await pool.query(sql, values);
  return result.rows.map(row => rowToDoc(row, tableType));
};

const insertOne = async (funcLogger, tableName, document) => {
  const tableType = getTableType(tableName);

  if (tableType === 'logs') {
    const { symbol, msg, loggedAt, ...rest } = document;
    await pool.query(
      `INSERT INTO ${tableName} (symbol, msg, logged_at, data) VALUES ($1, $2, $3, $4)`,
      [symbol, msg || '', loggedAt || new Date(), JSON.stringify(rest)]
    );
  } else if (tableType === 'orders') {
    const { symbol, status, entryTime, entry_time, ...rest } = document;
    const actualEntryTime = entryTime || entry_time || null;
    await pool.query(
      `INSERT INTO ${tableName} (symbol, status, entry_time, data) VALUES ($1, $2, $3, $4)`,
      [symbol, status || 'open', actualEntryTime, JSON.stringify(rest)]
    );
  } else {
    funcLogger.warn({ tableName }, 'insertOne on kv table — delegating to upsertOne');
    return upsertOne(funcLogger, tableName, {}, document);
  }

  return { acknowledged: true };
};

const upsertOne = async (funcLogger, tableName, filter, document) => {
  const tableType = getTableType(tableName);

  switch (tableType) {
    case 'kv-key': {
      const key = filter.key || document.key;
      await pool.query(
        `INSERT INTO ${tableName} (key, data, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE
           SET data = EXCLUDED.data, updated_at = NOW()`,
        [key, JSON.stringify(document)]
      );
      break;
    }

    case 'kv-symbol': {
      const symbol = filter.symbol || document.symbol;
      await pool.query(
        `INSERT INTO ${tableName} (symbol, data, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (symbol) DO UPDATE
           SET data = EXCLUDED.data, updated_at = NOW()`,
        [symbol, JSON.stringify(document)]
      );
      break;
    }

    case 'manual': {
      const symbol = filter.symbol || document.symbol;
      const orderId =
        filter.order_id || filter.orderId || document.order_id || document.orderId;
      await pool.query(
        `INSERT INTO ${tableName} (symbol, order_id, data, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (symbol, order_id) DO UPDATE
           SET data = EXCLUDED.data, updated_at = NOW()`,
        [symbol, orderId, JSON.stringify(document)]
      );
      break;
    }

    case 'orders': {
      const filterEntryTime = filter.entry_time || filter.entryTime;
      const filterId = filter.id;
      const { symbol, status, entryTime, entry_time, ...rest } = document;
      const actualEntryTime = entryTime || entry_time || null;

      if (filterEntryTime) {
        const setClauses = [];
        const vals = [filterEntryTime];
        for (const [k, v] of Object.entries(document)) {
          const col = k === 'status' ? 'status' : k === 'exit_time' ? 'exit_time' : null;
          if (col) {
            vals.push(v);
            setClauses.push(`${col} = $${vals.length}`);
          } else {
            vals.push(JSON.stringify({ [k]: v }));
            setClauses.push(`data = data || $${vals.length}::jsonb`);
          }
        }
        setClauses.push('updated_at = NOW()');
        await pool.query(
          `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE entry_time = $1`,
          vals
        );
      } else if (filterId) {
        await pool.query(
          `UPDATE ${tableName}
           SET symbol = $2, status = $3, entry_time = $4, data = $5, updated_at = NOW()
           WHERE id = $1`,
          [filterId, symbol, status || 'open', actualEntryTime, JSON.stringify(rest)]
        );
      } else {
        await pool.query(
          `INSERT INTO ${tableName} (symbol, status, entry_time, data)
           VALUES ($1, $2, $3, $4)`,
          [symbol, status || 'open', actualEntryTime, JSON.stringify(rest)]
        );
      }
      break;
    }

    default:
      funcLogger.warn({ tableName, tableType }, 'upsertOne: unknown table type');
  }

  return { acknowledged: true };
};

const deleteOne = async (funcLogger, tableName, filter) => {
  const tableType = getTableType(tableName);
  const { clause, values } = buildWhere(filter, tableType);
  if (!clause) {
    funcLogger.warn({ tableName }, 'deleteOne called with empty filter — skipping');
    return { acknowledged: true };
  }
  if (tableType === 'kv-key') {
    await pool.query(
      `DELETE FROM ${tableName}
       WHERE ctid = (SELECT ctid FROM ${tableName} ${clause} LIMIT 1)`,
      values
    );
  } else {
    await pool.query(`DELETE FROM ${tableName} ${clause}`, values);
  }
  return { acknowledged: true };
};

const deleteAll = async (funcLogger, tableName, filter = {}) => {
  const tableType = getTableType(tableName);
  const { clause, values } = buildWhere(filter, tableType);
  await pool.query(`DELETE FROM ${tableName} ${clause}`, values);
  return { acknowledged: true };
};

const query = async (funcLogger, sql, params = []) => {
  const result = await pool.query(sql, params);
  return result.rows;
};

const cleanupLogs = async (funcLogger, deleteAfterMinutes) => {
  if (!deleteAfterMinutes || deleteAfterMinutes <= 0) return;
  await pool.query(
    `DELETE FROM trailing_trade_logs
     WHERE logged_at < NOW() - INTERVAL '1 minute' * $1`,
    [deleteAfterMinutes]
  );
};

const createIndex = async () => {};
const dropIndex = async () => {};
const bulkWrite = async () => ({ acknowledged: true });
const aggregate = async (funcLogger, tableName) => {
  funcLogger.warn({ tableName }, 'postgres.aggregate() is a no-op');
  return [];
};

module.exports = {
  connect,
  count,
  findOne,
  findAll,
  insertOne,
  upsertOne,
  deleteOne,
  deleteAll,
  query,
  cleanupLogs,
  createIndex,
  dropIndex,
  bulkWrite,
  aggregate
};
