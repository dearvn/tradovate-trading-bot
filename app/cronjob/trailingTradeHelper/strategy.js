const config = require('config');
const jwt = require('jsonwebtoken');
const _ = require('lodash');
const TradingView = require('@mathieuc/tradingview');

const { cache, mongo, PubSub, slack, tradovate } = require('../../helpers');

const ORDER_KEY = 'tradovate-order'

const { WMA, RSI, Lowest, CrossUp, CrossDown } = require('technicalindicators');
const { now } = require('lodash');

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
let order = { 'order_type': '', 'last': 0 };
let cnt_out_up = 0;
let rsi_up = false;
let rsi_down = false;

const support = (cv, ov, lv, vv) => {
  var wmaVol = WMA.calculate({ period: 6, values: vv });
  var l = lv.length;
  var down = lv[l - 4] < lv[l - 5] && lv[l - 5] < lv[l - 6] && lv[l - 3] > lv[l - 4] && lv[l - 2] > lv[l - 3] && vv[l - 4] > wmaVol[wmaVol.length - 4]

  if (down && cv[l - 4] >= ov[l - 4]) {
    return ov[l - 4];
  } else {
    if (down && cv[l - 4] < ov[l - 4]) {
      return cv[l - 4];
    } else {
      var lowest = Lowest.calculate({ period: 6, values: lv });
      return lowest[lowest.length - 1];
    }
  }
}

const get_bars = (bars) => {
  var next_candle = false;
  if (datetimes.length > 0 && datetimes.length < 300) {
    var l1 = datetimes.length;
    var t11 = datetimes[0];
    var t22 = bars[0]['time'];

    if (t11 > t22) {
      var _datetimes = [];
      var _closes = [];
      var _opens = [];
      var _lows = [];
      var _highs = [];
      var _volumes = [];

      var item = bars[0];
      _datetimes.push(item['time']);
      _closes.push(item['close']);
      _opens.push(item['open']);
      _lows.push(item['min']);
      _highs.push(item['max']);
      _volumes.push(item['offerVolume']);

      datetimes = _datetimes.concat(datetimes);
      closes = _closes.concat(closes);
      opens = _opens.concat(opens);
      lows = _lows.concat(lows);
      highs = _highs.concat(highs);
      volumes = _volumes.concat(volumes);
    } else {
      l1 = datetimes.length;
      var item = bars[0];
      var _t12 = datetimes[l1 - 1];
      var _t21 = item['time'];

      if (_t12 == _t21) {
        datetimes[l1 - 1] = item['time']
        closes[l1 - 1] = item['close'];
        opens[l1 - 1] = item['open'];
        lows[l1 - 1] = item['min'];
        highs[l1 - 1] = item['max'];
        volumes[l1 - 1] = item['volume'];

      } else if (_t12 < _t21) {
        datetimes.push(item['time']);
        closes.push(item['close']);
        opens.push(item['open']);
        lows.push(item['min']);
        highs.push(item['max']);
        volumes.push(item['volume']);
        l1 = l1 + 1;
        next_candle = true;
      }
    }
  } else {
    for (var i = bars.length; i > 0; i--) {
      var item = bars[i - 1];
      datetimes.push(item['time']);
      closes.push(item['close']);
      opens.push(item['open']);
      lows.push(item['min']);
      highs.push(item['max']);
      volumes.push(item['volume']);
    }
  }
  return next_candle;
}

/**
 * Retrieve account information from API and filter balances
 *
 * @param {*} logger
 */
