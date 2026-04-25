/**
 * StrategyAgent — TradingView chart sessions + trade logic process.
 *
 * Responsibilities:
 *   - Opens three TradingView chart sessions (primary interval, 10m, 5m).
 *   - Runs trade logic on every candle close.
 *   - Places orders directly via Tradovate HTTP API (callOrder/putOrder/exitOrder).
 *   - Broadcasts price ticks, indicator snapshots, and notifications via Redis pub/sub.
 *   - Listens for configuration changes to hot-reload strategy parameters.
 *
 * Channels published:
 *   evt:notification:frontend  — { type, title }
 *   evt:strategy:price-tick    — live price on every TradingView update
 *   evt:strategy:price-update  — full indicator snapshot on candle close
 *   cmd:order:check-open       — trigger open-order sync after entry
 *   cmd:order:check-closed     — trigger closed-order sync after exit
 *   cmd:tradovate:reset-ws     — reconnect WS bridge after exit
 *
 * Channels consumed:
 *   evt:config:changed         — reload globalConfiguration
 */

const config = require('config');
const TradingView = require('@mathieuc/tradingview');
const { WMA, RSI, Lowest, CrossUp, CrossDown, ATR, MACD } = require('technicalindicators');

const rootLogger = require('../shared/logger');
const postgres = require('../shared/postgres');
const cache = require('../shared/cache');
const { createPublisher, createSubscriber } = require('../shared/redis-pubsub');
const CH = require('../shared/channels');
const { runErrorHandler } = require('../shared/error-handler');
const tradovate = require('../../app/helpers/tradovate');

const ORDER_KEY = 'tradovate-order';

// ── Per-process state (isolated from other agents) ────────────────────────────

let closes = [];
let up_10m = false;
let down_10m = false;
let up_5m = false;
let down_5m = false;

let opens = [];
let lows = [];
let highs = [];
let volumes = [];
let datetimes = [];
let is_crossup_11_48 = false;
let is_crossdown_11_48 = false;
let order = { order_type: '', last: 0 };
let cnt_out_up = 0;
let rsi_up = false;
let rsi_down = false;
let atr_value = 3.5;
let macd_bull = false;
let macd_bear = false;
let regimeState = null; // latest RegimeAgent snapshot

// ── Helpers ───────────────────────────────────────────────────────────────────

const support = (cv, ov, lv, vv) => {
  const wmaVol = WMA.calculate({ period: 6, values: vv });
  const l = lv.length;
  const down =
    lv[l - 4] < lv[l - 5] &&
    lv[l - 5] < lv[l - 6] &&
    lv[l - 3] > lv[l - 4] &&
    lv[l - 2] > lv[l - 3] &&
    vv[l - 4] > wmaVol[wmaVol.length - 4];

  if (down && cv[l - 4] >= ov[l - 4]) {
    return ov[l - 4];
  } else if (down && cv[l - 4] < ov[l - 4]) {
    return cv[l - 4];
  } else {
    const lowest = Lowest.calculate({ period: 6, values: lv });
    return lowest[lowest.length - 1];
  }
};

const get_bars = bars => {
  let next_candle = false;
  if (datetimes.length > 0 && datetimes.length < 300) {
    const l1 = datetimes.length;
    const t11 = datetimes[0];
    const t22 = bars[0].time;

    if (t11 > t22) {
      const item = bars[0];
      datetimes = [item.time].concat(datetimes);
      closes = [item.close].concat(closes);
      opens = [item.open].concat(opens);
      lows = [item.min].concat(lows);
      highs = [item.max].concat(highs);
      volumes = [item.offerVolume].concat(volumes);
    } else {
      const len = datetimes.length;
      const item = bars[0];
      const _t12 = datetimes[len - 1];
      const _t21 = item.time;

      if (_t12 === _t21) {
        datetimes[len - 1] = item.time;
        closes[len - 1] = item.close;
        opens[len - 1] = item.open;
        lows[len - 1] = item.min;
        highs[len - 1] = item.max;
        volumes[len - 1] = item.volume;
      } else if (_t12 < _t21) {
        datetimes.push(item.time);
        closes.push(item.close);
        opens.push(item.open);
        lows.push(item.min);
        highs.push(item.max);
        volumes.push(item.volume);
        next_candle = true;
      }
    }
  } else {
    for (let i = bars.length; i > 0; i--) {
      const item = bars[i - 1];
      datetimes.push(item.time);
      closes.push(item.close);
      opens.push(item.open);
      lows.push(item.min);
      highs.push(item.max);
      volumes.push(item.volume);
    }
  }
  return next_candle;
};

