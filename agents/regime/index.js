'use strict';

/**
 * RegimeAgent — Market regime classifier for ES/NQ futures
 *
 * Combines OrderFlow (CVD + pressure) and VolProfile (POC/VAH/VAL) to classify
 * the current market regime every 10 seconds.
 *
 * Regime values:
 *   DEAD_PINNING — near POC, extremely low flow; skip all entries
 *   SIDEWAY      — inside value area, low conviction; skip entries
 *   MIXED        — ambiguous signal; entries allowed with tighter risk
 *   ACTION       — moderate directional flow; entries allowed
 *   HARD_ACTION  — strong flow or price outside value area; prefer entries
 *
 * Publishes:
 *   evt:regime:snapshot — every 10 seconds per contract
 *   Payload: { contractId, regime, regimeHint, sessionPhase, pressure, slope, cvd,
 *              poc, vah, val, priceVsValueArea, ts }
 */

const { createSubscriber, createPublisher } = require('../shared/redis-pubsub');
const logger = require('../shared/logger');
const CH = require('../shared/channels');

const AGENT_NAME        = 'agent-regime';
const SNAPSHOT_INTERVAL = 10_000; // 10 seconds

// Regime thresholds
const PRESSURE_DEAD     = 0.04;  // |pressure| below this → dead market
const PRESSURE_ACTION   = 0.15;  // |pressure| above this → action
const PRESSURE_HARD     = 0.30;  // |pressure| above this → hard action
const SLOPE_DEAD        = 0.06;  // |slope| below this → dead market
const SLOPE_ACTION      = 0.12;  // |slope| above this → adds conviction
const POC_PROXIMITY_PCT = 0.003; // within 0.3% of POC → pinning

// ── Per-contract state ────────────────────────────────────────────────────────

function makeState() {
  return {
    flow: null,    // latest order-flow snapshot
    profile: null, // latest vol-profile snapshot
    price: null,   // latest mid price from quote
  };
}

// ── Regime classification ─────────────────────────────────────────────────────

function classifyRegime(price, flow, profile) {
  const { pressure, slope, cvd, regimeHint, sessionPhase } = flow;
  const { poc, vah, val } = profile;

  const absPressure = Math.abs(pressure);
  const absSlope    = Math.abs(slope);

  // Where is price relative to the value area?
  let priceVsValueArea;
  if (price > vah)      priceVsValueArea = 'ABOVE_VAH';
  else if (price < val) priceVsValueArea = 'BELOW_VAL';
  else                  priceVsValueArea = 'INSIDE_VA';

  const nearPOC = poc > 0 && Math.abs(price - poc) / poc < POC_PROXIMITY_PCT;

  let regime;

  if (absPressure < PRESSURE_DEAD && absSlope < SLOPE_DEAD) {
    regime = 'DEAD_PINNING';
  } else if (absPressure >= PRESSURE_HARD || (priceVsValueArea !== 'INSIDE_VA' && absPressure >= PRESSURE_ACTION)) {
    regime = 'HARD_ACTION';
  } else if (absPressure >= PRESSURE_ACTION || absSlope >= SLOPE_ACTION) {
    regime = 'ACTION';
  } else if (priceVsValueArea === 'INSIDE_VA' && absPressure < PRESSURE_ACTION) {
    regime = nearPOC ? 'DEAD_PINNING' : 'SIDEWAY';
  } else {
    regime = 'MIXED';
  }

  return {
    regime,
    regimeHint,
    sessionPhase,
    pressure,
    slope,
    cvd,
    poc,
    vah,
    val,
    priceVsValueArea,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const pub    = createPublisher(AGENT_NAME);
  const sub    = createSubscriber();
  const states = new Map(); // contractId → state

  function getState(contractId) {
    if (!states.has(contractId)) states.set(contractId, makeState());
    return states.get(contractId);
  }

  // Consume order-flow snapshots
  sub.subscribe([CH.EVT_ORDER_FLOW_SNAPSHOT], (_channel, envelope) => {
    const snap = envelope.data || envelope;
    if (!snap || !snap.contractId) return;
    const st = getState(snap.contractId);
    st.flow = snap;
  });

  // Consume vol-profile snapshots
  sub.subscribe([CH.EVT_VOL_PROFILE_SNAPSHOT], (_channel, envelope) => {
    const snap = envelope.data || envelope;
    if (!snap || !snap.contractId) return;
    const st = getState(snap.contractId);
    st.profile = snap;
  });

  // Track latest price from quotes
  sub.subscribe([CH.EVT_MD_QUOTE], (_channel, envelope) => {
    const quotes = (envelope.data || envelope);
    if (!Array.isArray(quotes)) return;
    for (const q of quotes) {
      if (!q.contractId) continue;
      const entries = q.entries || {};
      const tradeEntry = entries.Trade || entries.Bid || entries.Ask;
      if (!tradeEntry || !tradeEntry.price) continue;
      const st = getState(q.contractId);
      st.price = tradeEntry.price;
    }
  });

  // Publish regime snapshot every 10 seconds
  setInterval(() => {
    const ts = Date.now();
    for (const [contractId, st] of states.entries()) {
      if (!st.flow || !st.profile || st.price === null) continue;

      try {
        const result = classifyRegime(st.price, st.flow, st.profile);
        pub.publish(CH.EVT_REGIME_SNAPSHOT, {
          contractId,
          ...result,
          ts,
        });
      } catch (err) {
        logger.warn({ err, contractId }, 'RegimeAgent: classify error');
      }
    }
  }, SNAPSHOT_INTERVAL);

  logger.info({ agent: AGENT_NAME }, 'RegimeAgent started');
}

main().catch(err => {
  logger.error({ err }, 'RegimeAgent fatal error');
  process.exit(1);
});
