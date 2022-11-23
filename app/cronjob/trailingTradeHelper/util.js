const _ = require('lodash');

/**
 * Calculate round down
 *
 * @param {*} number
 * @param {*} decimals
 */
const roundDown = (number, decimals) =>
  // eslint-disable-next-line no-restricted-properties
  Math.floor(number * 10 ** decimals) / 10 ** decimals;

/**
 * Mask important config key
 *
 * @param {*} orgConfig
 * @returns
 */
const maskConfig = orgConfig => {
  const maskedConfig = _.cloneDeep(orgConfig);

  const maskedPaths = [
    'tradovate.live.apiKey',
    'tradovate.live.secretKey',
    'tradovate.test.apiKey',
    'tradovate.test.secretKey'
  ];

  maskedPaths.forEach(path => {
    if (_.get(maskedConfig, path, '') !== '') {
      _.set(maskedConfig, path, '<masked>');
    }
  });

  return maskedConfig;
};

module.exports = {
  roundDown,
  maskConfig
};
