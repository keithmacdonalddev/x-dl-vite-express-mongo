const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/app');

test('rejects oversize payloads for jobs endpoint', async () => {
  const response = await request(app).post('/api/jobs').send({ tweetUrl: 'x'.repeat(50000) });
  assert.equal(response.status, 413);
});

test('rejects excessive tweetUrl length before route handling', async () => {
  const longTweetUrl = `https://x.com/user/status/${'1'.repeat(3000)}`;
  const response = await request(app).post('/api/jobs').send({ tweetUrl: longTweetUrl });

  assert.equal(response.status, 413);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /tweeturl too long/i);
});
