'use strict';

const { Pool } = require('pg');
const config = require('config');
const fs = require('fs');
const path = require('path');

let pool;

/**
 * Logical table type — controls how we build queries and map rows to documents.
 *
 * kv-key    — single PK: key VARCHAR(255),  data JSONB
 * kv-symbol — single PK: symbol VARCHAR(50), data JSONB
 * manual    — composite PK: (symbol, order_id), data JSONB
 * logs      — append-only: BIGSERIAL id, symbol, msg, logged_at, data JSONB
 * archive   — kv-key + dedicated numeric columns for SQL aggregation
 * orders    — BIGSERIAL id, symbol, status, entry_time, data JSONB
 */
const TABLE_TYPE = {
  trailing_trade_logs: 'logs',
  trailing_trade_grid_trade_archive: 'archive',
  trailing_trade_manual_orders: 'manual',
  trailing_trade_cache: 'kv-symbol',
  orders: 'orders'
};

const getTableType = tableName => TABLE_TYPE[tableName] || 'kv-key';

/**
 * Build a parameterised WHERE clause from a MongoDB-style filter object.
 * Supports: exact match, $regex (RegExp or string), $gte / $lte for date columns.
 */
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
      // Exact-match column selection based on table type
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
        // Default: key column (kv tables)
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

/**
 * Map a raw database row back to the document shape callers expect.
 */
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

/**
 * Sort-field camelCase → snake_case mapping for ORDER BY clauses.
 */
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

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Connect to PostgreSQL and apply the initial schema migration.
 */
const connect = async funcLogger => {
  const pgConfig = config.get('postgres');

  pool = new Pool({
    host: pgConfig.host,
    port: pgConfig.port,
    database: pgConfig.database,
    user: pgConfig.user,
    password: pgConfig.password,
    max: pgConfig.maxConnections || 10
  });

  pool.on('error', err => {
    funcLogger.error({ err }, 'Unexpected PostgreSQL client error');
  });

  // Apply schema
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

/**
 * Count rows matching filter.
 */
const count = async (funcLogger, tableName, filter) => {
  const tableType = getTableType(tableName);
  const { clause, values } = buildWhere(filter, tableType);
  const result = await pool.query(
    `SELECT COUNT(*)::INT AS cnt FROM ${tableName} ${clause}`,
    values
  );
  return result.rows[0].cnt;
};

/**
 * Return the first document matching filter, or null.
 */
const findOne = async (funcLogger, tableName, filter) => {
  const tableType = getTableType(tableName);
  const { clause, values } = buildWhere(filter, tableType);
  const result = await pool.query(
    `SELECT * FROM ${tableName} ${clause} LIMIT 1`,
    values
  );
  return rowToDoc(result.rows[0] || null, tableType);
};

/**
 * Return all documents matching filter.
 * params: { sort: { field: 1|-1 }, limit: N, skip: N }
 */
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

  const sql =
    `SELECT * FROM ${tableName} ${clause} ${orderBy} ${limitClause} ${offsetClause}`.replace(
      /\s+/g,
      ' '
    ).trim();

  const result = await pool.query(sql, values);
  return result.rows.map(row => rowToDoc(row, tableType));
};

/**
 * Insert a new document (logs / orders tables).
 */
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
    // kv tables — delegate to upsertOne
    funcLogger.warn({ tableName }, 'insertOne on kv table — delegating to upsertOne');
    return upsertOne(funcLogger, tableName, {}, document);
  }

  return { acknowledged: true };
};

