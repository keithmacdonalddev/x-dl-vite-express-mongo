const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { assertSafeTestConnection } = require('./helpers/safe-test-db');

const { app } = require('../src/app');

let mongoServer;

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: 'xdl_test' });
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

test('POST /api/jobs creates a queued job for a valid tweet URL', async () => {
  const response = await request(app)
    .post('/api/jobs')
    .send({ tweetUrl: 'https://x.com/someuser/status/1234567890123456789' });

  assert.equal(response.status, 201);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.job.status, 'queued');
  assert.equal(
    response.body.job.tweetUrl,
    'https://x.com/someuser/status/1234567890123456789'
  );

  const jobsCollection = mongoose.connection.collection('jobs');
  const saved = await jobsCollection.findOne({ _id: new mongoose.Types.ObjectId(response.body.job._id) });
  assert.ok(saved);
});

test('POST /api/jobs creates a queued job for a valid TikTok URL', async () => {
  const response = await request(app)
    .post('/api/jobs')
    .send({ tweetUrl: 'https://www.tiktok.com/@someuser/video/7606119826259512584' });

  assert.equal(response.status, 201);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.job.status, 'queued');
  assert.equal(
    response.body.job.tweetUrl,
    'https://www.tiktok.com/@someuser/video/7606119826259512584'
  );
});

test('POST /api/jobs rejects invalid tweet URL input', async () => {
  const response = await request(app)
    .post('/api/jobs')
    .send({ tweetUrl: 'https://google.com/not-a-tweet' });

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /tweeturl/i);

  const jobsCollection = mongoose.connection.collections.jobs;
  const count = jobsCollection ? await jobsCollection.countDocuments({}) : 0;
  assert.equal(count, 0);
});
