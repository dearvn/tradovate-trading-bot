const queue = require('../../../cronjob/trailingTradeHelper/queue');

const handleSymbolSettingDelete = async (logger, ws, payload) => {
  //logger.info({ payload }, 'Start symbol setting delete');

  const { data: symbolInfo } = payload;

  const { symbol } = symbolInfo;


  queue.executeFor(logger, symbol);

  ws.send(
    JSON.stringify({ result: true, type: 'symbol-setting-delete-result' })
  );
};

module.exports = { handleSymbolSettingDelete };
