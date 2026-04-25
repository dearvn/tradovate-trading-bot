# Multi-Agent Architecture Plan

## Overview

The current system runs four logical servers inside a single Node.js process (`app/server.js`).
All four share memory, use in-process `pubsub-js` for events, and crash together if any
one throws an uncaught exception. This plan converts each logical server into an
independent OS process (or container) that communicates exclusively over Redis pub/sub
and Bull queues. No shared in-process state remains after the migration.

The goal is fault isolation: a crash in StrategyAgent must not affect FrontendAgent or
OrderAgent. Each agent owns a private Redis key namespace, its own PostgreSQL connection
pool, and receives events only through named Redis channels.

---

## Current Architecture — Coupling Analysis

Before the directory structure, it is important to understand exactly why the current code
is tightly coupled and what must change.

### Problem 1: In-process PubSub

`app/helpers/pubsub.js` wraps `pubsub-js`, which is a synchronous in-memory event bus.
All four servers subscribe to and publish on the same bus object because they share the
same Node.js module cache.

Affected publish calls found in the codebase:

| Channel | Published by | Consumed by |
|---------|-------------|-------------|
| `frontend-notification` | strategy.js, common.js, configure.js (uws) | websocket/configure.js, uws/configure.js |
| `price-tick` | strategy.js (tradeLogic) | websocket/configure.js |
| `price-update` | strategy.js (tradeLogic) | websocket/configure.js |
| `reset-all-websockets` | strategy.js, configuration.js | server-tradovate.js |
| `check-open-orders` | strategy.js | server-tradovate.js |
| `check-closed-orders` | strategy.js | server-tradovate.js |
| `reconnect-tradovate` | (subscribed, triggered externally) | server-tradovate.js |
| `tradovate-ws-authorized` | uws/tradovate-ws-client.js | (consumed nowhere yet) |
| `tradovate-event-*` | uws/tradovate-ws-client.js | (future consumers) |
| `market-data-quote` | uws/tradovate-ws-client.js | (future consumers) |
| `market-data-chart` | uws/tradovate-ws-client.js | (future consumers) |

All of these must become Redis pub/sub channels after the migration.

### Problem 2: Shared Redis key namespaces

All servers read and write to the same Redis key prefixes with no ownership boundary.
The table below maps current prefixes to the agent that should exclusively write them:

| Redis prefix | Current writer(s) | Owning agent after migration |
|---|---|---|
| `tradovate-api-access-token` | tradovate/common.js | MarketDataAgent |
| `tradovate-api-access-expiration` | tradovate/common.js | MarketDataAgent |
| `tradovate-device-id` | tradovate/common.js | MarketDataAgent |
| `tradovate-api-available-accounts` | tradovate/common.js | MarketDataAgent |
| `tradovate-user-data` | tradovate/common.js | MarketDataAgent |
| `tradovate-order` | strategy.js | OrderAgent |
| `trailing_trade_common:account-info` | common.js, alive/helper.js | OrderAgent |
| `trailing_trade_common:exchange-info` | common.js | MarketDataAgent |
| `trailing-trade-configurations:*` | configuration.js | ConfigAgent |
| `trailing-trade-open-orders:*` | orders.js, common.js | OrderAgent |
| `trailing_trade_symbols:*-symbol-info` | common.js | MarketDataAgent |
| `bot-lock:*` | common.js | OrderAgent |
| `auth-jwt-secret` | webserver/configure.js | FrontendAgent |
| `login:*` (rate limiter) | server-frontend.js | FrontendAgent |

### Problem 3: Shared PostgreSQL connection pool

`postgres.js` creates a single `Pool` and exports it as a module-level singleton.
Because all four servers `require()` it in the same process, they share one pool.
After splitting into separate processes, each agent creates its own pool, but they
must not write to each other's tables.

Table ownership after migration:

| Table | Owning agent (sole writer) | Read by |
|---|---|---|
| `orders` | OrderAgent | FrontendAgent (read-only), NotificationAgent |
| `trailing_trade_common` | ConfigAgent | all agents (read-only) |
| `trailing_trade_symbols` | ConfigAgent, OrderAgent | StrategyAgent |
| `trailing_trade_grid_trade` | ConfigAgent | StrategyAgent |
| `trailing_trade_grid_trade_orders` | OrderAgent | FrontendAgent |
| `trailing_trade_grid_trade_archive` | OrderAgent | FrontendAgent |
| `trailing_trade_manual_orders` | OrderAgent | FrontendAgent |
| `trailing_trade_cache` | StrategyAgent | FrontendAgent |
| `trailing_trade_logs` | NotificationAgent (logger sink) | FrontendAgent |

---

## 1. New Directory Structure

