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
  await mongoose.connect(mongoServer.getUri(), { dbName: 'xdl_recovery_test' });
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

test('startup recovery converts stale running jobs to failed', async () => {
  const { recoverStaleJobs } = require('../src/worker/recovery');

  const staleStart = new Date(Date.now() - 60_000);
  await Job.create({
    tweetUrl: 'https://x.com/u/status/1',
    status: JOB_STATUSES.RUNNING,
    startedAt: staleStart,
  });
  await Job.create({
    tweetUrl: 'https://x.com/u/status/2',
    status: JOB_STATUSES.RUNNING,
    startedAt: new Date(),
  });

  const count = await recoverStaleJobs({ maxAgeMs: 1_000 });
  assert.equal(count, 1);

  const stale = await Job.findOne({ tweetUrl: 'https://x.com/u/status/1' }).lean();
  assert.equal(stale.status, JOB_STATUSES.FAILED);
  assert.match(stale.error, /recovered_from_restart/i);
  assert.ok(stale.failedAt);
});
