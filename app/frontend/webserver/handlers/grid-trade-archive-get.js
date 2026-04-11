const moment = require('moment-timezone');
const {
  verifyAuthenticated
} = require('../../../cronjob/trailingTradeHelper/common');

const { postgres } = require('../../../helpers');

const handleGridTradeArchiveGet = async (funcLogger, app) => {
  const logger = funcLogger.child({
    endpoint: '/grid-trade-archive-get'
  });

  app.route('/grid-trade-archive-get').post(async (req, res) => {
    const {
      authToken,
      type,
      symbol,
      quoteAsset,
      page: rawPage,
      limit: rawLimit,
      start,
      end
    } = req.body;

    const page = rawPage || 1;
    const limit = rawLimit || 5;

    const isAuthenticated = await verifyAuthenticated(logger, authToken);

    if (isAuthenticated === false) {
      return res.send({
        success: false,
        status: 403,
        message: 'Please authenticate first.',
        data: {
          rows: [],
          stats: {}
        }
      });
    }

    if (['symbol', 'quoteAsset'].includes(type) === false) {
      return res.send({
        success: false,
        status: 400,
        message: `${type} is not allowed`,
        data: {
          rows: [],
          stats: {}
        }
      });
    }

    // Build filter for findAll (uses buildWhere inside postgres helper)
    const match = {};
    if (start || end) {
      match.archivedAt = {
        ...(start ? { $gte: moment(start).toISOString() } : {}),
        ...(end ? { $lte: moment(end).toISOString() } : {})
      };
    }
    if (type === 'symbol') {
      match.symbol = symbol;
    } else if (type === 'quoteAsset') {
      match.quoteAsset = quoteAsset;
    }

    const rows = await postgres.findAll(
      logger,
      'trailing_trade_grid_trade_archive',
      match,
      {
        sort: { archivedAt: -1 },
        skip: (page - 1) * limit,
        limit
      }
    );

    // Build raw SQL aggregate for stats
    const params = [];
    const conditions = [];

    if (start) {
      params.push(moment(start).toISOString());
      conditions.push(`archived_at >= $${params.length}`);
    }
    if (end) {
      params.push(moment(end).toISOString());
      conditions.push(`archived_at <= $${params.length}`);
    }
    if (type === 'symbol') {
      params.push(symbol);
      conditions.push(`symbol = $${params.length}`);
    } else if (type === 'quoteAsset') {
      params.push(quoteAsset);
      conditions.push(`quote_asset = $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const groupCol = type === 'symbol' ? 'symbol' : 'quote_asset';

    const aggResult = await postgres.query(
      logger,
      `SELECT
         ${groupCol},
         SUM(total_buy_quote_qty)       AS "totalBuyQuoteQty",
         SUM(total_sell_quote_qty)      AS "totalSellQuoteQty",
         SUM(buy_grid_trade_quote_qty)  AS "buyGridTradeQuoteQty",
         SUM(buy_manual_quote_qty)      AS "buyManualQuoteQty",
         SUM(sell_grid_trade_quote_qty) AS "sellGridTradeQuoteQty",
         SUM(sell_manual_quote_qty)     AS "sellManualQuoteQty",
         SUM(stop_loss_quote_qty)       AS "stopLossQuoteQty",
         SUM(profit)                    AS "profit",
         COUNT(*)::INTEGER              AS "trades"
       FROM trailing_trade_grid_trade_archive
       ${whereClause}
       GROUP BY ${groupCol}`,
      params
    );

    const aggRow = aggResult[0] || {};
    const totalBuyQuoteQty = parseFloat(aggRow.totalBuyQuoteQty) || 0;
    const profit = parseFloat(aggRow.profit) || 0;

    const stats = {
      ...(type === 'symbol' ? { symbol } : { quoteAsset }),
      totalBuyQuoteQty,
      totalSellQuoteQty: parseFloat(aggRow.totalSellQuoteQty) || 0,
      buyGridTradeQuoteQty: parseFloat(aggRow.buyGridTradeQuoteQty) || 0,
      buyManualQuoteQty: parseFloat(aggRow.buyManualQuoteQty) || 0,
      sellGridTradeQuoteQty: parseFloat(aggRow.sellGridTradeQuoteQty) || 0,
      sellManualQuoteQty: parseFloat(aggRow.sellManualQuoteQty) || 0,
      stopLossQuoteQty: parseFloat(aggRow.stopLossQuoteQty) || 0,
      profit,
      profitPercentage: totalBuyQuoteQty > 0 ? (profit / totalBuyQuoteQty) * 100 : 0,
      trades: aggRow.trades || 0
    };

    return res.send({
      success: true,
      status: 200,
      message: 'Retrieved grid-trade-archive-get',
      data: {
        rows,
        stats
      }
    });
  });
};

module.exports = { handleGridTradeArchiveGet };