const tradeLogic = async (logger, configuration) => {
  //logger.info({ tag: 'get-account-info' }, 'Retrieving account info from API');

  logic_call = configuration.buy && configuration.buy.gridTrade ? configuration.buy.gridTrade : [];

  var token = config.get('authentication.token');
  if (configuration.botOptions && configuration.botOptions.token) {
    token = configuration.botOptions.token;
  }

  if (token) {
    client = new TradingView.Client({ 'token': token });
  } else {
    const client = new TradingView.Client();
  }

  const chart = new client.Session.Chart(); // Init a Chart session

  var symbol = config.get('symbol');
  var interval = config.get('interval');
  if (configuration.candles && configuration.candles.symbol) {
    symbol = configuration.candles.symbol;
  }
  if (configuration.candles && configuration.candles.interval) {
    interval = configuration.candles.interval;
  }

  if (!symbol || !interval) {
    return;
  }


  var symbol_inf = 'CME_MINI:ES1!';
  if (symbol.includes('NQ')) {
    symbol_inf = 'CME_MINI:NQ1!';
  }

  chart.setMarket(symbol_inf, { // Set the market
    timeframe: interval,
    range: 240
  });

  chart.onError((...err) => { // Listen for errors (can avoid crash)
    console.error('=============Chart error:', ...err);
    // Do something...
    PubSub.publish('frontend-notification', {
      type: 'warning',
      title: 'Conntect data TradingView failed.'
    });
  });

  chart.onSymbolLoaded(() => { // When the symbol is successfully loaded
    console.log(`=============Market "${chart.infos.description}" loaded !`);
    PubSub.publish('frontend-notification', {
      type: 'info',
      title: 'Conntect data TradingView successfully.'
    });
  });

  chart.onUpdate(async () => { // When price changes
    if (!chart.periods[0]) return;

    //console.log("=============", chart.infos);
    // Do something...

    //return;

    if (!symbol.includes(chart.infos.root)) {
      console.log("============>>>>bypass", chart.infos.full_name);
      return;
    }

    var t1 = new Date(chart.periods[0].time * 1000);
    var m1 = t1.getMinutes();
    if (!m1) {
      m1 = 60;
    }
    var t2 = new Date(chart.periods[1].time * 1000);
    var m2 = t2.getMinutes();
    m = m1 - m2;
    //console.log("============>>>>m:", interval != m, m1, m2, m, chart.infos.full_name, "====>", chart.periods.length);


    if (interval != m) {
      //console.log("============10", interval);
      return;
    }
    //console.log("=============2");


    //return;


    //console.log("============time1:", new Date(chart.periods[chart.periods.length - 1].time * 1000).toLocaleDateString("en-US"), new Date(chart.periods[chart.periods.length - 1].time * 1000).toLocaleTimeString("en-US"))
    //console.log("============time1:", new Date(chart.periods[chart.periods.length - 2].time * 1000).toLocaleDateString("en-US"), new Date(chart.periods[chart.periods.length - 2].time * 1000).toLocaleTimeString("en-US"))
    //console.log("============time2:", new Date(chart.periods[1].time * 1000).toLocaleTimeString("en-US"))
    console.log("============time3:", new Date(chart.periods[0].time * 1000).toLocaleTimeString("en-US"))
    console.log(chart.periods[0])

    var next_candle = get_bars(chart.periods);

    var l = datetimes.length;
    //console.log("++++++++++++++++++Lenght:", l);

    close = closes[l - 1]
    open = opens[l - 1]
    low = lows[l - 1]
    high = highs[l - 1]


    close1 = closes[l - 2]
    open1 = opens[l - 2]
    low1 = lows[l - 2]
    high1 = highs[l - 2]

    close2 = closes[l - 3]
    open2 = opens[l - 3]
    low2 = lows[l - 3]
    high2 = highs[l - 3]

    close3 = closes[l - 4]
    open3 = opens[l - 4]
    low3 = lows[l - 4]
    high3 = highs[l - 4]


    rsi = RSI.calculate({ period: 9, values: closes });
    rsi1 = rsi[rsi.length - 1]
    rsi2 = rsi[rsi.length - 2]

    if (rsi1 - rsi2 > 5 && rsi2 < 40 && rsi1 > 40) {
      rsi_up = true;
      rsi_down = false;
    }
    if (rsi1 - rsi2 < -7 && rsi2 > 70 && rsi1 < 70) {
      rsi_up = false;
      rsi_down = true;
    }

    ma11 = WMA.calculate({ period: 11, values: closes });
    ma48 = WMA.calculate({ period: 48, values: closes });
    ma200 = WMA.calculate({ period: 200, values: closes });

    crossdown_11_48 = CrossDown.calculate({ lineA: ma11, lineB: ma48 });
    for (var j = crossdown_11_48.length; j > 0; j--) {
      if (crossdown_11_48[j - 1]) {
        crossdown_11_48 = true;
        break;
      }
    }
    crossup_11_48 = CrossUp.calculate({ lineA: ma11, lineB: ma48 });
    for (var k = crossup_11_48.length; k > 0; k--) {
      if (crossup_11_48[k - 1]) {
        is_crossup_11_48 = true;
        break;
      }
    }
    if (crossdown_11_48) {
      is_crossup_11_48 = false;
    }
    if (is_crossup_11_48) {
      crossdown_11_48 = false;
    }

    wma11 = ma11[ma11.length - 1]
    wma48 = ma48[ma48.length - 1]
    wma200 = ma200[ma200.length - 1]

    console.log(" ==>ma11", interval, "===", ma11[ma11.length - 1]);
    console.log(" ==>ma48", interval, "===", ma48[ma48.length - 1]);
    console.log(" ==>ma200", interval, "===", ma200[ma200.length - 1]);

    var bottomsupport = false;

    var bottomsupport = close > support(closes, opens, lows, volumes) && close > close1 && rsi1 > rsi2 + 10


    var is_out = false;
    var big_drop = rsi[rsi.length - 1] + 8 < rsi[rsi.length - 2] && close > wma48;
    var oc = Math.abs(open1 - close1);
    var hl = Math.abs(high1 - low1);
    var ochl = (oc - hl) / hl;
    var is_br = open2 < close2 && open1 < close1 && close < open && close2 < close1 && close1 > close && ochl < 0.1 && (low3 < low2 && low2 < low1)

    if (is_br) {
      cnt_out_up = cnt_out_up + 1;
    }

    if (cnt_out_up > 2) {
      is_out = true;
      cnt_out_up = 0;
    }

    console.log("rsi_up", rsi_up, "rsi_down", rsi_down, "=============>>>>>>>is_out", is_out, "====big_drop:", big_drop, "======bottomsupport", bottomsupport);

    var pb = close1 > close2 && close2 > close3 && ((close - low) / (high - low)) < 0.30 && close < close1 && close < open1 || close1 > close2 && close2 > close3 && ((close - low) / (high - low)) < 0.30 && wma11 < wma48 && close < close1 && close < open1;

    if (!order['order_type']) {
      var old_order = await mongo.findOne(logger, 'orders', {
        'symbol': symbol, 'status': 'open'
      });

      if (old_order && old_order['_id']) {
        delete old_order['_id'];
        order = old_order;
      }

      console.log("===============>>>>>>order", old_order, order);
    }

    if (order['last']) {
      var _t1 = new Date(order['last'])
      var _t2 = new Date();
      var _m1 = _t1.getMinutes() + _t1.getHours() * 60;
      var _m2 = _t2.getMinutes() + _t2.getHours() * 60;
      console.log("===============>>>>>>time", _m1, _m2, _m2 - _m1);
      if (_m2 - _m1 <= 2) {
        console.log("===============>>>>>>time2");
        return;
      }
    }

    //if (order['status']) {
    console.log("=====order status", config.get('mode'), order)
    //}

    logic_call = configuration.buy && configuration.buy.gridTrade ? configuration.buy.gridTrade : [];
    logic_put = configuration.sell && configuration.sell.gridTrade ? configuration.sell.gridTrade : [];

    if (!order['status'] || order['status'] != 'open') {

      /*
      2. [  ] (CALL and BottomSupport and (Close > EMA50 and Close > EMA200))
              --> BUY CALL - Set Stop loss 3.5 at Current Candle LOW)
              Exit WHEN PUT or OUT or PB
      */
      if (logic_call[1] && logic_call[1]['enabled'] == true && (rsi_up && up_10m && bottomsupport && close > wma48 && close > wma200)) {
        var stoploss = (logic_call[1]['stoploss'] ? logic_call[1]['stoploss'] : 3.5);
        if (up_10m) {
          stoploss = (logic_call[1]['stoploss_strong'] ? logic_call[1]['stoploss_strong'] : 5);
        }
        order['order_type'] = 'CALL';
        order['stoploss'] = low - stoploss;
        order['entry_price'] = close;
        order['entry_time'] = new Date().getTime();
        order['note'] = '#2 (CALL and BottomSupport and (Close > EMA50 and Close > EMA200)) --> BUY CALL';
        order['logic'] = '2'
      }
      /*
      Condition to play CALL ORDER
      1. [  ] (CALL and BottomSupport) --> BUY CALL - Set Stop loss 3.5 at Current Candle LOW)
              Exit WHEN PUT or OUT or PB
      */
      else if (logic_call[0] && logic_call[0]['enabled'] == true && (rsi_up && up_10m && bottomsupport && (close > wma48 || close > wma200))) {
        var stoploss = (logic_call[0]['stoploss'] ? logic_call[0]['stoploss'] : 3.5);
        if (up_10m) {
          stoploss = (logic_call[0]['stoploss_strong'] ? logic_call[0]['stoploss_strong'] : 5);
        }
        order['order_type'] = 'CALL';
        order['stoploss'] = low - stoploss;
        order['entry_price'] = close;
        order['entry_time'] = new Date().getTime();
        order['note'] = '#1 (CALL and BottomSupport) --> BUY CALL';
        order['logic'] = '1'
      }
      /*
      3. [  ] (EMA11 Crossup EMA48 and Close > EMA11 and EMA48)
              --> BUY CALL - Set Stop loss 3.5 at Current Candle LOW)
              Exit WHEN PUT or OUT or PB
      */
      else if (logic_call[2] && logic_call[2]['enabled'] == true && (rsi_up && up_10m && is_crossup_11_48 && close > wma11 && close > wma48)) {
        var stoploss = (logic_call[2]['stoploss'] ? logic_call[2]['stoploss'] : 3.5);
        if (up_10m) {
          stoploss = (logic_call[2]['stoploss_strong'] ? logic_call[2]['stoploss_strong'] : 5);
        }
        order['order_type'] = 'CALL';
        order['stoploss'] = low - stoploss;
        order['entry_price'] = close;
        order['entry_time'] = new Date().getTime();
        order['note'] = '#3 (EMA11 Crossup EMA48 and Close > EMA11 and EMA48) --> BUY CALL';
        order['logic'] = '3'
      }

      else if (logic_call[3] && logic_call[3]['enabled'] == true && (rsi_up && up_10m && wma11 > wma48 && close > wma11 && close > close1)) {
        var stoploss = (logic_call[3]['stoploss'] ? logic_call[3]['stoploss'] : 3.5);
        if (up_10m) {
          stoploss = (logic_call[3]['stoploss_strong'] ? logic_call[3]['stoploss_strong'] : 5);
        }
        order['order_type'] = 'CALL';
        order['stoploss'] = low - stoploss;
        order['entry_price'] = close;
        order['entry_time'] = new Date().getTime();
        order['note'] = '#4 (if (wma_11 > wma_48 and close > wma_11 and up10m) and close > close[1]) --> BUY CALL';
        order['logic'] = '4'
      }
      /*
      5. [  ] (OUT and BigDrop and (Close < EMA11 or Close < EMA48))
          --> BUY CALL - Set Stop loss 3.5 at Current Candle HIGH)
           Exit WHEN CALL or BottomSupport
      */
      else if (logic_put[1] && logic_put[1]['enabled'] == true && (rsi_down && down_10m && is_out && big_drop && close < wma11 && close < wma48)) {
        var stoploss = (logic_put[1]['stoploss'] ? logic_put[1]['stoploss'] : 3.5);
        if (down_10m) {
          stoploss = (logic_put[1]['stoploss_strong'] ? logic_put[1]['stoploss_strong'] : 5);
        }
        order['order_type'] = 'PUT';
        order['stoploss'] = high + stoploss;
        order['entry_price'] = close;
        order['entry_time'] = new Date().getTime();
        order['note'] = '#2 (OUT and BigDrop and (Close < EMA11 or Close < EMA48)) --> ORDER PUT';
        order['logic'] = '2'
      }
      /*
      4. [  ] (OUT and BigDrop) --> ORDER PUT - Set Stop loss 3.5 at Current Candle HIGH)
          Exit WHEN CALL or BottomSupport
      */
      else if (logic_put[0] && logic_put[0]['enabled'] == true && (rsi_down && down_10m && is_out && big_drop)) {
        var stoploss = (logic_put[0]['stoploss'] ? logic_put[0]['stoploss'] : 3.5);
        if (down_10m) {
          stoploss = (logic_put[0]['stoploss_strong'] ? logic_put[0]['stoploss_strong'] : 5);
        }
        order['order_type'] = 'PUT';
        order['stoploss'] = high + stoploss;
        order['entry_price'] = close;
        order['entry_time'] = new Date().getTime();
        order['note'] = '#1 (OUT and BigDrop) --> ORDER PUT';
        order['logic'] = '1'
      }

      /*
      6. [  ] (EMA11 Crossdown EMA48 and (Close < EMA11 or Close < EMA48))
          --> BUY CALL - Set Stop loss 3.5 at Current Candle HIGH)
           Exit WHEN CALL or BottomSupport
      */
      else if (logic_put[2] && logic_put[2]['enabled'] == true && (rsi_down && down_10m && is_crossdown_11_48 && close < wma11 && close < wma48)) {
        var stoploss = (logic_put[2]['stoploss'] ? logic_put[2]['stoploss'] : 3.5);
        if (down_10m) {
          stoploss = (logic_put[2]['stoploss_strong'] ? logic_put[2]['stoploss_strong'] : 5);
        }
        order['order_type'] = 'PUT';
        order['stoploss'] = high + stoploss;
        order['entry_price'] = close;
        order['entry_time'] = new Date().getTime();
        order['note'] = '#3 (EMA11 Crossdown EMA48 and (Close < EMA11 or Close < EMA48)) --> ORDER PUT';
        order['logic'] = '3'
      }

      else if (logic_put[3] && logic_put[3]['enabled'] == true && (rsi_down && down_10m && wma11 < wma48 && close < wma48 && close < close1)) {
        var stoploss = (logic_put[2]['stoploss'] ? logic_put[2]['stoploss'] : 3.5);
        if (down_10m) {
          stoploss = (logic_put[2]['stoploss_strong'] ? logic_put[2]['stoploss_strong'] : 5);
        }
        order['order_type'] = 'PUT';
        order['stoploss'] = high + stoploss;
        order['entry_price'] = close;
        order['entry_time'] = new Date().getTime();
        order['note'] = '#4 (wma_11 < wma_48 and close < wma_48 and not up10m and close < close[1]) --> ORDER PUT';
        order['logic'] = '4'
      }

      if (order['order_type'] == 'CALL') {
        if (config.get('mode') != 'test') {
          order['entry_order_id'] = await (await tradovate.client.http).callOrder(symbol, 1);
        }
        order['symbol'] = symbol;
        order['interval'] = interval;
        order['status'] = 'open';
        delete order['profit'];
        delete order['profit_pct'];
        delete order['exit_order_id'];
        delete order['exit_time'];
        delete order['exit_price'];

        await mongo.insertOne(logger, 'orders', order);

        cache.set(ORDER_KEY, JSON.stringify(order));

        PubSub.publish('frontend-notification', {
          type: 'success',
          title: order['order_type'] == 'Enter CALL with logic: ' + order['logic']
        });

        PubSub.publish('check-open-orders', {});

      } else if (order['order_type'] == 'PUT') {
        if (config.get('mode') != 'test') {
          order['entry_order_id'] = await (await tradovate.client.http).putOrder(symbol, 1);
        }
        order['symbol'] = symbol;
        order['interval'] = interval;
        order['status'] = 'open';
        delete order['profit'];
        delete order['profit_pct'];
        delete order['exit_order_id'];
        delete order['exit_time'];
        delete order['exit_price'];

        await mongo.insertOne(logger, 'orders', order);

        cache.set(ORDER_KEY, JSON.stringify(order));

        PubSub.publish('frontend-notification', {
          type: 'success',
          title: order['order_type'] == 'Enter PUT with logic: ' + order['logic']
        });

        PubSub.publish('check-open-orders', {});
      }
      //console.log("================ENTER ORDER:", order, new Date().getTime());
    } else {
      if (order['order_type'] == 'CALL' && order['status'] == 'open') {
        // change stoploss
        var indx = parseInt(order['logic']);
        var stoploss = 3.5;
        if (logic_call[indx]) {
          var logc = logic_call[indx];
          stoploss = logc['stoploss'] ? logc['stoploss'] : 3.5;
          if (up_10m) {
            stoploss = logc['stoploss_strong'] ? logc['stoploss_strong'] : 5;
          }
        }
        if (order['stoploss'] + stoploss < close) {
          order['stoploss'] = close - stoploss;
          console.log("==========change stoploss call:", order['stoploss']);
          cache.set(ORDER_KEY, JSON.stringify(order));
        }
        console.log("===========STOPLOSS", order['stoploss'], close, order['stoploss'] > close);

        if (!rsi_up && is_out && big_drop && close < wma11 && close < wma48 || is_crossdown_11_48 && close < wma11 && close < wma48 || big_drop || pb || is_out) {
          order['order_type'] = 'EXIT CALL';
          order['profit'] = close - order['entry_price'];
          order['profit_pct'] = order['entry_price'] ? (close - order['entry_price']) / order['entry_price'] : 0;

        } else if (!rsi_up && order['stoploss'] > close && !up_5m) {
          order['order_type'] = 'STOPLOSS CALL';
          order['profit'] = close - order['entry_price'];
          order['profit_pct'] = order['entry_price'] ? (close - order['entry_price']) / order['entry_price'] : 0;
        }
      } else if (order['order_type'] == 'PUT' && order['status'] == 'open') {
        var indx = parseInt(order['logic']);
        var stoploss = 3.5;
        if (logic_put[indx]) {
          var logc = logic_put[indx];
          stoploss = logc['stoploss'] ? logc['stoploss'] : 3.5;
          if (down_10m) {
            stoploss = logc['stoploss_strong'] ? logc['stoploss_strong'] : 5;
          }
        }
        if (order['stoploss'] - stoploss > close) {
          order['stoploss'] = close + stoploss;
          console.log("==========change stoploss put:", order['stoploss']);
          cache.set(ORDER_KEY, JSON.stringify(order));
        }

        if (!rsi_down && is_crossup_11_48 && close > wma11 && close > wma48 || bottomsupport && close > wma48 && close > wma200 || bottomsupport && (close > wma48 || close > wma200) || bottomsupport) {
          order['order_type'] = 'EXIT PUT';
          order['profit'] = order['entry_price'] - close;

        } else if (!rsi_down && order['stoploss'] < close && !down_5m) {
          order['order_type'] = 'STOPLOSS PUT';
          order['profit'] = order['entry_price'] - close;
        }
      }

      if (order['status'] == 'open' && (order['order_type'] == 'EXIT CALL' || order['order_type'] == 'STOPLOSS CALL' || order['order_type'] == 'EXIT PUT' || order['order_type'] == 'STOPLOSS PUT')) {
        var exit_order_id = null;
        if (config.get('mode') != 'test') {
          var exit_order_id = await (await tradovate.client.http).exitOrder(order['entry_order_id']);
          order['exit_order_id'] = exit_order_id;
        }
        order['status'] = 'closed'
        order['exit_price'] = close;
        order['exit_time'] = new Date().getTime();

        await mongo.upsertOne(logger, 'orders', { 'entry_time': order['entry_time'] },
          {
            'status': 'closed',
            'exit_order_id': exit_order_id,
            'exit_price': order['exit_price'],
            'profit': order['profit'],
            'exit_time': order['exit_time']
          });

        PubSub.publish('frontend-notification', {
          type: 'success',
          title: order['order_type'] == 'EXIT CALL' ? 'Exit CALL' : 'Exit PUT'
        });

        PubSub.publish('check-closed-orders', {});

        var last = new Date().getTime();
        order = { "last": last };
        cache.set(ORDER_KEY, JSON.stringify(order));

        PubSub.publish('reset-all-websockets', true);
      }
    }
  });

  // Wait 5 seconds and set the market to BINANCE:ETHEUR
  /*setTimeout(() => {
    console.log('=============\nSetting market to BINANCE:ETHEUR...');
    chart.setMarket('BINANCE:ETHEUR', {
      timeframe: 'D',
    });
  }, 5000);

  // Wait 10 seconds and set the timeframe to 15 minutes
  setTimeout(() => {
    console.log('=============\nSetting timeframe to 15 minutes...');
    chart.setSeries('15');
  }, 10000);

  // Wait 15 seconds and set the chart type to "Heikin Ashi"
  setTimeout(() => {
    console.log('=============\nSetting the chart type to "Heikin Ashi"s...');
    chart.setMarket('BINANCE:ETHEUR', {
      timeframe: 'D',
      type: 'HeikinAshi',
    });
  }, 15000);

  // Wait 20 seconds and close the chart
  setTimeout(() => {
    console.log('=============\nClosing the chart...');
    chart.delete();
  }, 20000);

  // Wait 25 seconds and close the client
  setTimeout(() => {
    console.log('=============\nClosing the client...');
    client.end();
  }, 25000);
  */
};