```
tradovate-trading-bot/
├── agents/
│   ├── shared/                      # Code shared across all agents (no in-process state)
│   │   ├── redis-pubsub.js          # Redis pub/sub wrapper (ioredis subscriber + publisher)
│   │   ├── postgres.js              # Copied from app/helpers/postgres.js (unchanged logic)
│   │   ├── cache.js                 # Copied from app/helpers/cache.js (unchanged logic)
│   │   ├── logger.js                # Copied from app/helpers/logger.js
│   │   └── slack.js                 # Copied from app/helpers/slack.js
│   │
│   ├── market-data/                 # MarketDataAgent
│   │   ├── index.js                 # Entry point — node agents/market-data/index.js
│   │   ├── tradovate-ws-bridge.js   # Moved from app/uws/tradovate-ws-client.js
│   │   └── token-manager.js         # Moved from app/tradovate/common.js
│   │
│   ├── strategy/                    # StrategyAgent
│   │   ├── index.js                 # Entry point
│   │   ├── trade-logic.js           # Moved from app/cronjob/trailingTradeHelper/strategy.js
│   │   ├── trade-logic-10m.js       # tradeLogic10m extracted from strategy.js
│   │   ├── trade-logic-5m.js        # tradeLogic5m extracted from strategy.js
│   │   └── indicator-util.js        # WMA/RSI/ATR/MACD helpers
│   │
│   ├── order/                       # OrderAgent
│   │   ├── index.js                 # Entry point
│   │   ├── order-manager.js         # Core from app/tradovate/orders.js + strategy.js order section
│   │   ├── grid-order.js            # Moved from app/cronjob/trailingTradeHelper/order.js
│   │   └── account.js               # Moved from app/cronjob/alive/helper.js + common.js account fns
│   │
│   ├── config/                      # ConfigAgent
│   │   ├── index.js                 # Entry point (lightweight — serves config reads via Redis)
│   │   └── configuration.js         # Moved from app/cronjob/trailingTradeHelper/configuration.js
│   │
│   ├── notification/                # NotificationAgent
│   │   ├── index.js                 # Entry point
│   │   └── slack-handler.js         # Moved from app/helpers/slack.js (extended with sub logic)
│   │
│   └── frontend/                    # FrontendAgent
│       ├── index.js                 # Entry point — replaces app/server-frontend.js + app/server-uws.js
│       ├── webserver/               # Moved from app/frontend/webserver/
│       ├── websocket/               # Moved from app/frontend/websocket/
│       └── uws/                     # Moved from app/uws/configure.js
│
├── app/                             # KEPT INTACT during migration (feature-flagged)
│   └── ...                          # No changes until Phase 4 cutover
│
├── migrations/
│   ├── 001_initial_schema.sql       # Existing (unchanged)
│   └── 002_agent_ownership.sql      # New: adds agent_owner column for audit (optional)
│
└── config/
    └── default.json                 # Add: redis.pubsub.channels section (see Section 3)
```

---

## 2. Agent Definitions

### 2.1 MarketDataAgent

**Entry point:** `agents/market-data/index.js`
**Replaces:** `app/server-tradovate.js` + `app/uws/tradovate-ws-client.js` (WS bridge portion)

**Owns:**
- Tradovate OAuth token lifecycle (connect, refresh, reconnect)
- Trading WebSocket connection (orders, positions, fills via `wss://[demo|live].tradovateapi.com/v1/websocket`)
- Market Data WebSocket connection (quotes, charts, DOM via `wss://md-[demo|].tradovateapi.com/v1/websocket`)
- Symbol subscription management

**Redis keys it WRITES:**
- `mda:token` — access token
- `mda:token-expiry` — expiration timestamp
- `mda:device-id` — device fingerprint
- `mda:accounts` — available account list JSON
- `mda:user-data` — authenticated user info
- `mda:symbol-info:{symbol}` — symbol metadata (TTL 3600s)
- `mda:exchange-info` — full exchange info (TTL 3600s)

**Redis channels it PUBLISHES:**
- `evt:market-data:quote` — `{ symbol, price, bid, ask, volume, timestamp }`
- `evt:market-data:chart` — `{ symbol, interval, bar: { open, high, low, close, volume, time } }`
- `evt:market-data:dom` — depth of market snapshot
- `evt:tradovate:order-event` — `{ entityType, data }` for order/fill/position events
- `evt:tradovate:authorized` — `{ type: 'trading'|'market-data' }` on successful WS auth

**Redis channels it SUBSCRIBES TO:**
- `cmd:tradovate:reconnect` — triggers re-authentication and reconnection

**Crash behavior:** Reconnects automatically (existing logic in `TradovateWsClient`). If this
agent is down, StrategyAgent stops receiving chart bars but OrderAgent and FrontendAgent
continue operating on stale data. No cascade crash.

---

### 2.2 StrategyAgent

**Entry point:** `agents/strategy/index.js`
**Replaces:** The `tradeLogic`, `tradeLogic10m`, `tradeLogic5m` functions in
`app/cronjob/trailingTradeHelper/strategy.js` and the cron trigger in
`app/server-cronjob.js` (`trailingTradeIndicator` job).

**Owns:**
- TradingView WebSocket sessions (one per timeframe: primary, 10m, 5m)
- In-memory candle series (closes, opens, highs, lows, volumes, datetimes arrays)
- Indicator computation (WMA, RSI, ATR, MACD, CrossUp, CrossDown)
- Signal generation (CALL/PUT/EXIT/STOPLOSS decision logic)
- Writing `trailing_trade_cache` table (symbol-level computed state)

**Important:** The module-level mutable variables in `strategy.js` (`closes`, `opens`,
`lows`, `highs`, `volumes`, `datetimes`, `order`, `up_10m`, `down_10m`, `up_5m`,
`down_5m`, `rsi_up`, `rsi_down`, `atr_value`, `macd_bull`, `macd_bear`,
`is_crossup_11_48`, `is_crossdown_11_48`, `cnt_out_up`) are already isolated to one
logical server. Moving StrategyAgent to its own process preserves this correctly.

**Redis keys it WRITES:**
- `strategy:state:{symbol}` — serialized indicator snapshot (TTL 60s, heartbeat refreshed)

