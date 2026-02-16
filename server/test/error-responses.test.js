const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/app');

test('invalid tweet url returns standardized error payload', async () => {
  const response = await request(app).post('/api/jobs').send({ tweetUrl: 'bad' });

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, 'INVALID_TWEET_URL');
  assert.equal(typeof response.body.error, 'string');
});
