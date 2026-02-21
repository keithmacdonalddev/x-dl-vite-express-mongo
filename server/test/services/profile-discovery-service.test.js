'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeHandle,
  extractHandleFromTikTokUrl,
  resolveDiscoveryHandle,
} = require('../../src/services/profile-discovery-service');

test('normalizeHandle sanitizes and prefixes values', () => {
  assert.equal(normalizeHandle(' creator.name '), '@creator.name');
  assert.equal(normalizeHandle('@Creator_01'), '@Creator_01');
});

test('normalizeHandle rejects empty or unknown values', () => {
  assert.equal(normalizeHandle(''), '');
  assert.equal(normalizeHandle('unknown'), '');
  assert.equal(normalizeHandle('@@@'), '');
});

test('extractHandleFromTikTokUrl reads canonical TikTok post URLs', () => {
  assert.equal(
    extractHandleFromTikTokUrl('https://www.tiktok.com/@sample_user/video/7601673687430991122'),
    '@sample_user'
  );
});

test('resolveDiscoveryHandle prefers explicit accountHandle for short links', () => {
  const handle = resolveDiscoveryHandle({
    tweetUrl: 'https://vm.tiktok.com/ZMabc123/',
    accountHandle: '@known_handle',
    accountSlug: 'fallback_slug',
  });

  assert.equal(handle, '@known_handle');
});

test('resolveDiscoveryHandle prefers explicit accountHandle over URL handle', () => {
  const handle = resolveDiscoveryHandle({
    tweetUrl: 'https://www.tiktok.com/@url_handle/video/7601673687430991122',
    accountHandle: '@explicit_handle',
    accountSlug: 'fallback_slug',
  });

  assert.equal(handle, '@explicit_handle');
});

test('resolveDiscoveryHandle falls back to accountSlug when URL has no handle', () => {
  const handle = resolveDiscoveryHandle({
    tweetUrl: 'https://vt.tiktok.com/abcdef/',
    accountHandle: '',
    accountSlug: 'slug_from_job',
  });

  assert.equal(handle, '@slug_from_job');
});