**Redis channels it PUBLISHES:**
- `evt:strategy:price-tick` — `{ symbol, price, high, low, trend, order_type, timestamp }`
- `evt:strategy:price-update` — full indicator snapshot on candle close
- `evt:strategy:signal` — `{ symbol, signal: 'CALL'|'PUT'|'EXIT'|'STOPLOSS', order, timestamp }`
- `evt:notification` — UI notifications forwarded from strategy events

**Redis channels it SUBSCRIBES TO:**
- `evt:market-data:chart` — receives chart bar updates from MarketDataAgent
- `cmd:strategy:reset` — triggers `syncAll` (queue re-init, reconnect TradingView)
- `cmd:config:updated` — re-reads global config when settings change

**PostgreSQL tables it READS:**
- `trailing_trade_common` (global configuration)
- `orders` (to recover open order state on startup)

**PostgreSQL tables it WRITES:**
- `trailing_trade_cache` — per-symbol computed indicator state

**Bull queues it MANAGES:**
- One queue per symbol (existing `app/cronjob/trailingTradeHelper/queue.js` logic)
- Queue processor calls `executeTrailingTrade` (indicator step pipeline)

**Crash behavior:** TradingView sessions reconnect via existing `onError` handler.
If StrategyAgent is down, no new signals are generated. OrderAgent holds its last known
open order state. FrontendAgent serves stale data from Redis/PostgreSQL.

---

### 2.3 OrderAgent

**Entry point:** `agents/order/index.js`
**Replaces:** The order placement / exit / stoploss path inside `strategy.js` and
`app/tradovate/orders.js`, plus the `check-open-orders` and `check-closed-orders`
PubSub handlers in `app/server-tradovate.js`.

**Owns:**
- Order placement (CALL/PUT via `tradovate-client.js` `callOrder`/`putOrder`)
- Order exit (`exitOrder`, `liquidatePosition`)
- Open order sync interval (currently 30s × 1310ms ≈ 39s in `orders.js`)
- Grid trade order persistence (`trailing_trade_grid_trade_orders`)
- Manual order persistence (`trailing_trade_manual_orders`)
- Account info cache refresh
- Symbol lock / unlock (Redis `bot-lock` namespace)
- Order state in Redis (`tradovate-order` key — renamed to `order:state:{symbol}`)

**Redis keys it WRITES:**
- `order:state:{symbol}` — current open order JSON
- `order:lock:{symbol}` — symbol lock (TTL-based, existing redlock pattern)
- `order:open-orders:{symbol}` — cached open orders per symbol
- `account:info` — account balance snapshot

**Redis channels it PUBLISHES:**
- `evt:order:placed` — `{ symbol, order_type, entry_price, entry_order_id, timestamp }`
- `evt:order:closed` — `{ symbol, order_type, profit, exit_price, exit_order_id, timestamp }`
- `evt:notification` — order confirmation UI notifications

**Redis channels it SUBSCRIBES TO:**
- `evt:strategy:signal` — receives CALL/PUT/EXIT/STOPLOSS signals from StrategyAgent
- `evt:tradovate:order-event` — fill/execution events from MarketDataAgent
- `cmd:order:check-open` — re-syncs open orders from PostgreSQL
- `cmd:order:check-closed` — re-fetches closed order state

**PostgreSQL tables it READS:**
- `orders` (status: open, on startup to recover state)
- `trailing_trade_grid_trade_orders`
- `trailing_trade_manual_orders`

**PostgreSQL tables it WRITES:**
- `orders` — sole writer for INSERT and status transitions
- `trailing_trade_grid_trade_orders`
- `trailing_trade_manual_orders`
- `trailing_trade_grid_trade_archive`

**Crash behavior:** On restart, OrderAgent reads `orders` table (status: open) and
`order:state:{symbol}` from Redis to recover. All in-flight signals during the downtime
are dropped (no durable signal queue is added in Phase 1 — see Phase 3 for that
enhancement). MarketDataAgent and StrategyAgent continue unaffected.

---

### 2.4 ConfigAgent

**Entry point:** `agents/config/index.js`
**Replaces:** `app/cronjob/trailingTradeHelper/configuration.js` used by WebSocket
handlers `setting-update`, `symbol-setting-update`, `symbol-setting-delete`.

**Owns:**
- Global configuration CRUD (`trailing_trade_common` key `configuration`)
- Per-symbol configuration CRUD (`trailing_trade_symbols`)
- Grid trade configuration (`trailing_trade_grid_trade`)
- Configuration cache invalidation (`trailing-trade-configurations:*` Redis namespace,
  renamed to `config:*`)
- Log cleanup (`cleanupLogs`)

**Redis keys it WRITES:**
- `config:global` — serialized global config (TTL: none, invalidated on save)
- `config:symbol:{symbol}` — per-symbol config
- `config:grid-trade:{symbol}` — per-symbol grid trade config

**Redis channels it PUBLISHES:**
- `cmd:config:updated` — broadcast to all agents when any config changes (payload:
  `{ scope: 'global'|'symbol', symbol?: string }`)

**Redis channels it SUBSCRIBES TO:**
- `cmd:config:save-global` — from FrontendAgent (WebSocket `setting-update` command)
- `cmd:config:save-symbol` — from FrontendAgent (WebSocket `symbol-setting-update`)
- `cmd:config:delete-symbol` — from FrontendAgent (WebSocket `symbol-setting-delete`)

