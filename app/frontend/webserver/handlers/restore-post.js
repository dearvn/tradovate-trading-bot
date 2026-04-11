const path = require('path');
const shell = require('shelljs');
const config = require('config');
const {
  verifyAuthenticated
} = require('../../../cronjob/trailingTradeHelper/common');
const { slack } = require('../../../helpers');

const ALLOWED_EXTENSIONS = ['.archive', '.dump'];

const handleRestorePost = async (funcLogger, app) => {
  const logger = funcLogger.child({
    method: 'POST',
    endpoint: '/restore-post'
  });

  app.route('/restore').post(async (req, res) => {
    if (config.get('demoMode')) {
      return res.send({
        success: false,
        status: 403,
        message: 'You cannot restore database in the demo mode.',
        data: {}
      });
    }

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

    const { archive } = req.files;

    // Validate file extension to prevent non-backup files from being restored
    const ext = path.extname(archive.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return res.send({
        success: false,
        status: 400,
        message: `Invalid file type. Only ${ALLOWED_EXTENSIONS.join(', ')} files are allowed.`,
        data: {}
      });
    }

    // Use path.basename to strip any directory components from the filename,
    // preventing path traversal (e.g. "../../etc/passwd").
    const safeName = path.basename(archive.name);
    const filepath = path.join('/tmp', safeName);
    await archive.mv(filepath);

    const result = await new Promise(resolve => {
      shell.exec(
        `${process.cwd()}/scripts/restore.sh ${config.get(
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
      slack.sendMessage(`The restore has failed.`, {});

      return res.send({
        success: false,
        status: 500,
        message: 'Restore failed',
        data: result
      });
    }

    return res.send({
      success: true,
      status: 200,
      message: 'Restore success',
      data: result
    });
  });
};

module.exports = { handleRestorePost };
