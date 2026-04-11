/* istanbul ignore file */
const { postgres, logger } = require('../helpers');

(async () => {
  //logger.info('Test inserting');

  await postgres.connect(logger);

  await postgres.findOne(logger, 'test', { key: 'non-exist' });

  await postgres.insertOne(logger, 'test', { key: 'my-key', value: 1 });

  await postgres.findOne(logger, 'test', { key: 'my-key' });

  await postgres.upsertOne(logger, 'test', { key: 'my-key' }, { value: 2 });

  await postgres.findOne(logger, 'test', { key: 'my-key' });

  await postgres.deleteOne(logger, 'test', { key: 'my-key' });

  process.exit(0);
})();
