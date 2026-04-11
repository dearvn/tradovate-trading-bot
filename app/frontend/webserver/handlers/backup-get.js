const fs = require('fs');
const shell = require('shelljs');
const config = require('config');
const moment = require('moment');
const {
  verifyAuthenticated
} = require('../../../cronjob/trailingTradeHelper/common');
const { slack } = require('../../../helpers');

const handleBackupGet = async (funcLogger, app) => {
  const logger = funcLogger.child({
    method: 'GET',
    endpoint: '/backup-get'
  });

  app.route('/backup').get(async (req, res) => {
    const authToken = req.header('X-AUTH-TOKEN');

    // Verify authentication
    const isAuthenticated = await verifyAuthenticated(logger, authToken);

    if (isAuthenticated === false) {
      //logger.info('Not authenticated');
      return res.send({
        success: false,
        status: 403,
        message: 'Please authenticate first.',
        data: {}
      });
    }

    const filename = `tradovate-bot-${moment().format(
      'YYYY-MM-DD-HH-mm-ss'
    )}.archive`;
    const filepath = `/tmp/${filename}`;

    const result = await new Promise(resolve => {
      shell.exec(
        `${process.cwd()}/scripts/backup.sh ${config.get(
          'postgres.host'
        )} ${config.get('postgres.port')} ${config.get(
          'postgres.database'
        )} ${config.get('postgres.user')} ${filepath}`,
        (code, stdout, stderr) => {
          resolve({ code, stdout, stderr });
        }
      );
    });

    if (result.code !== 0) {
      slack.sendMessage(
        `The backup has failed.\n\`\`\`${JSON.stringify(result)}\`\`\``,
        {}
      );

      return res.send({
        success: false,
        status: 500,
        message: 'Backup failed',
        data: result
      });
    }

    // Remove the temp file from /tmp after the download completes so
    // backup files don't accumulate on the server.
    return res.download(filepath, filename, err => {
      fs.unlink(filepath, () => {}); // best-effort cleanup, ignore errors
      if (err && !res.headersSent) {
        logger.error({ err }, 'Error sending backup file');
      }
    });
  });
};

module.exports = { handleBackupGet };
