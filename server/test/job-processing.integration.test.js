const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { Job } = require('../src/models/job');
const { JOB_STATUSES } = require('../src/constants/job-status');
const { assertSafeTestConnection } = require('./helpers/safe-test-db');

let mongoServer;

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: 'xdl_job_processing_test' });
  assertSafeTestConnection(mongoose.connection);
});

test.after(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

test.beforeEach(async () => {
  assertSafeTestConnection(mongoose.connection);
  const jobsCollection = mongoose.connection.collections.jobs;
  if (jobsCollection) {
    await jobsCollection.deleteMany({});
  }
});

test('processing a queued job sets completed status and outputPath', async () => {
  const { processOneCycle } = require('../src/worker/process-job');

  await Job.create({
    tweetUrl: 'https://x.com/u/status/1234567890',
    status: JOB_STATUSES.QUEUED,
  });

  const fakeExtractor = async () => ({
    mediaUrl: 'https://video.twimg.com/ext_tw_video/123/pu/vid/1280x720/video.mp4',
    sourceType: 'direct',
  });
  const fakeDownloader = async () => ({
    outputPath: 'downloads/123.mp4',
  });

  const result = await processOneCycle(fakeExtractor, fakeDownloader);

  assert.ok(result);
  assert.equal(result.status, JOB_STATUSES.COMPLETED);
  assert.equal(result.outputPath, 'downloads/123.mp4');
  assert.equal(result.progressPct, 100);
});

test('processing failure marks job as failed with error', async () => {
  const { processOneCycle } = require('../src/worker/process-job');

  const seeded = await Job.create({
    tweetUrl: 'https://x.com/u/status/9876543210',
    status: JOB_STATUSES.QUEUED,
  });

  const fakeExtractor = async () => {
    throw new Error('extractor crashed');
  };

  await processOneCycle(fakeExtractor, async () => {
    throw new Error('should not be called');
  });

  const updated = await Job.findById(seeded._id).lean();
  assert.ok(updated);
  assert.equal(updated.status, JOB_STATUSES.FAILED);
  assert.match(updated.error, /extractor crashed/i);
  assert.ok(updated.failedAt);
});

test('processing job with prefilled extractedUrl skips extractor and completes download', async () => {
  const { processOneCycle } = require('../src/worker/process-job');

  await Job.create({
    tweetUrl: 'https://x.com/u/status/1111111111',
    status: JOB_STATUSES.QUEUED,
    extractedUrl: 'https://video.twimg.com/ext_tw_video/111/pu/vid/1280x720/video.mp4',
    sourceType: 'direct',
  });

  let extractorCalled = false;
  const fakeExtractor = async () => {
    extractorCalled = true;
    throw new Error('extractor should not be called');
  };

  const fakeDownloader = async () => ({
    outputPath: 'downloads/111.mp4',
  });

  const result = await processOneCycle(fakeExtractor, fakeDownloader);

  assert.equal(extractorCalled, false);
  assert.ok(result);
  assert.equal(result.status, JOB_STATUSES.COMPLETED);
  assert.equal(result.outputPath, 'downloads/111.mp4');
});
