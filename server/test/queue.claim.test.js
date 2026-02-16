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
  await mongoose.connect(mongoServer.getUri(), { dbName: 'xdl_queue_claim_test' });
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

test('claimNextQueuedJob marks one queued record as running', async () => {
  const { claimNextQueuedJob } = require('../src/worker/queue');

  await Job.create({ tweetUrl: 'https://x.com/u1/status/1', status: JOB_STATUSES.QUEUED });
  await Job.create({ tweetUrl: 'https://x.com/u2/status/2', status: JOB_STATUSES.QUEUED });

  const claimed = await claimNextQueuedJob();
  assert.ok(claimed);
  assert.equal(claimed.status, JOB_STATUSES.RUNNING);
  assert.ok(claimed.startedAt);

  const runningCount = await Job.countDocuments({ status: JOB_STATUSES.RUNNING });
  const queuedCount = await Job.countDocuments({ status: JOB_STATUSES.QUEUED });

  assert.equal(runningCount, 1);
  assert.equal(queuedCount, 1);
});

test('claimNextQueuedJob returns null when no queued jobs exist', async () => {
  const { claimNextQueuedJob } = require('../src/worker/queue');
  const claimed = await claimNextQueuedJob();
  assert.equal(claimed, null);
});