**PostgreSQL tables it READS:**
- `trailing_trade_common`
- `trailing_trade_symbols`
- `trailing_trade_grid_trade`

**PostgreSQL tables it WRITES:**
- `trailing_trade_common`
- `trailing_trade_symbols`
- `trailing_trade_grid_trade`

**Crash behavior:** FrontendAgent falls back to reading config directly from PostgreSQL
(it already does this for `/api/strategy`). StrategyAgent uses its last cached config
from Redis. All agents cache the last known config locally so a ConfigAgent outage is
not immediately fatal.

**Note:** ConfigAgent can be very lightweight — it is essentially a request/response
service over Redis. It does not need to be a long-running event loop; it can be a simple
subscriber that handles config read/write commands and re-publishes change notifications.

---

### 2.5 NotificationAgent

**Entry point:** `agents/notification/index.js`
**Replaces:** The Slack `sendMessage` calls scattered across `common.js`, `strategy.js`,
and `configuration.js`, plus the `alive` cron job (`app/cronjob/alive/`).

**Owns:**
- Slack webhook dispatch
- Deduplication of Slack messages per symbol (existing `lastMessages` object logic)
- Daily alive/health check cron (`0 0 9 * * *` — existing `jobs.alive.cronTime`)
- Log TTL enforcement (calls `postgres.cleanupLogs` on schedule)

**Redis channels it SUBSCRIBES TO:**
- `evt:notification` — from all other agents
  Payload: `{ type: 'info'|'success'|'warning'|'error', title: string, symbol?: string, apiLimit?: number }`
- `evt:order:placed` — triggers order confirmation Slack message
- `evt:order:closed` — triggers order close Slack message

**PostgreSQL tables it READS:**
- `orders` (for health check / daily P&L summary)
- `trailing_trade_logs` (for cleanup)

**PostgreSQL tables it WRITES:**
- `trailing_trade_logs` (sole writer — logger sink, replaces `InfoStream` in logger.js)

**Crash behavior:** Slack messages are lost while this agent is down. No other agent
is affected. The logger `InfoStream` in the shared `logger.js` writes to `trailing_trade_logs`
directly — this is a secondary write path that remains as a fallback.

---

### 2.6 FrontendAgent

**Entry point:** `agents/frontend/index.js`
**Replaces:** `app/server-frontend.js` + `app/server-uws.js`

**Owns:**
- Express HTTP server (port 80) — all REST API routes under `/api/`
- WebSocket server (existing `ws` library, port 80 upgrade)
- uWebSockets server (port 3001) — high-performance broadcast to browser clients
- JWT secret management (`auth-jwt-secret` Redis key)
- Rate limiter (`login:*` Redis keys)
- Bull Board admin UI (`/bull-board`)
- LocalTunnel setup

**Redis keys it READS (never writes except its own namespace):**
- `account:info` — for `/api/dashboard/summary`
- `order:state:{symbol}` — for live position data
- `order:open-orders:{symbol}` — for position list
- `config:global` — for `/api/strategy` default values

**Redis channels it SUBSCRIBES TO (bridge to browser WS/uWS clients):**
- `evt:notification` — forwards to all connected browser WebSocket clients
- `evt:strategy:price-tick` — forwards as `price-tick` WS message
- `evt:strategy:price-update` — forwards as `price-update` WS message
- `evt:order:placed` — forwards as order notification
- `evt:order:closed` — forwards as order notification

**Redis channels it PUBLISHES:**
- `cmd:config:save-global` — when browser sends `setting-update` WS command
- `cmd:config:save-symbol` — when browser sends `symbol-setting-update` WS command
- `cmd:config:delete-symbol` — when browser sends `symbol-setting-delete` WS command
- `cmd:tradovate:reconnect` — when browser sends reconnect request

**PostgreSQL tables it READS (all read-only):**
- `orders` — `/api/positions`, `/api/trades`, `/api/dashboard/summary`
- `trailing_trade_common` — `/api/strategy`
- `trailing_trade_logs` — `/api/logs`
- `trailing_trade_grid_trade_archive` — `/api/grid-trade-archive`
- `trailing_trade_grid_trade_orders` — existing handlers

**Crash behavior:** Browser clients lose their WebSocket connection. REST API becomes
unavailable. All trading agents continue unaffected. On restart, FrontendAgent
reconnects to Redis, re-subscribes to event channels, and the browser reconnects.

---

## 3. Inter-Agent Communication Protocol

### 3.1 Replace In-Process PubSub with Redis Pub/Sub

Create `agents/shared/redis-pubsub.js`:

```
Publisher connection:  new Redis(redisConfig)   — one instance per agent
Subscriber connection: new Redis(redisConfig)   — separate instance (Redis requirement)
```

**Why two connections:** Redis requires separate connections for subscribe and publish
because a connection in subscribe mode cannot send other commands.

**Channel naming convention:**
- `evt:{domain}:{event}` — events broadcast by an agent (fire-and-forget)
- `cmd:{domain}:{action}` — commands directed at a specific agent (request-like)

**Message envelope (all channels):**
```json
{
  "v": 1,
  "ts": 1713300000000,
  "src": "strategy-agent",
  "data": { ... }
}
```

`v` is the schema version. Agents must ignore messages with unknown `v` values to
allow rolling deploys.

### 3.2 Channel Registry

All channel names are constants defined in `agents/shared/channels.js`:

