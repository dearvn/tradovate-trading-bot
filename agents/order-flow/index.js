'use strict';

/**
 * OrderFlowAgent — CVD + Execution Pressure for ES/NQ futures
 *
 * Subscribes to evt:market-data:quote (raw Tradovate md/subscribeQuote frames)
 * and computes per-contract:
 *
 *   CVD (Cumulative Volume Delta)
 *     — running sum of (buyVol - sellVol) per aggressive trade tick
 *     — resets each session at 09:30 ET
 *
 *   Execution Pressure
 *     — 60-second sliding window: (sumBuy - sumSell) / (sumBuy + sumSell)
 *     — range [-1, +1]; positive = net buying pressure
 *
 *   regimeHint
 *     — EXPANDING_UP / EXPANDING_DOWN / PINNING / FLAT
 *     — derived from linear regression slope of CVD + current pressure
 *
 *   sessionPhase
 *     — OPEN / MORNING / LUNCH / AFTERNOON / POWER_HOUR / FINAL / CLOSED
 *     — based on Eastern Time clock
 *
 * Publishes:
 *   evt:order-flow:tick      — on every classified aggressive trade
 *   evt:order-flow:snapshot  — every 5 seconds per contract with data
 */

const { createSubscriber, createPublisher } = require('../shared/redis-pubsub');
const logger = require('../shared/logger');
const CH = require('../shared/channels');

const AGENT_NAME = 'agent-order-flow';
const SNAPSHOT_INTERVAL_MS = 5_000;
const PRESSURE_WINDOW_SEC = 60;
const CVD_HISTORY_LEN = 60;       // one entry per second for linreg
const CVD_UPDATE_INTERVAL_MS = 1_000;

// ── DST-aware Eastern Time helpers ────────────────────────────────────────────

function nthSundayUTC(year, month, n) {
  // month: 0-indexed JS month
  const d = new Date(Date.UTC(year, month, 1));
  const day = d.getUTCDay(); // 0=Sun
  d.setUTCDate(1 + ((7 - day) % 7) + (n - 1) * 7);
  return d;
}

function etOffsetHours(now) {
  const y = now.getUTCFullYear();
  // EDT: 2nd Sunday March 02:00 → 4th Sunday November 02:00
  const dstStart = nthSundayUTC(y, 2, 2); // March (month 2)
  dstStart.setUTCHours(7); // 02:00 ET = 07:00 UTC
  const dstEnd = nthSundayUTC(y, 10, 1); // November (month 10), 1st Sunday
  dstEnd.setUTCHours(6); // 02:00 ET = 06:00 UTC
  return now >= dstStart && now < dstEnd ? -4 : -5;
}

function nowET() {
  const now = new Date();
  const off = etOffsetHours(now);
  return new Date(now.getTime() + off * 3_600_000);
}

function etDateStr(et) {
  return `${et.getUTCFullYear()}-${String(et.getUTCMonth() + 1).padStart(2, '0')}-${String(et.getUTCDate()).padStart(2, '0')}`;
}

// ── Session phase ─────────────────────────────────────────────────────────────

function sessionPhase(etDate) {
  const h = etDate.getUTCHours();
  const m = etDate.getUTCMinutes();
  const mins = h * 60 + m;

  if (mins < 9 * 60 + 30)   return 'CLOSED';
  if (mins < 9 * 60 + 50)   return 'OPEN';
  if (mins < 11 * 60 + 30)  return 'MORNING';
  if (mins < 13 * 60)       return 'LUNCH';
  if (mins < 15 * 60)       return 'AFTERNOON';
  if (mins < 15 * 60 + 45)  return 'POWER_HOUR';
  if (mins < 16 * 60)       return 'FINAL';
  return 'CLOSED';
}

// ── Linear regression slope over an array ────────────────────────────────────

