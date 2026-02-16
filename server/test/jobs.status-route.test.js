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
  await mongoose.connect(mongoServer.getUri(), { dbName: 'xdl_status_route_test' });
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

test('PATCH /api/jobs/:id/status rejects invalid queued -> completed transition', async () => {
  const created = await Job.create({ tweetUrl: 'https://x.com/u/status/1' });

  const response = await request(app)
    .patch(`/api/jobs/${created._id.toString()}/status`)
    .send({ status: JOB_STATUSES.COMPLETED });

  assert.equal(response.status, 409);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /invalid status transition/i);
});