```
EVT_MARKET_DATA_QUOTE     = 'evt:market-data:quote'
EVT_MARKET_DATA_CHART     = 'evt:market-data:chart'
EVT_MARKET_DATA_DOM       = 'evt:market-data:dom'
EVT_TRADOVATE_ORDER_EVENT = 'evt:tradovate:order-event'
EVT_TRADOVATE_AUTHORIZED  = 'evt:tradovate:authorized'
EVT_STRATEGY_PRICE_TICK   = 'evt:strategy:price-tick'
EVT_STRATEGY_PRICE_UPDATE = 'evt:strategy:price-update'
EVT_STRATEGY_SIGNAL       = 'evt:strategy:signal'
EVT_ORDER_PLACED          = 'evt:order:placed'
EVT_ORDER_CLOSED          = 'evt:order:closed'
EVT_NOTIFICATION          = 'evt:notification'
CMD_TRADOVATE_RECONNECT   = 'cmd:tradovate:reconnect'
CMD_STRATEGY_RESET        = 'cmd:strategy:reset'
CMD_ORDER_CHECK_OPEN      = 'cmd:order:check-open'
CMD_ORDER_CHECK_CLOSED    = 'cmd:order:check-closed'
CMD_CONFIG_UPDATED        = 'cmd:config:updated'
CMD_CONFIG_SAVE_GLOBAL    = 'cmd:config:save-global'
CMD_CONFIG_SAVE_SYMBOL    = 'cmd:config:save-symbol'
CMD_CONFIG_DELETE_SYMBOL  = 'cmd:config:delete-symbol'
```

### 3.3 Migration Mapping: PubSub → Redis Channels

| Old PubSub channel | New Redis channel | Publisher → Subscriber |
|---|---|---|
| `frontend-notification` | `evt:notification` | all agents → FrontendAgent + NotificationAgent |
| `price-tick` | `evt:strategy:price-tick` | StrategyAgent → FrontendAgent |
| `price-update` | `evt:strategy:price-update` | StrategyAgent → FrontendAgent |
| `reset-all-websockets` | `cmd:strategy:reset` | ConfigAgent → StrategyAgent |
| `check-open-orders` | `cmd:order:check-open` | StrategyAgent → OrderAgent |
| `check-closed-orders` | `cmd:order:check-closed` | StrategyAgent → OrderAgent |
| `reconnect-tradovate` | `cmd:tradovate:reconnect` | FrontendAgent → MarketDataAgent |
| `tradovate-ws-authorized` | `evt:tradovate:authorized` | MarketDataAgent → (future) |
| `tradovate-event-*` | `evt:tradovate:order-event` | MarketDataAgent → OrderAgent |
| `market-data-quote` | `evt:market-data:quote` | MarketDataAgent → StrategyAgent |
| `market-data-chart` | `evt:market-data:chart` | MarketDataAgent → StrategyAgent |

**New channel introduced by this plan:**
- `evt:strategy:signal` — the critical new channel. Currently, StrategyAgent calls
  `tradovate.client.http.callOrder()` directly after computing a signal. In the new
  architecture, it only publishes the signal and OrderAgent places the order. This
  cleanly decouples signal generation from execution.

### 3.4 Bull Queue Ownership

Bull queues are already Redis-backed. They remain in StrategyAgent with no changes to
the queue logic. OrderAgent does not touch Bull queues. FrontendAgent's Bull Board reads
the queue metadata directly from Redis (existing pattern, unchanged).

### 3.5 Redlock Ownership

`redlock` is used in `cache.js` for per-key mutual exclusion. Each agent creates its own
`Redlock` instance against its own Redis connection. Since each agent owns distinct key
namespaces (see Section 2), contention between agents is eliminated by design.

---

## 4. File Migration Mapping

### 4.1 Files That Move Unchanged

| Current path | Destination | Notes |
|---|---|---|
| `app/helpers/cache.js` | `agents/shared/cache.js` | Unchanged; each agent imports it |
| `app/helpers/postgres.js` | `agents/shared/postgres.js` | Unchanged |
| `app/helpers/logger.js` | `agents/shared/logger.js` | Unchanged |
| `app/helpers/slack.js` | `agents/shared/slack.js` | Unchanged |
| `app/tradovate/common.js` | `agents/market-data/token-manager.js` | Namespace rename only |
| `app/tradovate/tradovate-client.js` | `agents/order/tradovate-client.js` | Used only by OrderAgent |
| `app/tradovate/orders.js` | `agents/order/order-sync.js` | Rename only |
| `app/uws/tradovate-ws-client.js` | `agents/market-data/tradovate-ws-bridge.js` | Remove PubSub → use Redis pub |
| `app/uws/configure.js` | `agents/frontend/uws/configure.js` | Remove PubSub → Redis sub |
| `app/cronjob/trailingTradeHelper/order.js` | `agents/order/grid-order.js` | Unchanged |
| `app/cronjob/trailingTradeHelper/configuration.js` | `agents/config/configuration.js` | Replace PubSub.publish with Redis pub |
| `app/cronjob/trailingTradeHelper/common.js` | `agents/shared/trading-common.js` | Split: auth fns → FrontendAgent, account fns → OrderAgent |
| `app/cronjob/alive/helper.js` | `agents/notification/alive-helper.js` | Unchanged |
| `app/frontend/webserver/` | `agents/frontend/webserver/` | Unchanged |
| `app/frontend/websocket/` | `agents/frontend/websocket/` | Remove PubSub.subscribe → Redis sub |
| `app/frontend/bull-board/` | `agents/frontend/bull-board/` | Unchanged |
| `app/frontend/local-tunnel/` | `agents/frontend/local-tunnel/` | Unchanged |
| `app/error-handler.js` | `agents/shared/error-handler.js` | Unchanged |

