const { tradovate } = require('../../helpers');

/**
 * Get balance from Tradovate
 *
 * @param {*} logger
 */
const getAccountInfo = async logger => {

  //logger.info({ function: 'accountInfo' }, 'Retrieving accountInfo from API');

  const accountInfo = await (await tradovate.client.http).accountList();
  const cashBalances = await (await tradovate.client.http).cashBalanceList();

  const cashBalance = cashBalances.reduce(function (acc, b) {
    acc[b.accountId] = b.amount;
    return acc;
  }, []);

  accountInfo.reduce((acc, b) => {
    const balance = cashBalance[b.id];
    b['balance'] = balance
    return b;
  }, []);

  /*accountInfo.balances = accountInfo.balances.reduce((acc, b) => {
    const balance = b;
    if (+balance.free > 0 || +balance.locked > 0) {
      acc.push(balance);
    }

    return acc;
  }, []);
  */

  //logger.info({ accountInfo }, 'Retrieved account information');
  return accountInfo;
};

module.exports = { getAccountInfo };