/**
 * Retrieve account information from API and filter balances
 *
 * @param {*} logger
 */
const tradeLogic10m = async (logger, configuration) => {
  //logger.info({ tag: 'get-account-info' }, 'Retrieving account info from API');

  var token = config.get('authentication.token');
  if (configuration.botOptions && configuration.botOptions.token) {
    token = configuration.botOptions.token;
  }

  if (token) {
    client = new TradingView.Client({ 'token': token });
  } else {
    const client = new TradingView.Client();
  }

  const chart = new client.Session.Chart(); // Init a Chart session

  var symbol = config.get('symbol');
  var interval = '10';
  if (configuration.candles && configuration.candles.symbol) {
    symbol = configuration.candles.symbol;
  }

  if (!symbol || !interval) {
    return;
  }


  var symbol_inf = 'CME_MINI:ES1!';
  if (symbol.includes('NQ')) {
    symbol_inf = 'CME_MINI:NQ1!';
  }

  chart.setMarket(symbol_inf, { // Set the market
    timeframe: interval,
    range: 120
  });

  chart.onError((...err) => { // Listen for errors (can avoid crash)
    console.error('=============Chart error:', ...err);
    // Do something...
    PubSub.publish('frontend-notification', {
      type: 'warning',
      title: 'Conntect data TradingView failed.'
    });
  });

  chart.onSymbolLoaded(() => { // When the symbol is successfully loaded
    console.log(`=============Market "${chart.infos.description}" loaded !`);
    PubSub.publish('frontend-notification', {
      type: 'info',
      title: 'Conntect data TradingView successfully.'
    });
  });

  chart.onUpdate(async () => { // When price changes
    if (!chart.periods[0]) return;

    if (!symbol.includes(chart.infos.root)) {
      console.log("============>>>>bypass", chart.infos.full_name);
      return;
    }

    var t1 = new Date(chart.periods[0].time * 1000);
    var m1 = t1.getMinutes();
    if (!m1) {
      m1 = 60;
    }
    var t2 = new Date(chart.periods[1].time * 1000);
    var m2 = t2.getMinutes();
    m = m1 - m2;
    //console.log("============>>>>m:", interval != m, m1, m2, m, chart.infos.full_name, "====>", chart.periods.length);


    if (interval != m) {
      //console.log("============10", interval);
      return;
    }
    //console.log("=============20");

    var closes_10m = [];
    for (var i = chart.periods.length; i > 0; i--) {
      var item = chart.periods[i - 1];
      closes_10m.push(item['close']);
    }

    close = closes_10m[closes_10m.length - 1]

    ma11 = WMA.calculate({ period: 11, values: closes_10m });
    ma48 = WMA.calculate({ period: 48, values: closes_10m });

    wma11 = ma11[ma11.length - 1]
    wma48 = ma48[ma48.length - 1]

    //console.log(" ==>10m >>> ma11", interval, "===", ma11[ma11.length - 1]);
    //console.log(" ==>10m >>> ma48", interval, "===", ma48[ma48.length - 1]);

    up_10m = wma11 > wma48 || close > wma11;
    down_10m = !up_10m;

    console.log("=======up_10m", up_10m, "============down_10m", down_10m)
  });
};