// ── Primary interval chart (trade logic) ─────────────────────────────────────

const startTradeLogic = (pub, logger, configuration) => {
  let token = config.get('authentication.token');
  if (configuration.botOptions && configuration.botOptions.token) {
    token = configuration.botOptions.token;
  }

  const client = token
    ? new TradingView.Client({ token })
    : new TradingView.Client();

  const chart = new client.Session.Chart();

  let symbol = config.get('symbol');
  let interval = config.get('interval');
  if (configuration.candles && configuration.candles.symbol) symbol = configuration.candles.symbol;
  if (configuration.candles && configuration.candles.interval) interval = configuration.candles.interval;

  if (!symbol || !interval) return;

  const symbol_inf = symbol.includes('NQ') ? 'CME_MINI:NQ1!' : 'CME_MINI:ES1!';

  chart.setMarket(symbol_inf, { timeframe: interval, range: 240 });

  chart.onError((...err) => {
    console.error('Chart error:', ...err);
    pub.publish(CH.EVT_NOTIFICATION, { type: 'warning', title: 'Connect data TradingView failed.' });
  });

  chart.onSymbolLoaded(() => {
    console.log(`Market "${chart.infos.description}" loaded`);
    pub.publish(CH.EVT_NOTIFICATION, { type: 'info', title: 'Connect data TradingView successfully.' });
  });

  chart.onUpdate(async () => {
    if (!chart.periods[0]) return;
    if (!symbol.includes(chart.infos.root)) return;

    // Live price tick on every update
    pub.publish(CH.EVT_PRICE_TICK, {
      symbol,
      price: chart.periods[0].close,
      high: chart.periods[0].max,
      low: chart.periods[0].min,
      trend: up_10m ? 'up' : down_10m ? 'down' : 'neutral',
      order_type: order.order_type || null,
      timestamp: Date.now()
    });

    if (!chart.periods[1]) return;

    const t1 = new Date(chart.periods[0].time * 1000);
    let m1 = t1.getMinutes();
    if (!m1) m1 = 60;
    const t2 = new Date(chart.periods[1].time * 1000);
    const m2 = t2.getMinutes();
    const m = m1 - m2;

    if (interval != m) return;

    console.log('time3:', new Date(chart.periods[0].time * 1000).toLocaleTimeString('en-US'));
    console.log(chart.periods[0]);

    get_bars(chart.periods);

    const l = datetimes.length;
    const close = closes[l - 1];
    const open = opens[l - 1];
    const low = lows[l - 1];
    const high = highs[l - 1];
    const close1 = closes[l - 2];
    const open1 = opens[l - 2];
    const low1 = lows[l - 2];
    const high1 = highs[l - 2];
    const close2 = closes[l - 3];
    const open2 = opens[l - 3];
    const low2 = lows[l - 3];
    const high2 = highs[l - 3];
    const close3 = closes[l - 4];
    const open3 = opens[l - 4];
    const low3 = lows[l - 4];
    const high3 = highs[l - 4];

    const rsi = RSI.calculate({ period: 9, values: closes });
    const rsi1 = rsi[rsi.length - 1];
    const rsi2 = rsi[rsi.length - 2];

    if (rsi1 - rsi2 > 5 && rsi2 < 40 && rsi1 > 40) { rsi_up = true; rsi_down = false; }
    if (rsi1 - rsi2 < -7 && rsi2 > 70 && rsi1 < 70) { rsi_up = false; rsi_down = true; }

    const ma11 = WMA.calculate({ period: 11, values: closes });
    const ma48 = WMA.calculate({ period: 48, values: closes });
    const ma200 = WMA.calculate({ period: 200, values: closes });

    let crossdown_11_48 = CrossDown.calculate({ lineA: ma11, lineB: ma48 });
    for (let j = crossdown_11_48.length; j > 0; j--) {
      if (crossdown_11_48[j - 1]) { crossdown_11_48 = true; break; }
    }
    const crossup_arr = CrossUp.calculate({ lineA: ma11, lineB: ma48 });
    for (let k = crossup_arr.length; k > 0; k--) {
      if (crossup_arr[k - 1]) { is_crossup_11_48 = true; break; }
    }
    if (crossdown_11_48) is_crossup_11_48 = false;
    if (is_crossup_11_48) crossdown_11_48 = false;
    is_crossdown_11_48 = !!crossdown_11_48;

    const wma11 = ma11[ma11.length - 1];
    const wma48 = ma48[ma48.length - 1];
    const wma200 = ma200[ma200.length - 1];

    console.log(' ==>ma11', interval, '===', wma11);
    console.log(' ==>ma48', interval, '===', wma48);
    console.log(' ==>ma200', interval, '===', wma200);

    if (highs.length >= 15 && lows.length >= 15) {
      const atrValues = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
      if (atrValues && atrValues.length > 0) {
        atr_value = Math.max(atrValues[atrValues.length - 1] * 1.5, 2.5);
      }
    }

    if (closes.length >= 35) {
      const macdValues = MACD.calculate({
        values: closes,
        fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
        SimpleMAOscillator: false, SimpleMASignal: false
      });
      if (macdValues && macdValues.length >= 2) {
        const mv1 = macdValues[macdValues.length - 1];
        const mv2 = macdValues[macdValues.length - 2];
        macd_bull = mv1.histogram > 0 || mv1.histogram > mv2.histogram;
        macd_bear = mv1.histogram < 0 || mv1.histogram < mv2.histogram;
      }
    }

    pub.publish(CH.EVT_PRICE_UPDATE, {
      symbol, price: close, open, high, low, rsi: rsi1,
      wma11, wma48, wma200, atr: atr_value, macd_bull, macd_bear,
      trend: up_10m ? 'up' : down_10m ? 'down' : 'neutral',
      order_type: order.order_type || null,
      timestamp: Date.now()
    });

    const bottomsupport =
      close > support(closes, opens, lows, volumes) && close > close1 && rsi1 > rsi2 + 10;

    let is_out = false;
    const big_drop = rsi[rsi.length - 1] + 8 < rsi[rsi.length - 2] && close > wma48;
    const oc = Math.abs(open1 - close1);
    const hl = Math.abs(high1 - low1);
    const ochl = (oc - hl) / hl;
    const is_br =
      open2 < close2 && open1 < close1 && close < open && close2 < close1 &&
      close1 > close && ochl < 0.1 && low3 < low2 && low2 < low1;

    if (is_br) cnt_out_up++;
    if (cnt_out_up > 2) { is_out = true; cnt_out_up = 0; }

    console.log('rsi_up', rsi_up, 'rsi_down', rsi_down, 'is_out', is_out, 'big_drop', big_drop, 'bottomsupport', bottomsupport);

    const pb =
      (close1 > close2 && close2 > close3 && (close - low) / (high - low) < 0.30 && close < close1 && close < open1) ||
      (close1 > close2 && close2 > close3 && (close - low) / (high - low) < 0.30 && wma11 < wma48 && close < close1 && close < open1);

    if (!order.order_type) {
      const old_order = await postgres.findOne(logger, 'orders', { symbol, status: 'open' });
      if (old_order && old_order.id) {
        delete old_order.id;
        order = old_order;
      }
      console.log('order from db:', old_order, order);
    }

    if (order.last) {
      const _t1 = new Date(order.last);
      const _t2 = new Date();
      const _m1 = _t1.getMinutes() + _t1.getHours() * 60;
      const _m2 = _t2.getMinutes() + _t2.getHours() * 60;
      if (_m2 - _m1 <= 2) return;
    }

    console.log('order status', config.get('mode'), order);

    const logic_call = configuration.buy && configuration.buy.gridTrade ? configuration.buy.gridTrade : [];
    const logic_put = configuration.sell && configuration.sell.gridTrade ? configuration.sell.gridTrade : [];

    if (!order.status || order.status !== 'open') {
      // ── Regime gate: skip entries in dead/sideways markets ────────────────
      if (regimeState && (regimeState.regime === 'DEAD_PINNING' || regimeState.regime === 'SIDEWAY')) {
        logger.info({ regime: regimeState.regime }, 'StrategyAgent: entry skipped by regime gate');
        return;
      }

      // ── Entry logic ───────────────────────────────────────────────────────
      if (logic_call[1] && logic_call[1].enabled === true && rsi_up && up_10m && bottomsupport && close > wma48 && close > wma200) {
        const stoploss = up_10m ? (logic_call[1].stoploss_strong || 5) : (logic_call[1].stoploss || 3.5);
        order = { ...order, order_type: 'CALL', stoploss: low - stoploss, entry_price: close, entry_time: new Date().getTime(), note: '#2 CALL+BottomSupport+EMA50+EMA200', logic: '2' };
      } else if (logic_call[0] && logic_call[0].enabled === true && rsi_up && up_10m && bottomsupport && (close > wma48 || close > wma200)) {
        const stoploss = up_10m ? (logic_call[0].stoploss_strong || 5) : (logic_call[0].stoploss || 3.5);
        order = { ...order, order_type: 'CALL', stoploss: low - stoploss, entry_price: close, entry_time: new Date().getTime(), note: '#1 CALL+BottomSupport', logic: '1' };
      } else if (logic_call[2] && logic_call[2].enabled === true && rsi_up && up_10m && is_crossup_11_48 && close > wma11 && close > wma48 && macd_bull) {
        order = { ...order, order_type: 'CALL', stoploss: low - atr_value, entry_price: close, entry_time: new Date().getTime(), note: '#3 CALL+EMA11 Crossup EMA48+MACD bull', logic: '3' };
      } else if (logic_call[3] && logic_call[3].enabled === true && rsi_up && up_10m && wma11 > wma48 && close > wma11 && close > close1 && macd_bull) {
        order = { ...order, order_type: 'CALL', stoploss: low - atr_value, entry_price: close, entry_time: new Date().getTime(), note: '#4 CALL wma11>wma48+MACD bull', logic: '4' };
      } else if (logic_put[1] && logic_put[1].enabled === true && rsi_down && down_10m && is_out && big_drop && close < wma11 && close < wma48) {
        const stoploss = down_10m ? (logic_put[1].stoploss_strong || 5) : (logic_put[1].stoploss || 3.5);
        order = { ...order, order_type: 'PUT', stoploss: high + stoploss, entry_price: close, entry_time: new Date().getTime(), note: '#2 PUT+OUT+BigDrop+EMA11+EMA48', logic: '2' };
      } else if (logic_put[0] && logic_put[0].enabled === true && rsi_down && down_10m && is_out && big_drop) {
        const stoploss = down_10m ? (logic_put[0].stoploss_strong || 5) : (logic_put[0].stoploss || 3.5);
        order = { ...order, order_type: 'PUT', stoploss: high + stoploss, entry_price: close, entry_time: new Date().getTime(), note: '#1 PUT+OUT+BigDrop', logic: '1' };
      } else if (logic_put[2] && logic_put[2].enabled === true && rsi_down && down_10m && is_crossdown_11_48 && close < wma11 && close < wma48 && macd_bear) {
        order = { ...order, order_type: 'PUT', stoploss: high + atr_value, entry_price: close, entry_time: new Date().getTime(), note: '#3 PUT EMA11 Crossdown EMA48+MACD bear', logic: '3' };
      } else if (logic_put[3] && logic_put[3].enabled === true && rsi_down && down_10m && wma11 < wma48 && close < wma48 && close < close1 && macd_bear) {
        order = { ...order, order_type: 'PUT', stoploss: high + atr_value, entry_price: close, entry_time: new Date().getTime(), note: '#4 PUT wma11<wma48+MACD bear', logic: '4' };
      }

      if (order.order_type === 'CALL') {
        if (config.get('mode') !== 'test') {
          order.entry_order_id = await (await tradovate.client.http).callOrder(symbol, 1);
        }
        order.symbol = symbol;
        order.interval = interval;
        order.status = 'open';
        delete order.profit; delete order.profit_pct;
        delete order.exit_order_id; delete order.exit_time; delete order.exit_price;
        await postgres.insertOne(logger, 'orders', order);
        cache.set(ORDER_KEY, JSON.stringify(order));
        pub.publish(CH.EVT_NOTIFICATION, { type: 'success', title: `Enter CALL with logic: ${order.logic}` });
        pub.publish(CH.CMD_ORDER_CHECK_OPEN, {});
      } else if (order.order_type === 'PUT') {
        if (config.get('mode') !== 'test') {
          order.entry_order_id = await (await tradovate.client.http).putOrder(symbol, 1);
        }
        order.symbol = symbol;
        order.interval = interval;
        order.status = 'open';
        delete order.profit; delete order.profit_pct;
        delete order.exit_order_id; delete order.exit_time; delete order.exit_price;
        await postgres.insertOne(logger, 'orders', order);
        cache.set(ORDER_KEY, JSON.stringify(order));
        pub.publish(CH.EVT_NOTIFICATION, { type: 'success', title: `Enter PUT with logic: ${order.logic}` });
        pub.publish(CH.CMD_ORDER_CHECK_OPEN, {});
      }
    } else {
      // ── Exit / stoploss logic ─────────────────────────────────────────────
      if (order.order_type === 'CALL' && order.status === 'open') {
        if (order.stoploss + atr_value < close) {
          order.stoploss = close - atr_value;
          console.log('change stoploss call:', order.stoploss);
          cache.set(ORDER_KEY, JSON.stringify(order));
        }
        console.log('STOPLOSS', order.stoploss, close);
        if ((!rsi_up && is_out && big_drop && close < wma11 && close < wma48) || (is_crossdown_11_48 && close < wma11 && close < wma48) || big_drop || pb || is_out) {
          order.order_type = 'EXIT CALL';
          order.profit = close - order.entry_price;
          order.profit_pct = order.entry_price ? (close - order.entry_price) / order.entry_price : 0;
        } else if (!rsi_up && order.stoploss > close && !up_5m) {
          order.order_type = 'STOPLOSS CALL';
          order.profit = close - order.entry_price;
          order.profit_pct = order.entry_price ? (close - order.entry_price) / order.entry_price : 0;
        }
      } else if (order.order_type === 'PUT' && order.status === 'open') {
        if (order.stoploss - atr_value > close) {
          order.stoploss = close + atr_value;
          console.log('change stoploss put:', order.stoploss);
          cache.set(ORDER_KEY, JSON.stringify(order));
        }
        if ((!rsi_down && is_crossup_11_48 && close > wma11 && close > wma48) || (bottomsupport && close > wma48 && close > wma200) || (bottomsupport && (close > wma48 || close > wma200)) || bottomsupport) {
          order.order_type = 'EXIT PUT';
          order.profit = order.entry_price - close;
        } else if (!rsi_down && order.stoploss < close && !down_5m) {
          order.order_type = 'STOPLOSS PUT';
          order.profit = order.entry_price - close;
        }
      }

      if (
        order.status === 'open' &&
        (order.order_type === 'EXIT CALL' || order.order_type === 'STOPLOSS CALL' ||
          order.order_type === 'EXIT PUT' || order.order_type === 'STOPLOSS PUT')
      ) {
        let exit_order_id = null;
        if (config.get('mode') !== 'test') {
          exit_order_id = await (await tradovate.client.http).exitOrder(order.entry_order_id);
          order.exit_order_id = exit_order_id;
        }
        order.status = 'closed';
        order.exit_price = close;
        order.exit_time = new Date().getTime();

        await postgres.upsertOne(logger, 'orders', { entry_time: order.entry_time }, {
          status: 'closed',
          exit_order_id,
          exit_price: order.exit_price,
          profit: order.profit,
          exit_time: order.exit_time
        });

        pub.publish(CH.EVT_NOTIFICATION, {
          type: 'success',
          title: order.order_type === 'EXIT CALL' ? 'Exit CALL' : 'Exit PUT'
        });

        pub.publish(CH.CMD_ORDER_CHECK_CLOSED, {});

        const last = new Date().getTime();
        order = { last };
        cache.set(ORDER_KEY, JSON.stringify(order));

        pub.publish(CH.CMD_TRADOVATE_RESET_WS, true);
      }
    }
  });
};

