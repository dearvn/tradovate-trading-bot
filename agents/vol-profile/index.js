'use strict';

/**
 * VolProfileAgent — Real-time Volume Profile for ES/NQ futures
 *
 * Subscribes to evt:market-data:quote (raw Tradovate tick data) and builds
 * a live intraday volume profile per contract, reset each session at 09:30 ET.
 *
 * Computes:
 *   POC  — Point of Control: price level with the highest volume
 *   VAH  — Value Area High: upper edge of the zone containing 70% of volume
 *   VAL  — Value Area Low: lower edge of the zone containing 70% of volume
 *   HVN  — High Volume Nodes: levels with volume > mean + 1.0 stddev (support/resistance)
 *   LVN  — Low Volume Nodes: levels with volume < mean - 0.5 stddev (thin areas, fast moves)
 *
 * How to read output vs GEX equivalents:
 *   POC  ≈ Gamma Flip level  — price gravitates here in low-volatility sessions
 *   VAH  ≈ Call Wall         — upper resistance, sellers defend above value area
 *   VAL  ≈ Put Wall          — lower support, buyers defend below value area
 *   HVN  ≈ Gamma walls       — high liquidity nodes that slow price movement
 *   LVN  ≈ gaps in GEX       — thin areas where price moves fast, low resistance
 *
 * Publishes:
 *   evt:vol-profile:snapshot  — every 30 seconds per contract
 */

const { createSubscriber, createPublisher } = require('../shared/redis-pubsub');
const logger = require('../shared/logger');
const CH = require('../shared/channels');

const AGENT_NAME        = 'agent-vol-profile';
const SNAPSHOT_INTERVAL = 30_000;   // 30 seconds
const TICK_SIZE         = 0.25;     // ES/NQ minimum tick — price bins are this wide
const VALUE_AREA_PCT    = 0.70;     // standard 70% value area
const HVN_STDDEV_MULT   = 1.0;     // bins above mean + N*stddev → HVN
const LVN_STDDEV_MULT   = 0.5;     // bins below mean - N*stddev → LVN
const MAX_HVN           = 5;       // cap to avoid noise
const MAX_LVN           = 5;

// ── DST-aware Eastern Time (same as OrderFlowAgent) ──────────────────────────

function nthSundayUTC(year, month, n) {
  const d = new Date(Date.UTC(year, month, 1));
  const day = d.getUTCDay();
  d.setUTCDate(1 + ((7 - day) % 7) + (n - 1) * 7);
  return d;
}

function etOffsetHours(now) {
  const y = now.getUTCFullYear();
  const dstStart = nthSundayUTC(y, 2, 2);
  dstStart.setUTCHours(7);
  const dstEnd = nthSundayUTC(y, 10, 1);
  dstEnd.setUTCHours(6);
  return now >= dstStart && now < dstEnd ? -4 : -5;
}

function nowET() {
  const now = new Date();
  return new Date(now.getTime() + etOffsetHours(now) * 3_600_000);
}

function etDateStr(et) {
  return `${et.getUTCFullYear()}-${String(et.getUTCMonth() + 1).padStart(2, '0')}-${String(et.getUTCDate()).padStart(2, '0')}`;
}

function sessionPhaseMinutes(et) {
  return et.getUTCHours() * 60 + et.getUTCMinutes();
}

function isSessionOpen(et) {
  const m = sessionPhaseMinutes(et);
  return m >= 9 * 60 + 30 && m < 16 * 60;
}

// ── Price bin key ─────────────────────────────────────────────────────────────
// Round price to nearest TICK_SIZE to create a discrete histogram bin.

function binKey(price) {
  return Math.round(price / TICK_SIZE) * TICK_SIZE;
}

// ── Value Area calculation ────────────────────────────────────────────────────
// Starting from POC, expand outward one bin at a time (picking the higher-volume
// side each step) until 70% of total volume is captured.

