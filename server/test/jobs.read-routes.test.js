const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { assertSafeTestConnection } = require('./helpers/safe-test-db');

const { app } = require('../src/app');
const { Job } = require('../src/models/job');

let mongoServer;

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: 'xdl_read_routes_test' });
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

test('GET /api/jobs returns newest-first job list', async () => {
  await Job.create({ tweetUrl: 'https://x.com/a/status/1' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await Job.create({ tweetUrl: 'https://x.com/b/status/2' });

  const response = await request(app).get('/api/jobs');

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(Array.isArray(response.body.jobs), true);
  assert.equal(response.body.jobs.length, 2);
  assert.equal(response.body.jobs[0].tweetUrl, 'https://x.com/b/status/2');
  assert.equal(response.body.jobs[1].tweetUrl, 'https://x.com/a/status/1');
});

test('GET /api/jobs/:id returns a single matching job', async () => {
  const created = await Job.create({ tweetUrl: 'https://x.com/a/status/1' });

  const response = await request(app).get(`/api/jobs/${created._id.toString()}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.job._id, created._id.toString());
  assert.equal(response.body.job.tweetUrl, 'https://x.com/a/status/1');
});