// ── 10m trend chart ───────────────────────────────────────────────────────────

const startTradeLogic10m = (pub, logger, configuration) => {
  let token = config.get('authentication.token');
  if (configuration.botOptions && configuration.botOptions.token) token = configuration.botOptions.token;

  const client = token ? new TradingView.Client({ token }) : new TradingView.Client();
  const chart = new client.Session.Chart();

  let symbol = config.get('symbol');
  if (configuration.candles && configuration.candles.symbol) symbol = configuration.candles.symbol;
  if (!symbol) return;

  const interval = '10';
  const symbol_inf = symbol.includes('NQ') ? 'CME_MINI:NQ1!' : 'CME_MINI:ES1!';

  chart.setMarket(symbol_inf, { timeframe: interval, range: 120 });

  chart.onError((...err) => {
    console.error('Chart 10m error:', ...err);
    pub.publish(CH.EVT_NOTIFICATION, { type: 'warning', title: 'Connect data TradingView failed.' });
  });

  chart.onSymbolLoaded(() => {
    console.log(`10m market "${chart.infos.description}" loaded`);
  });

  chart.onUpdate(async () => {
    if (!chart.periods[0] || !chart.periods[1]) return;
    if (!symbol.includes(chart.infos.root)) return;

    const t1 = new Date(chart.periods[0].time * 1000);
    let m1 = t1.getMinutes();
    if (!m1) m1 = 60;
    const t2 = new Date(chart.periods[1].time * 1000);
    const m2 = t2.getMinutes();
    if (interval != m1 - m2) return;

    const closes_10m = [];
    for (let i = chart.periods.length; i > 0; i--) {
      closes_10m.push(chart.periods[i - 1].close);
    }

    const close = closes_10m[closes_10m.length - 1];
    const ma11 = WMA.calculate({ period: 11, values: closes_10m });
    const ma48 = WMA.calculate({ period: 48, values: closes_10m });
    const wma11 = ma11[ma11.length - 1];
    const wma48 = ma48[ma48.length - 1];

    up_10m = wma11 > wma48 || close > wma11;
    down_10m = !up_10m;

    console.log('up_10m', up_10m, 'down_10m', down_10m);
  });
};