function calcValueArea(bins, poc, totalVolume) {
  const prices  = Object.keys(bins).map(Number).sort((a, b) => a - b);
  const pocIdx  = prices.indexOf(poc);
  if (pocIdx === -1) return { vah: poc, val: poc };

  const target  = totalVolume * VALUE_AREA_PCT;
  let   covered = bins[poc];
  let   lo      = pocIdx;
  let   hi      = pocIdx;

  while (covered < target) {
    const upVol   = hi + 1 < prices.length  ? bins[prices[hi + 1]] || 0 : 0;
    const downVol = lo - 1 >= 0             ? bins[prices[lo - 1]] || 0 : 0;

    if (upVol === 0 && downVol === 0) break;

    if (upVol >= downVol) {
      hi++;
      covered += upVol;
    } else {
      lo--;
      covered += downVol;
    }
  }

  return { vah: prices[hi], val: prices[lo] };
}

// ── HVN / LVN detection ───────────────────────────────────────────────────────

function calcNodes(bins) {
  const volumes = Object.values(bins);
  if (volumes.length < 3) return { hvn: [], lvn: [] };

  const mean   = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const variance = volumes.reduce((s, v) => s + (v - mean) ** 2, 0) / volumes.length;
  const stddev = Math.sqrt(variance);

  const hvnThresh = mean + HVN_STDDEV_MULT * stddev;
  const lvnThresh = mean - LVN_STDDEV_MULT * stddev;

  const hvn = Object.entries(bins)
    .filter(([, v]) => v >= hvnThresh)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_HVN)
    .map(([p]) => Number(p))
    .sort((a, b) => a - b);

  const lvn = Object.entries(bins)
    .filter(([, v]) => v <= lvnThresh && v > 0)
    .sort((a, b) => a[1] - b[1])
    .slice(0, MAX_LVN)
    .map(([p]) => Number(p))
    .sort((a, b) => a - b);

  return { hvn, lvn };
}

// ── Per-contract state ────────────────────────────────────────────────────────

function makeState() {
  return {
    bins: {},           // { price: totalVolume }
    totalVolume: 0,
    sessionDate: null,  // 'YYYY-MM-DD' ET — resets at session open
  };
}

// ── Build snapshot payload ────────────────────────────────────────────────────

function buildSnapshot(contractId, st, ts) {
  const prices = Object.keys(st.bins).map(Number);
  if (prices.length === 0) return null;

  // POC = bin with highest volume
  const poc = prices.reduce((best, p) =>
    (st.bins[p] > (st.bins[best] || 0) ? p : best), prices[0]);

  const { vah, val } = calcValueArea(st.bins, poc, st.totalVolume);
  const { hvn, lvn } = calcNodes(st.bins);

  return {
    contractId,
    poc,
    vah,
    val,
    hvn,
    lvn,
    totalVolume: st.totalVolume,
    ts,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const pub    = createPublisher(AGENT_NAME);
  const sub    = createSubscriber();
  const states = new Map(); // contractId → state

  // Snapshot publisher — every 30 seconds
  setInterval(() => {
    const ts = Date.now();
    for (const [contractId, st] of states.entries()) {
      if (st.totalVolume === 0) continue;
      const snap = buildSnapshot(contractId, st, ts);
      if (snap) pub.publish(CH.EVT_VOL_PROFILE_SNAPSHOT, snap);
    }
  }, SNAPSHOT_INTERVAL);

  sub.subscribe([CH.EVT_MD_QUOTE], (channel, envelope) => {
    const quotes = envelope.data;
    if (!Array.isArray(quotes)) return;

    const et      = nowET();
    const todayET = etDateStr(et);
    const open    = isSessionOpen(et);

    for (const q of quotes) {
      const contractId = q.contractId;
      if (!contractId) continue;

      if (!states.has(contractId)) states.set(contractId, makeState());
      const st = states.get(contractId);

      // Reset at each new session (09:30 ET)
      if (st.sessionDate !== todayET && open) {
        st.bins        = {};
        st.totalVolume = 0;
        st.sessionDate = todayET;
        logger.info({ contractId, todayET }, 'VolProfile reset for new session');
      }

      // Only accumulate during regular session hours
      if (!open) continue;

      const entries = q.entries || {};
      if (!entries.Trade) continue;

      const price = entries.Trade.price;
      const size  = entries.Trade.size || 0;
      if (!price || size <= 0) continue;

      const bin = binKey(price);
      st.bins[bin]  = (st.bins[bin] || 0) + size;
      st.totalVolume += size;
    }
  });

  logger.info({ agent: AGENT_NAME }, 'VolProfileAgent started');
}

main().catch(err => {
  logger.error({ err }, 'VolProfileAgent fatal error');
  process.exit(1);
});
