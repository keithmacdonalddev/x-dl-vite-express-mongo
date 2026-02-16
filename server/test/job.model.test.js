const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { Job } = require('../src/models/job');

let mongoServer;

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: 'xdl_model_test' });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test.beforeEach(async () => {
  const jobsCollection = mongoose.connection.collections.jobs;
  if (jobsCollection) {
    await jobsCollection.deleteMany({});
  }
});

test('new job defaults to queued status and zero progress', async () => {
  const doc = await Job.create({
    tweetUrl: 'https://x.com/user/status/1',
  });

  assert.equal(doc.status, 'queued');
  assert.equal(doc.progressPct, 0);
  assert.equal(doc.attemptCount, 0);
  assert.equal(doc.sourceType, 'unknown');
});