### 4.2 Files That Split

**`app/cronjob/trailingTradeHelper/strategy.js`** (907 lines) splits into:

- `agents/strategy/trade-logic.js` — `tradeLogic()` function (primary timeframe)
- `agents/strategy/trade-logic-10m.js` — `tradeLogic10m()` function
- `agents/strategy/trade-logic-5m.js` — `tradeLogic5m()` function
- The order placement block (lines 525–646) moves to `agents/order/order-executor.js`

The split point is the `evt:strategy:signal` publish in the new StrategyAgent:
- Before: `if (order['order_type'] == 'CALL') { tradovate.client.http.callOrder(...); postgres.insertOne(...) }`
- After: `redisPub.publish(EVT_STRATEGY_SIGNAL, { signal: 'CALL', order })`

**`app/cronjob/trailingTradeHelper/common.js`** (806 lines) splits into:

- `agents/shared/trading-common.js` — `lockSymbol`, `unlockSymbol`, `isSymbolLocked`, `disableAction`, `isActionDisabled`, `getCacheTrailingTradeSymbols` (shared utilities)
- `agents/order/account.js` — `getAccountInfoFromAPI`, `getAccountInfo`, `getOpenOrdersFromAPI`, `getAndCacheOpenOrdersForSymbol`, `refreshOpenOrdersAndAccountInfo`
- `agents/market-data/symbol-info.js` — `getCachedExchangeInfo`, `getSymbolInfo`
- `agents/shared/auth.js` — `verifyAuthenticated` (used by FrontendAgent and uws/configure.js)

### 4.3 Files That Are Replaced by New Implementations

| Current path | Replacement | Reason |
|---|---|---|
| `app/helpers/pubsub.js` | `agents/shared/redis-pubsub.js` | In-process → Redis pub/sub |
| `app/server.js` | `agents/*/index.js` × 6 | Each agent has its own entry point |
| `app/server-tradovate.js` | `agents/market-data/index.js` | PubSub subscriptions become Redis subs |
| `app/server-cronjob.js` | `agents/strategy/index.js` | CronJob logic stays, PubSub removed |
| `app/server-frontend.js` | `agents/frontend/index.js` | PubSub → Redis |
| `app/server-uws.js` | `agents/frontend/index.js` | Merged with FrontendAgent |

### 4.4 Files That Stay in `app/` (Untouched Until Phase 4)

Everything under `app/` remains untouched during Phases 1–3. The `app/server.js`
monolith continues to run. The `agents/` directory is built in parallel.

---

## 5. Implementation Phases

### Phase 1 — Shared Infrastructure (Week 1)

**Goal:** Create the building blocks that all agents depend on. No agent runs yet.

Tasks:
1. Create `agents/shared/` directory and copy helpers unchanged:
   - `cache.js`, `postgres.js`, `logger.js`, `slack.js`, `error-handler.js`
2. Create `agents/shared/redis-pubsub.js` — thin wrapper around ioredis that exports
   `createPublisher()` and `createSubscriber()` with the message envelope format.
3. Create `agents/shared/channels.js` — all channel name constants.
4. Create `migrations/002_agent_ownership.sql` if audit columns are desired (optional).
5. Write a smoke test: publisher publishes on `evt:test`, subscriber receives it.

**Verify:** `node -e "require('./agents/shared/redis-pubsub')"` runs without error.
No existing functionality changes.

---

### Phase 2 — ConfigAgent + NotificationAgent (Week 2)

**Goal:** Extract the two simplest, most isolated agents first. They have no tight
real-time requirements.

Tasks:
1. Implement `agents/config/configuration.js` from `app/cronjob/trailingTradeHelper/configuration.js`:
   - Replace `PubSub.publish('reset-all-websockets', true)` with
     `redisPub.publish(CMD_CONFIG_UPDATED, { scope: 'global' })`
   - Replace Redis key prefix `trailing-trade-configurations` with `config`
2. Implement `agents/config/index.js`:
   - Subscribe to `cmd:config:save-global`, `cmd:config:save-symbol`, `cmd:config:delete-symbol`
   - On each, run the corresponding configuration.js function and publish `cmd:config:updated`
3. Implement `agents/notification/index.js`:
   - Subscribe to `evt:notification`, `evt:order:placed`, `evt:order:closed`
   - For each message call `slack.sendMessage` with deduplication logic
4. Implement `agents/notification/alive-helper.js` from `app/cronjob/alive/helper.js`
   - Add CronJob matching `jobs.alive.cronTime`
   - Add `cleanupLogs` call matching `botOptions.logs.deleteAfter`

**Verify:**
- Start only ConfigAgent and NotificationAgent alongside the existing monolith.
- Publish a test `evt:notification` message via `redis-cli PUBLISH`. NotificationAgent
  logs it (Slack disabled in test mode).
- ConfigAgent handles a `cmd:config:save-global` and publishes `cmd:config:updated`.

---

### Phase 3 — MarketDataAgent (Week 3)

**Goal:** Extract the Tradovate WebSocket bridge into its own process.

Tasks:
1. Create `agents/market-data/token-manager.js` from `app/tradovate/common.js`:
   - Rename Redis keys to `mda:*` namespace.
   - Export same interface: `connect`, `getAccessToken`, `setAccessToken`, etc.