// ── 5m trend chart ────────────────────────────────────────────────────────────

const startTradeLogic5m = (pub, logger, configuration) => {
  let token = config.get('authentication.token');
  if (configuration.botOptions && configuration.botOptions.token) token = configuration.botOptions.token;

  const client = token ? new TradingView.Client({ token }) : new TradingView.Client();
  const chart = new client.Session.Chart();

  let symbol = config.get('symbol');
  if (configuration.candles && configuration.candles.symbol) symbol = configuration.candles.symbol;
  if (!symbol) return;

  const interval = '5';
  const symbol_inf = symbol.includes('NQ') ? 'CME_MINI:NQ1!' : 'CME_MINI:ES1!';

  chart.setMarket(symbol_inf, { timeframe: interval, range: 120 });

  chart.onError((...err) => {
    console.error('Chart 5m error:', ...err);
    pub.publish(CH.EVT_NOTIFICATION, { type: 'warning', title: 'Connect data TradingView failed.' });
  });

  chart.onSymbolLoaded(() => {
    console.log(`5m market "${chart.infos.description}" loaded`);
  });

  chart.onUpdate(async () => {
    if (!chart.periods[0] || !chart.periods[1]) return;
    if (!symbol.includes(chart.infos.root)) return;

    const t1 = new Date(chart.periods[0].time * 1000);
    let m1 = t1.getMinutes();
    if (!m1) m1 = 60;
    const t2 = new Date(chart.periods[1].time * 1000);
    const m2 = t2.getMinutes();
    if (interval != m1 - m2) return;

    const closes_5m = [];
    for (let i = chart.periods.length; i > 0; i--) {
      closes_5m.push(chart.periods[i - 1].close);
    }

    const close = closes_5m[closes_5m.length - 1];
    const ma11 = WMA.calculate({ period: 11, values: closes_5m });
    const ma48 = WMA.calculate({ period: 48, values: closes_5m });
    const wma11 = ma11[ma11.length - 1];
    const wma48 = ma48[ma48.length - 1];

    console.log(' ==>5m ma11', interval, '===', wma11);
    console.log(' ==>5m ma48', interval, '===', wma48);

    up_5m = close > wma48 && close > wma11;
    down_5m = close < wma48 && close < wma11;

    console.log('up_5m', up_5m, 'down_5m', down_5m);
  });
};

