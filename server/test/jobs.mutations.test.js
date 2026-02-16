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
  await mongoose.connect(mongoServer.getUri(), { dbName: 'xdl_mutations_test' });
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

test('PATCH /api/jobs/:id updates editable fields', async () => {
  const seeded = await Job.create({
    tweetUrl: 'https://x.com/u/status/1000000000000000001',
    accountDisplayName: 'Old Name',
  });

  const response = await request(app)
    .patch(`/api/jobs/${seeded._id.toString()}`)
    .send({
      tweetUrl: 'https://www.tiktok.com/@abc/video/7606119826259512584',
      accountDisplayName: 'New Name',
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.job.tweetUrl, 'https://www.tiktok.com/@abc/video/7606119826259512584');
  assert.equal(response.body.job.accountDisplayName, 'New Name');
});

test('DELETE /api/jobs/:id permanently deletes a job', async () => {
  const seeded = await Job.create({
    tweetUrl: 'https://x.com/u/status/1000000000000000002',
    outputPath: 'downloads/test-user/sample.mp4',
    thumbnailPath: 'downloads/test-user/thumbnails/sample.jpg',
  });

  const response = await request(app).delete(`/api/jobs/${seeded._id.toString()}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);

  const found = await Job.findById(seeded._id).lean();
  assert.equal(found, null);
});

test('POST /api/jobs/bulk-delete deletes multiple jobs', async () => {
  const first = await Job.create({ tweetUrl: 'https://x.com/a/status/1' });
  const second = await Job.create({ tweetUrl: 'https://x.com/b/status/2' });

  const response = await request(app)
    .post('/api/jobs/bulk-delete')
    .send({ jobIds: [first._id.toString(), second._id.toString()] });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.deletedCount, 2);

  const remaining = await Job.countDocuments({});
  assert.equal(remaining, 0);
});

test('PATCH /api/jobs/contact/:slug updates display name for a contact', async () => {
  await Job.create({
    tweetUrl: 'https://www.tiktok.com/@acct/video/7606119826259512584',
    accountSlug: 'acct',
    accountDisplayName: 'Before',
  });

  const response = await request(app)
    .patch('/api/jobs/contact/acct')
    .send({ displayName: 'After' });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.modifiedCount, 1);

  const updated = await Job.findOne({ accountSlug: 'acct' }).lean();
  assert.equal(updated.accountDisplayName, 'After');
});

test('DELETE /api/jobs/contact/:slug deletes all jobs under a contact', async () => {
  await Job.create({
    tweetUrl: 'https://www.tiktok.com/@acct/video/7606119826259512584',
    accountSlug: 'acct',
  });
  await Job.create({
    tweetUrl: 'https://www.tiktok.com/@acct/video/7606119826259512585',
    accountSlug: 'acct',
  });
  await Job.create({
    tweetUrl: 'https://x.com/u/status/1234567890123',
    accountSlug: 'other',
  });

  const response = await request(app).delete('/api/jobs/contact/acct');

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.deletedCount, 2);

  const remaining = await Job.countDocuments({});
  assert.equal(remaining, 1);
});

