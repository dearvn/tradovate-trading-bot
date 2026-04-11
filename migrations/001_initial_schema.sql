-- PostgreSQL schema for tradovate-trading-bot
-- Replaces all MongoDB collections

-- ─── Key-value tables ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trailing_trade_common (
  key        VARCHAR(255) PRIMARY KEY,
  data       JSONB        NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trailing_trade_symbols (
  key        VARCHAR(255) PRIMARY KEY,
  data       JSONB        NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trailing_trade_grid_trade (
  key        VARCHAR(255) PRIMARY KEY,
  data       JSONB        NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trailing_trade_grid_trade_orders (
  key        VARCHAR(255) PRIMARY KEY,
  data       JSONB        NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Symbol-keyed cache (one row per symbol) ────────────────────────────────

CREATE TABLE IF NOT EXISTS trailing_trade_cache (
  symbol     VARCHAR(50)  PRIMARY KEY,
  data       JSONB        NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Manual orders (composite PK) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trailing_trade_manual_orders (
  symbol     VARCHAR(50)  NOT NULL,
  order_id   VARCHAR(100) NOT NULL,
  data       JSONB        NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, order_id)
);
CREATE INDEX IF NOT EXISTS idx_manual_orders_symbol
  ON trailing_trade_manual_orders (symbol);

-- ─── Append-only activity logs ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trailing_trade_logs (
  id        BIGSERIAL   PRIMARY KEY,
  symbol    VARCHAR(50) NOT NULL,
  msg       TEXT        NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data      JSONB       NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_logs_symbol
  ON trailing_trade_logs (symbol);
CREATE INDEX IF NOT EXISTS idx_logs_logged_at
  ON trailing_trade_logs (logged_at DESC);

-- ─── Completed trade archive (numeric columns for SQL aggregation) ──────────

CREATE TABLE IF NOT EXISTS trailing_trade_grid_trade_archive (
  key                      VARCHAR(255)  PRIMARY KEY,
  symbol                   VARCHAR(50)   NOT NULL,
  quote_asset              VARCHAR(20)   NOT NULL DEFAULT '',
  archived_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  total_buy_quote_qty      NUMERIC(20,8) NOT NULL DEFAULT 0,
  total_sell_quote_qty     NUMERIC(20,8) NOT NULL DEFAULT 0,
  buy_grid_trade_quote_qty NUMERIC(20,8) NOT NULL DEFAULT 0,
  buy_manual_quote_qty     NUMERIC(20,8) NOT NULL DEFAULT 0,
  sell_grid_trade_quote_qty NUMERIC(20,8) NOT NULL DEFAULT 0,
  sell_manual_quote_qty    NUMERIC(20,8) NOT NULL DEFAULT 0,
  stop_loss_quote_qty      NUMERIC(20,8) NOT NULL DEFAULT 0,
  profit                   NUMERIC(20,8) NOT NULL DEFAULT 0,
  profit_percentage        NUMERIC(20,8) NOT NULL DEFAULT 0,
  data                     JSONB         NOT NULL DEFAULT '{}',
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_archive_symbol
  ON trailing_trade_grid_trade_archive (symbol);
CREATE INDEX IF NOT EXISTS idx_archive_quote_asset
  ON trailing_trade_grid_trade_archive (quote_asset);
CREATE INDEX IF NOT EXISTS idx_archive_archived_at
  ON trailing_trade_grid_trade_archive (archived_at DESC);

-- ─── Trading orders ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id         BIGSERIAL   PRIMARY KEY,
  symbol     VARCHAR(50) NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'open',
  entry_time TIMESTAMPTZ,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_symbol
  ON orders (symbol);
CREATE INDEX IF NOT EXISTS idx_orders_entry_time
  ON orders (entry_time DESC NULLS LAST);