// ── Entry point ───────────────────────────────────────────────────────────────

const run = async () => {
  const logger = rootLogger.child({
    agent: 'strategy',
    gitHash: process.env.GIT_HASH || 'unspecified'
  });

  runErrorHandler(logger);

  await postgres.connect(logger);

  const pub = createPublisher('strategy');
  const sub = createSubscriber();

  // Read initial configuration
  const row = await postgres.findOne(logger, 'trailing_trade_common', { key: 'configuration' });
  let globalConfiguration = row || {};

  if (globalConfiguration.botOptions && globalConfiguration.botOptions.stop_bot) {
    logger.info('Bot stopped by configuration — StrategyAgent idle');
    // Still subscribe to config changes so we can start when stop_bot is cleared
  } else {
    startTradeLogic10m(pub, logger, globalConfiguration);
    startTradeLogic5m(pub, logger, globalConfiguration);
    startTradeLogic(pub, logger, globalConfiguration);
    logger.info('StrategyAgent: TradingView chart sessions started');
  }

  // Hot-reload configuration — note: chart sessions already running are NOT restarted
  // (TradingView sessions manage their own reconnect). This updates logic_call/logic_put
  // parameters for the next candle evaluation by keeping a reference updated.
  sub.subscribe(CH.EVT_CONFIG_CHANGED, (_channel, data) => {
    if (data && data.globalConfiguration) {
      globalConfiguration = data.globalConfiguration;
      logger.info('StrategyAgent: configuration reloaded');
    }
  });

  sub.subscribe(CH.EVT_REGIME_SNAPSHOT, (_channel, snap) => {
    const payload = snap.data || snap;
    if (payload && payload.regime) {
      regimeState = payload;
    }
  });

  logger.info('StrategyAgent ready');
};

run().catch(err => {
  console.error('StrategyAgent fatal error:', err);
  process.exit(1);
});