/**
 * Retrieve account information from API and filter balances
 *
 * @param {*} logger
 */
const tradeLogic5m = async (logger, configuration) => {
  //logger.info({ tag: 'get-account-info' }, 'Retrieving account info from API');

  var token = config.get('authentication.token');
  if (configuration.botOptions && configuration.botOptions.token) {
    token = configuration.botOptions.token;
  }

  if (token) {
    client = new TradingView.Client({ 'token': token });
  } else {
    const client = new TradingView.Client();
  }

  const chart = new client.Session.Chart(); // Init a Chart session

  var symbol = config.get('symbol');
  var interval = '5';
  if (configuration.candles && configuration.candles.symbol) {
    symbol = configuration.candles.symbol;
  }

  if (!symbol || !interval) {
    return;
  }


  var symbol_inf = 'CME_MINI:ES1!';
  if (symbol.includes('NQ')) {
    symbol_inf = 'CME_MINI:NQ1!';
  }

  chart.setMarket(symbol_inf, { // Set the market
    timeframe: interval,
    range: 120
  });

  chart.onError((...err) => { // Listen for errors (can avoid crash)
    console.error('=============Chart error:', ...err);
    // Do something...
    PubSub.publish('frontend-notification', {
      type: 'warning',
      title: 'Conntect data TradingView failed.'
    });
  });

  chart.onSymbolLoaded(() => { // When the symbol is successfully loaded
    console.log(`=============Market "${chart.infos.description}" loaded !`);
    PubSub.publish('frontend-notification', {
      type: 'info',
      title: 'Conntect data TradingView successfully.'
    });
  });

  chart.onUpdate(async () => { // When price changes
    if (!chart.periods[0]) return;

    if (!symbol.includes(chart.infos.root)) {
      console.log("============>>>>bypass", chart.infos.full_name);
      return;
    }

    var t1 = new Date(chart.periods[0].time * 1000);
    var m1 = t1.getMinutes();
    if (!m1) {
      m1 = 60;
    }
    var t2 = new Date(chart.periods[1].time * 1000);
    var m2 = t2.getMinutes();
    m = m1 - m2;
    //console.log("============>>>>m:", interval != m, m1, m2, m, chart.infos.full_name, "====>", chart.periods.length);


    if (interval != m) {
      //console.log("============10", interval);
      return;
    }
    //console.log("=============20");

    var closes_5m = [];
    for (var i = chart.periods.length; i > 0; i--) {
      var item = chart.periods[i - 1];
      closes_5m.push(item['close']);
    }

    close = closes_5m[closes_5m.length - 1]

    ma11 = WMA.calculate({ period: 11, values: closes_5m });
    ma48 = WMA.calculate({ period: 48, values: closes_5m });

    wma11 = ma11[ma11.length - 1]
    wma48 = ma48[ma48.length - 1]

    console.log(" ==>5m >>> ma11", interval, "===", ma11[ma11.length - 1]);
    console.log(" ==>5m >>> ma48", interval, "===", ma48[ma48.length - 1]);

    up_5m = close > wma48 && close > wma11;
    down_5m = close < wma48 && close < wma11;

    console.log("=======up_5m", up_5m, "=======down_5m:", down_5m)
  });
};

module.exports = {
  tradeLogic,
  tradeLogic10m,
  tradeLogic5m
};
