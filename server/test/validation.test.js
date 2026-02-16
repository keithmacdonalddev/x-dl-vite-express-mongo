const test = require('node:test');
const assert = require('node:assert/strict');

const { isSupportedPostUrl } = require('../src/utils/validation');

test('isSupportedPostUrl accepts valid X status URLs', () => {
  assert.equal(isSupportedPostUrl('https://x.com/user/status/1234567890123456789'), true);
  assert.equal(isSupportedPostUrl('https://twitter.com/user/status/1234567890'), true);
});

test('isSupportedPostUrl accepts valid TikTok video URLs', () => {
  assert.equal(isSupportedPostUrl('https://www.tiktok.com/@minou.lindholm/video/7541404272525708566'), true);
  assert.equal(isSupportedPostUrl('https://m.tiktok.com/@u/video/7606119826259512584'), true);
});

test('isSupportedPostUrl rejects unsupported hosts and malformed paths', () => {
  assert.equal(isSupportedPostUrl('https://google.com/x'), false);
  assert.equal(isSupportedPostUrl('https://www.tiktok.com/@u/photo/7606119826259512584'), false);
  assert.equal(isSupportedPostUrl('https://x.com/user/likes/1234567890'), false);
});