2. Create `agents/market-data/tradovate-ws-bridge.js` from `app/uws/tradovate-ws-client.js`:
   - Replace `PubSub.publish('tradovate-event-...')` with `redisPub.publish(EVT_TRADOVATE_ORDER_EVENT, ...)`
   - Replace `PubSub.publish('market-data-quote', ...)` with `redisPub.publish(EVT_MARKET_DATA_QUOTE, ...)`
   - Replace `PubSub.publish('market-data-chart', ...)` with `redisPub.publish(EVT_MARKET_DATA_CHART, ...)`
   - Subscribe to `cmd:tradovate:reconnect` via Redis to trigger `connect()`
3. Create `agents/market-data/index.js`:
   - Call `token-manager.connect()` on startup.
   - Start `tradovate-ws-bridge`.

**Verify:**
- Run MarketDataAgent standalone. Check Redis with `redis-cli SUBSCRIBE evt:market-data:quote`.
- Confirm quote events arrive. The existing monolith `app/server-tradovate.js` can be
  disabled for this test by setting `botOptions.stop_bot: true` in config.

---

### Phase 4 — StrategyAgent + OrderAgent (Weeks 4–5)

**Goal:** Extract the two most complex agents. This is the riskiest phase.

**Pre-condition:** Phases 1–3 must be complete and stable.

**StrategyAgent tasks:**
1. Create `agents/strategy/trade-logic.js` from `strategy.js` with these changes:
   - Remove the order placement block (lines 525–646 in the current file).
   - Replace with: `redisPub.publish(EVT_STRATEGY_SIGNAL, { signal, order })`
   - Replace `PubSub.publish('frontend-notification', ...)` with `redisPub.publish(EVT_NOTIFICATION, ...)`
   - Replace `PubSub.publish('price-tick', ...)` with `redisPub.publish(EVT_STRATEGY_PRICE_TICK, ...)`
   - Replace `PubSub.publish('price-update', ...)` with `redisPub.publish(EVT_STRATEGY_PRICE_UPDATE, ...)`
   - Replace `PubSub.publish('check-open-orders', ...)` with `redisPub.publish(CMD_ORDER_CHECK_OPEN, {})`
   - Replace `PubSub.publish('check-closed-orders', ...)` with `redisPub.publish(CMD_ORDER_CHECK_CLOSED, {})`
   - Subscribe to `cmd:strategy:reset` → call `syncAll()`
   - Subscribe to `cmd:config:updated` → re-read global config
2. Extract `tradeLogic10m` and `tradeLogic5m` into separate files.
3. Create `agents/strategy/index.js` — starts all three TradingView sessions.

**OrderAgent tasks:**
1. Create `agents/order/order-executor.js` from the order-placement block of `strategy.js`:
   - Subscribes to `evt:strategy:signal`
   - On CALL/PUT: calls `tradovate.client.http.callOrder/putOrder`, writes to `orders` table,
     publishes `evt:order:placed`
   - On EXIT/STOPLOSS: calls `tradovate.client.http.exitOrder`, updates `orders` table,
     publishes `evt:order:closed`
2. Create `agents/order/order-sync.js` from `app/tradovate/orders.js`:
   - Subscribe to `cmd:order:check-open` to refresh open orders
3. Create `agents/order/account.js` from account functions in `common.js`.
4. Create `agents/order/index.js`.

**Verify:**
- Run StrategyAgent in test mode (`mode: 'test'`). Confirm signals appear on
  `redis-cli SUBSCRIBE evt:strategy:signal`.
- Run OrderAgent alongside. Confirm it consumes signals and does NOT call Tradovate
  API in test mode (existing `if (config.get('mode') != 'test')` guard preserved).

---

### Phase 5 — FrontendAgent (Week 6)

**Goal:** Decouple the HTTP/WebSocket server from all other agents.

Tasks:
1. Create `agents/frontend/index.js` — combines `server-frontend.js` and `server-uws.js`.
2. Update `agents/frontend/websocket/configure.js`:
   - Replace `PubSub.subscribe('frontend-notification', ...)` with Redis sub on `evt:notification`
   - Replace `PubSub.subscribe('price-tick', ...)` with Redis sub on `evt:strategy:price-tick`
   - Replace `PubSub.subscribe('price-update', ...)` with Redis sub on `evt:strategy:price-update`
   - Replace `PubSub.publish('reset-all-websockets', ...)` — WS `setting-update` command now
     publishes `cmd:config:save-global` to Redis instead of calling `saveGlobalConfiguration` directly
3. Update `agents/frontend/uws/configure.js`:
   - Replace `PubSub.subscribe('frontend-notification', ...)` with Redis sub on `evt:notification`
4. Move all REST API handlers to `agents/frontend/webserver/handlers/api/` unchanged.
   These handlers only read from PostgreSQL and Redis — no PubSub dependency.

**Verify:**
- Start FrontendAgent alone. Hit `/api/dashboard/summary`. Should return data from PostgreSQL.
- Connect a browser WebSocket client. Manually publish `redis-cli PUBLISH evt:notification '{"v":1,"ts":1713300000000,"src":"test","data":{"type":"info","title":"hello"}}'`.
  Browser client should receive the notification.

---

### Phase 6 — Cutover and Monolith Retirement (Week 7)

**Goal:** Switch production traffic from `app/server.js` to the six independent agents.

