/**
 * Redis pub/sub channel name constants.
 *
 * All inter-agent communication uses these channels.
 *
 * Naming convention:
 *   evt:{domain}:{event}  — fire-and-forget event (any agent may listen)
 *   cmd:{domain}:{action} — directed command (specific agent handles it)
 */

const CH = {
  // ── Notification ──────────────────────────────────────────────────────────
  /** FrontendAgent broadcasts this to WebSocket clients */
  EVT_NOTIFICATION: 'evt:notification:frontend',

  // ── Strategy data feed ────────────────────────────────────────────────────
  /** Emitted on every TradingView candle update (before interval guard) */
  EVT_PRICE_TICK: 'evt:strategy:price-tick',
  /** Emitted on every confirmed candle close — includes full indicators */
  EVT_PRICE_UPDATE: 'evt:strategy:price-update',

  // ── Strategy signals ──────────────────────────────────────────────────────
  /** OrderAgent subscribes to this to execute / exit positions */
  EVT_STRATEGY_SIGNAL: 'evt:strategy:signal',

  // ── Order commands ────────────────────────────────────────────────────────
  CMD_ORDER_CHECK_OPEN: 'cmd:order:check-open',
  CMD_ORDER_CHECK_CLOSED: 'cmd:order:check-closed',

  // ── Tradovate / WebSocket commands ────────────────────────────────────────
  CMD_TRADOVATE_RESET_WS: 'cmd:tradovate:reset-ws',
  CMD_TRADOVATE_RECONNECT: 'cmd:tradovate:reconnect',

  // ── Tradovate entity events ───────────────────────────────────────────────
  EVT_TRADOVATE_WS_AUTHORIZED: 'evt:tradovate:ws-authorized',
  /** @param {string} type  Entity type e.g. 'order', 'fill', 'position' */
  EVT_TRADOVATE_ENTITY: type => `evt:tradovate:entity:${type}`,

  // ── Market data ───────────────────────────────────────────────────────────
  EVT_MD_QUOTE: 'evt:market-data:quote',
  EVT_MD_CHART: 'evt:market-data:chart',
  EVT_MD_DOM: 'evt:market-data:dom',

  // ── Order flow (CVD + Execution Pressure) ─────────────────────────────────
  /** Per-trade tick: { contractId, side, size, price, cvd, ts } */
  EVT_ORDER_FLOW_TICK: 'evt:order-flow:tick',
  /** 5-second snapshot: { contractId, cvd, pressure, regimeHint, sessionPhase, ts } */
  EVT_ORDER_FLOW_SNAPSHOT: 'evt:order-flow:snapshot',

  // ── Configuration ─────────────────────────────────────────────────────────
  EVT_CONFIG_CHANGED: 'evt:config:changed',
};

module.exports = CH;
