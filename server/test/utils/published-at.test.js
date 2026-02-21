'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parsePublishedAt,
  extractTikTokVideoIdFromUrl,
  derivePublishedAtFromTikTokVideoId,
  resolvePublishedAt,
} = require('../../src/core/utils/published-at');

test('parsePublishedAt supports ISO strings, seconds, and milliseconds', () => {
  const iso = parsePublishedAt('2026-02-21T00:00:00.000Z');
  const seconds = parsePublishedAt(1768694400);
  const milliseconds = parsePublishedAt(1768694400000);

  assert.ok(iso instanceof Date);
  assert.ok(seconds instanceof Date);
  assert.ok(milliseconds instanceof Date);
  assert.equal(iso.toISOString(), '2026-02-21T00:00:00.000Z');
  assert.equal(seconds.toISOString(), '2026-01-18T00:00:00.000Z');
  assert.equal(milliseconds.toISOString(), '2026-01-18T00:00:00.000Z');
});

test('extractTikTokVideoIdFromUrl returns numeric id from canonical TikTok URL', () => {
  const id = extractTikTokVideoIdFromUrl('https://www.tiktok.com/@creator/video/7601673687430991122');
  assert.equal(id, '7601673687430991122');
});

test('derivePublishedAtFromTikTokVideoId decodes timestamp from video id', () => {
  const publishedAt = derivePublishedAtFromTikTokVideoId('7601673687430991122');
  assert.ok(publishedAt instanceof Date);
  assert.equal(publishedAt.toISOString(), '2026-01-31T23:36:17.000Z');
});

test('resolvePublishedAt prefers explicit value then metadata then TikTok video id', () => {
  const fromExplicit = resolvePublishedAt({
    publishedAt: '2026-02-20T12:00:00.000Z',
    metadataPublishedAt: '2026-02-19T12:00:00.000Z',
    tweetUrl: 'https://www.tiktok.com/@creator/video/7601673687430991122',
  });
  const fromMetadata = resolvePublishedAt({
    metadataPublishedAt: '2026-02-19T12:00:00.000Z',
    tweetUrl: 'https://www.tiktok.com/@creator/video/7601673687430991122',
  });
  const fromVideoId = resolvePublishedAt({
    tweetUrl: 'https://www.tiktok.com/@creator/video/7601673687430991122',
  });

  assert.equal(fromExplicit.toISOString(), '2026-02-20T12:00:00.000Z');
  assert.equal(fromMetadata.toISOString(), '2026-02-19T12:00:00.000Z');
  assert.equal(fromVideoId.toISOString(), '2026-01-31T23:36:17.000Z');
});
