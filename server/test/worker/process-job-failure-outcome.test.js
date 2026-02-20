'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { JOB_STATUSES } = require('../../src/core/constants/job-status');
const { applyFailureOutcome, applyFailureIdentity } = require('../../src/worker/process-job');

test('applyFailureOutcome sets status/errorCode/error/failedAt from typed extractor error', () => {
  const job = {
    tweetUrl: 'https://www.tiktok.com/@user/video/123',
    accountPlatform: 'unknown',
    accountHandle: '',
    accountDisplayName: '',
    accountSlug: '',
    errorCode: '',
    error: '',
    status: 'running',
    failedAt: null,
  };

  const error = new Error('Video is unavailable on source platform');
  error.code = 'EXTRACT_VIDEO_UNAVAILABLE';

  applyFailureOutcome(job, error);

  assert.equal(job.status, JOB_STATUSES ? JOB_STATUSES.FAILED || 'failed' : 'failed');
  assert.equal(job.errorCode, 'EXTRACT_VIDEO_UNAVAILABLE');
  assert.equal(job.error, 'Video is unavailable on source platform');
  assert.ok(job.failedAt instanceof Date);
  assert.equal(job.accountPlatform, 'tiktok');
  assert.equal(job.accountHandle, '@user');
});

test('applyFailureOutcome defaults errorCode to EXTRACT_UNKNOWN for untyped errors', () => {
  const job = {
    tweetUrl: 'https://www.tiktok.com/@user/video/123',
    accountPlatform: 'unknown',
    accountHandle: '',
    accountDisplayName: '',
    accountSlug: '',
    errorCode: '',
    error: '',
    status: 'running',
    failedAt: null,
  };

  const error = new Error('Some unexpected error');

  applyFailureOutcome(job, error);

  assert.equal(job.status, 'failed');
  assert.equal(job.errorCode, 'EXTRACT_UNKNOWN');
  assert.equal(job.error, 'Some unexpected error');
  assert.ok(job.failedAt instanceof Date);
});

test('applyFailureOutcome derives account identity when fields are missing', () => {
  const job = {
    tweetUrl: 'https://x.com/elonmusk/status/1234567890',
    accountPlatform: 'unknown',
    accountHandle: '',
    accountDisplayName: '',
    accountSlug: '',
    errorCode: '',
    error: '',
    status: 'running',
    failedAt: null,
  };

  const error = new Error('Network timeout');

  applyFailureOutcome(job, error);

  assert.equal(job.accountPlatform, 'x');
  assert.equal(job.accountHandle, '@elonmusk');
  assert.ok(job.accountSlug.length > 0);
  assert.equal(job.status, 'failed');
});
