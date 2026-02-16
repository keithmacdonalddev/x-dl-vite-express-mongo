const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { app } = require('../src/app');
const { Job } = require('../src/models/job');
const { JOB_STATUSES } = require('../src/constants/job-status');
const { assertSafeTestConnection } = require('./helpers/safe-test-db');

let mongoServer;

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: 'xdl_manual_retry_test' });
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

test('POST /api/jobs/:id/manual-retry creates a queued retry job with manual media URL', async () => {
  const original = await Job.create({
    tweetUrl: 'https://x.com/u/status/1234567890',
    status: JOB_STATUSES.FAILED,
    error: 'BOT_CHALLENGE',
  });

  const response = await request(app)
    .post(`/api/jobs/${original._id.toString()}/manual-retry`)
    .send({
      mediaUrl: 'https://video.twimg.com/ext_tw_video/123/pu/vid/1280x720/video.mp4',
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.job.status, JOB_STATUSES.QUEUED);
  assert.equal(response.body.job.extractedUrl, 'https://video.twimg.com/ext_tw_video/123/pu/vid/1280x720/video.mp4');
  assert.equal(response.body.job.sourceType, 'direct');
  assert.equal(response.body.job.tweetUrl, original.tweetUrl);
});

test('POST /api/jobs/:id/manual-retry rejects invalid media URL', async () => {
  const original = await Job.create({
    tweetUrl: 'https://x.com/u/status/1234567890',
    status: JOB_STATUSES.FAILED,
    error: 'BOT_CHALLENGE',
  });

  const response = await request(app)
    .post(`/api/jobs/${original._id.toString()}/manual-retry`)
    .send({
      mediaUrl: 'not-a-url',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /invalid media url/i);
});