Tasks:
1. Update `docker-compose.yml` (or process manager config) to run six separate processes:
   ```
   node agents/market-data/index.js
   node agents/strategy/index.js
   node agents/order/index.js
   node agents/config/index.js
   node agents/notification/index.js
   node agents/frontend/index.js
   ```
2. Set each process to restart on failure independently (PM2 `ecosystem.config.js` or
   Docker Compose `restart: unless-stopped`).
3. Remove `app/server.js` from the startup command.
4. Keep `app/` directory intact for rollback (see Rollback Plan below).
5. Monitor for 48 hours: check that all six processes stay up independently, that
   signals flow from StrategyAgent → OrderAgent → NotificationAgent → FrontendAgent.

---

## Regression Checklist

Before declaring Phase 6 complete, verify each item:

- [ ] TradingView chart sessions connect and produce candle bars
- [ ] WMA-11, WMA-48, WMA-200, RSI-9, ATR-14, MACD indicators compute correctly
- [ ] CALL signal published to `evt:strategy:signal` when buy conditions met
- [ ] PUT signal published when sell conditions met
- [ ] EXIT/STOPLOSS signal published correctly
- [ ] OrderAgent receives signal, places order via Tradovate HTTP API (live/demo mode)
- [ ] OrderAgent writes `orders` table on entry and updates on exit
- [ ] `orders` table `status` transitions: open → closed
- [ ] `evt:order:placed` and `evt:order:closed` received by NotificationAgent
- [ ] Slack message sent on order events (when `slack.enabled: true`)
- [ ] FrontendAgent receives `evt:notification` and forwards to browser WS clients
- [ ] FrontendAgent receives `evt:strategy:price-tick` and broadcasts to browser
- [ ] `/api/dashboard/summary` returns correct balance, open count, daily P&L
- [ ] `/api/positions` lists open orders from PostgreSQL
- [ ] `/api/trades` lists closed orders with pagination
- [ ] `/api/logs` returns recent log entries
- [ ] `/api/strategy` GET and PUT work (reads/writes `trailing_trade_common`)
- [ ] Browser WebSocket `latest` command returns current symbol state
- [ ] Browser WebSocket `setting-update` triggers ConfigAgent save and `cmd:config:updated` broadcast
- [ ] StrategyAgent re-reads config after `cmd:config:updated`
- [ ] Alive cron fires at `09:00` and logs health status
- [ ] Log cleanup runs and removes entries older than `botOptions.logs.deleteAfter` minutes
- [ ] Token refresh works when Tradovate token expires
- [ ] MarketDataAgent auto-reconnects WebSocket after simulated disconnect
- [ ] Rate limiter (`login:*` Redis keys) blocks IPs correctly in FrontendAgent
- [ ] JWT authentication still works across FrontendAgent restarts (secret persisted in Redis)
- [ ] Killing StrategyAgent process does not crash OrderAgent or FrontendAgent
- [ ] Killing OrderAgent process does not crash StrategyAgent or FrontendAgent
- [ ] Killing MarketDataAgent process does not crash StrategyAgent (stale data mode)
- [ ] Bull Board at `/bull-board` shows symbol queues from StrategyAgent

---

## Rollback Plan

The `app/` directory is never modified during Phases 1–6. The monolith in
`app/server.js` is only removed from the startup command in Phase 6.

**Immediate rollback (< 5 minutes):**
1. Revert `docker-compose.yml` (or PM2 config) to start `node app/server.js`
2. Restart. The monolith reads from the same PostgreSQL and Redis that the agents
   wrote to. All data is compatible because:
   - Agent Redis key namespaces (`mda:*`, `order:*`, `config:*`) are additive.
     The monolith's old key names still exist in Redis and are read by the monolith.
   - PostgreSQL table schema is unchanged — agents write to the same tables with
     the same column structure.
   - The monolith's `pubsub-js` events are simply not published during agent operation;
     on rollback they resume immediately.

**Redis key compatibility note:** During Phase 3, MarketDataAgent writes `mda:token`
instead of the monolith's `tradovate-api-access-token`. The migration script in Phase 3
should copy the existing token to the new key at startup:
```javascript
const old = await cache.get('tradovate-api-access-token');
if (old) await cache.set('mda:token', old);
```
This ensures rollback does not require a fresh Tradovate login.

**State recovery after rollback:** The `orders` table is the source of truth for all
open positions. Both the monolith and OrderAgent write to it using the same schema.
No reconciliation is needed.

---

## Key Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Signal lost while OrderAgent is down | Missed trade entry/exit | Phase 3 enhancement: use a Redis Stream (`XADD`/`XREADGROUP`) for `evt:strategy:signal` so OrderAgent can replay missed signals on restart. Not required for Phase 1. |
| Redis pub/sub message dropped (Redis restart) | Same as above | Same mitigation. Redis Streams provide persistence; pub/sub does not. |
| StrategyAgent module-level state corruption (candle arrays) | Wrong indicator values | These variables are already confined to one process. Moving to isolated process makes this safer, not worse. |
| TradingView session limit | Strategy disconnect | Existing `onError` + reconnect logic preserved unchanged. |
| PostgreSQL pool exhaustion with 6 agents | Query timeouts | Each agent gets a smaller pool. Current config: `maxConnections: 10`. Set to 3 per agent (6×3=18 total, within default PostgreSQL `max_connections: 100`). |
| Config cache stale after ConfigAgent restart | Strategy uses old config | All agents cache config in Redis with no TTL. ConfigAgent publishes `cmd:config:updated` on startup to force re-read. |