function linRegSlope(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX  += i;
    sumY  += arr[i];
    sumXY += i * arr[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

// ── regime hint ───────────────────────────────────────────────────────────────

function computeRegimeHint(slope, pressure) {
  if (slope > 0.3 && pressure > 0.15)   return 'EXPANDING_UP';
  if (slope < -0.3 && pressure < -0.15) return 'EXPANDING_DOWN';
  if (Math.abs(pressure) < 0.05 && Math.abs(slope) < 0.1) return 'PINNING';
  return 'FLAT';
}

// ── Per-contract state ────────────────────────────────────────────────────────

function makeContractState() {
  return {
    cvd: 0,
    cvdHistory: [],         // rolling array, pushed every CVD_UPDATE_INTERVAL_MS
    ticks: [],              // { ts, side, size } — for 60s pressure window
    lastBid: null,
    lastAsk: null,
    lastPrice: null,
    sessionDate: null,      // 'YYYY-MM-DD' in ET — resets CVD at session open
    lastCvdUpdate: 0,
  };
}

// ── Classify aggressive trade side ───────────────────────────────────────────

function classifyTrade(price, bid, ask) {
  if (bid === null || ask === null) return 'neutral';
  if (price >= ask) return 'buy';
  if (price <= bid) return 'sell';
  return 'neutral';
}

// ── Agent bootstrap ───────────────────────────────────────────────────────────

async function main() {
  const pub = createPublisher(AGENT_NAME);
  const sub = createSubscriber();
  const states = new Map(); // contractId → contractState

  // Snapshot timer — fires every 5 seconds
  setInterval(() => {
    const et = nowET();
    const phase = sessionPhase(et);
    const now = Date.now();

    for (const [contractId, st] of states.entries()) {
      if (st.cvd === 0 && st.ticks.length === 0) continue;

      // Prune stale ticks from pressure window
      const cutoff = now - PRESSURE_WINDOW_SEC * 1_000;
      while (st.ticks.length > 0 && st.ticks[0].ts < cutoff) st.ticks.shift();

      let sumBuy = 0, sumSell = 0;
      for (const t of st.ticks) {
        if (t.side === 'buy')  sumBuy  += t.size;
        if (t.side === 'sell') sumSell += t.size;
      }
      const total = sumBuy + sumSell;
      const pressure = total > 0 ? (sumBuy - sumSell) / total : 0;

      const slope = linRegSlope(st.cvdHistory);
      const regimeHint = computeRegimeHint(slope, pressure);

      pub.publish(CH.EVT_ORDER_FLOW_SNAPSHOT, {
        contractId,
        cvd: st.cvd,
        pressure: Math.round(pressure * 1000) / 1000,
        slope: Math.round(slope * 1000) / 1000,
        regimeHint,
        sessionPhase: phase,
        ts: now,
      });
    }
  }, SNAPSHOT_INTERVAL_MS);

  // CVD history sampler — 1 entry per second per contract
  setInterval(() => {
    const now = Date.now();
    for (const st of states.values()) {
      if (st.lastPrice === null) continue;
      st.cvdHistory.push(st.cvd);
      if (st.cvdHistory.length > CVD_HISTORY_LEN) st.cvdHistory.shift();
    }
  }, CVD_UPDATE_INTERVAL_MS);

  // Subscribe to raw Tradovate quote frames
  sub.subscribe([CH.EVT_MD_QUOTE], (channel, envelope) => {
    const quotes = envelope.data;
    if (!Array.isArray(quotes)) return;

    const et = nowET();
    const todayET = etDateStr(et);
    const now = Date.now();

    for (const q of quotes) {
      const contractId = q.contractId;
      if (!contractId) continue;

      if (!states.has(contractId)) states.set(contractId, makeContractState());
      const st = states.get(contractId);

      // Session reset at 09:30 ET
      if (st.sessionDate !== todayET && sessionPhase(et) !== 'CLOSED') {
        st.sessionDate = todayET;
        st.cvd = 0;
        st.cvdHistory = [];
        st.ticks = [];
        logger.info({ contractId, todayET }, 'CVD reset for new session');
      }

      const entries = q.entries || {};

      // Update best bid / ask
      if (entries.Bid) st.lastBid = entries.Bid.price;
      if (entries.Ask) st.lastAsk = entries.Ask.price;

      // Process trade tick
      if (entries.Trade && entries.Trade.price != null) {
        const price = entries.Trade.price;
        const size  = entries.Trade.size || 0;
        st.lastPrice = price;

        const side = classifyTrade(price, st.lastBid, st.lastAsk);
        if (side !== 'neutral' && size > 0) {
          const delta = side === 'buy' ? size : -size;
          st.cvd += delta;

          st.ticks.push({ ts: now, side, size });

          pub.publish(CH.EVT_ORDER_FLOW_TICK, {
            contractId,
            side,
            size,
            price,
            cvd: st.cvd,
            ts: now,
          });
        }
      }
    }
  });

  logger.info({ agent: AGENT_NAME }, 'OrderFlowAgent started');
}

main().catch(err => {
  logger.error({ err }, 'OrderFlowAgent fatal error');
  process.exit(1);
});