/**
 * Upsert a document (insert or replace on conflict).
 */
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

    case 'archive': {
      const key = filter.key || document.key;
      const {
        symbol,
        quoteAsset,
        archivedAt,
        totalBuyQuoteQty,
        totalSellQuoteQty,
        buyGridTradeQuoteQty,
        buyManualQuoteQty,
        sellGridTradeQuoteQty,
        sellManualQuoteQty,
        stopLossQuoteQty,
        profit,
        profitPercentage,
        ...rest
      } = document;

      await pool.query(
        `INSERT INTO ${tableName} (
           key, symbol, quote_asset, archived_at,
           total_buy_quote_qty, total_sell_quote_qty,
           buy_grid_trade_quote_qty, buy_manual_quote_qty,
           sell_grid_trade_quote_qty, sell_manual_quote_qty,
           stop_loss_quote_qty, profit, profit_percentage,
           data, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
         ON CONFLICT (key) DO UPDATE SET
           symbol                   = EXCLUDED.symbol,
           quote_asset              = EXCLUDED.quote_asset,
           archived_at              = EXCLUDED.archived_at,
           total_buy_quote_qty      = EXCLUDED.total_buy_quote_qty,
           total_sell_quote_qty     = EXCLUDED.total_sell_quote_qty,
           buy_grid_trade_quote_qty = EXCLUDED.buy_grid_trade_quote_qty,
           buy_manual_quote_qty     = EXCLUDED.buy_manual_quote_qty,
           sell_grid_trade_quote_qty = EXCLUDED.sell_grid_trade_quote_qty,
           sell_manual_quote_qty    = EXCLUDED.sell_manual_quote_qty,
           stop_loss_quote_qty      = EXCLUDED.stop_loss_quote_qty,
           profit                   = EXCLUDED.profit,
           profit_percentage        = EXCLUDED.profit_percentage,
           data                     = EXCLUDED.data,
           updated_at               = NOW()`,
        [
          key,
          symbol || '',
          quoteAsset || '',
          archivedAt || new Date(),
          totalBuyQuoteQty || 0,
          totalSellQuoteQty || 0,
          buyGridTradeQuoteQty || 0,
          buyManualQuoteQty || 0,
          sellGridTradeQuoteQty || 0,
          sellManualQuoteQty || 0,
          stopLossQuoteQty || 0,
          profit || 0,
          profitPercentage || 0,
          JSON.stringify(rest)
        ]
      );
      break;
    }

    case 'orders': {
      const filterId = filter.id;
      const filterEntryTime = filter.entry_time || filter.entryTime;
      const { symbol, status, entryTime, entry_time, ...rest } = document;
      const actualEntryTime = entryTime || entry_time || null;

      if (filterEntryTime) {
        // Partial update by entry_time
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

/**
 * Delete the first row matching filter (safe-guarded against empty filter).
 */
const deleteOne = async (funcLogger, tableName, filter) => {
  const tableType = getTableType(tableName);
  const { clause, values } = buildWhere(filter, tableType);
  if (!clause) {
    funcLogger.warn({ tableName }, 'deleteOne called with empty filter — skipping');
    return { acknowledged: true };
  }
  // For kv-key tables add LIMIT 1 via ctid trick; for others just DELETE WHERE.
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

/**
 * Delete all rows matching filter (or all rows when filter is empty).
 */
const deleteAll = async (funcLogger, tableName, filter = {}) => {
  const tableType = getTableType(tableName);
  const { clause, values } = buildWhere(filter, tableType);
  await pool.query(`DELETE FROM ${tableName} ${clause}`, values);
  return { acknowledged: true };
};

/**
 * Run a raw parameterised SQL query. Returns result.rows.
 */
const query = async (funcLogger, sql, params = []) => {
  const result = await pool.query(sql, params);
  return result.rows;
};

/**
 * Purge log rows older than deleteAfterMinutes minutes.
 * Replaces MongoDB TTL index reconfiguration.
 */
const cleanupLogs = async (funcLogger, deleteAfterMinutes) => {
  if (!deleteAfterMinutes || deleteAfterMinutes <= 0) return;
  await pool.query(
    `DELETE FROM trailing_trade_logs
     WHERE logged_at < NOW() - INTERVAL '1 minute' * $1`,
    [deleteAfterMinutes]
  );
};

// ─── No-ops kept for API compatibility ───────────────────────────────────────
const createIndex = async () => {};
const dropIndex = async () => {};
const bulkWrite = async () => ({ acknowledged: true });
const aggregate = async (funcLogger, tableName) => {
  funcLogger.warn(
    { tableName },
    'postgres.aggregate() is a no-op — callers must use postgres.query() with raw SQL'
  );
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
