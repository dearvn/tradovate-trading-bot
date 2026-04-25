/**
 * Slack helper — identical to app/helpers/slack.js.
 */

const _ = require('lodash');
const moment = require('moment');
const axios = require('axios');
const config = require('config');

const lastMessages = {};

const sendMessage = (text, params = {}) => {
  if (_.get(params, 'symbol', '') !== '') {
    if (_.get(lastMessages, `${params.symbol}.message`, '') === text) {
      return Promise.resolve({});
    }
    lastMessages[params.symbol] = { message: text };
  }

  let formattedText = `(${moment().format('HH:mm:ss.SSS')}) ${text}`;
  if (params.apiLimit) {
    formattedText += `\n- Current API Usage: ${params.apiLimit}`;
  }

  if (config.get('slack.enabled') !== true) {
    return Promise.resolve({});
  }

  return axios.post(config.get('slack.webhookUrl'), {
    channel: config.get('slack.channel'),
    username: `${config.get('slack.username')} - ${config.get('mode')}`,
    type: 'mrkdwn',
    text: formattedText
  });
};

module.exports = { sendMessage };
