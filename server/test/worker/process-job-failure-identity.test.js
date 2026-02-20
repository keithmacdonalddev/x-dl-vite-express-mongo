'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyFailureIdentity } = require('../../src/worker/process-job');

test('applyFailureIdentity derives handle/slug from tweet URL when extraction fails early', () => {
  const job = {
    tweetUrl: 'https://www.tiktok.com/@addisonre/video/7321895430207577390',
    accountPlatform: 'unknown',
    accountHandle: '',
    accountDisplayName: '',
    accountSlug: '',
  };

  applyFailureIdentity(job);

  assert.equal(job.accountPlatform, 'tiktok');
  assert.equal(job.accountHandle, '@addisonre');
  assert.equal(job.accountSlug, 'addisonre');
});

test('applyFailureIdentity does not overwrite existing account identity', () => {
  const job = {
    tweetUrl: 'https://www.tiktok.com/@addisonre/video/7321895430207577390',
    accountPlatform: 'tiktok',
    accountHandle: '@existing',
    accountDisplayName: 'Existing Name',
    accountSlug: 'existing',
  };

  applyFailureIdentity(job);

  assert.equal(job.accountPlatform, 'tiktok');
  assert.equal(job.accountHandle, '@existing');
  assert.equal(job.accountDisplayName, 'Existing Name');
});
