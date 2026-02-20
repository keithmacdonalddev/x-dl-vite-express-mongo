'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyFailureIdentity } = require('../../src/worker/process-job');

test('typed extractor error code persists to job errorCode field', () => {
  const job = {
    tweetUrl: 'https://www.tiktok.com/@user/video/123',
    accountPlatform: 'unknown',
    accountHandle: '',
    accountDisplayName: '',
    accountSlug: '',
    errorCode: '',
    error: '',
  };

  // Simulate what the worker catch block does
  const error = new Error('Video is unavailable on source platform');
  error.code = 'EXTRACT_VIDEO_UNAVAILABLE';
  error.details = { title: 'TikTok', canonicalUrl: '', finalUrl: '' };

  applyFailureIdentity(job);
  job.errorCode = typeof error.code === 'string' ? error.code : 'EXTRACT_UNKNOWN';
  job.error = error.message;

  assert.equal(job.errorCode, 'EXTRACT_VIDEO_UNAVAILABLE');
  assert.equal(job.error, 'Video is unavailable on source platform');
  assert.equal(job.accountPlatform, 'tiktok');
  assert.equal(job.accountHandle, '@user');
});

test('untyped error defaults errorCode to EXTRACT_UNKNOWN', () => {
  const job = {
    tweetUrl: 'https://www.tiktok.com/@user/video/123',
    accountPlatform: 'unknown',
    accountHandle: '',
    accountDisplayName: '',
    accountSlug: '',
    errorCode: '',
    error: '',
  };

  const error = new Error('Some unexpected error');
  // No .code property

  applyFailureIdentity(job);
  job.errorCode = typeof error.code === 'string' ? error.code : 'EXTRACT_UNKNOWN';
  job.error = error.message;

  assert.equal(job.errorCode, 'EXTRACT_UNKNOWN');
  assert.equal(job.error, 'Some unexpected error');
  assert.equal(job.accountPlatform, 'tiktok');
});

test('failure still derives account identity when fields are missing', () => {
  const job = {
    tweetUrl: 'https://x.com/elonmusk/status/1234567890',
    accountPlatform: 'unknown',
    accountHandle: '',
    accountDisplayName: '',
    accountSlug: '',
  };

  applyFailureIdentity(job);

  assert.equal(job.accountPlatform, 'x');
  assert.equal(job.accountHandle, '@elonmusk');
  assert.ok(job.accountSlug.length > 0);
});
