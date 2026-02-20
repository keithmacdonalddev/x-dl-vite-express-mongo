'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractFromTweet } = require('../../src/services/extractor-service');
const { EXTRACTOR_ERROR_CODES } = require('../../src/core/constants/extractor-error-codes');

test('extractFromTweet throws typed unavailable error for unavailable page diagnostics', async () => {
  const pageFactory = async () => ({
    goto: async () => {},
    collectMediaUrls: async () => [],
    collectImageUrls: async () => [],
    collectPostMetadata: async () => ({
      title: 'TikTok - Make Your Day',
      canonicalUrl: '',
      pageUrl: 'https://www.tiktok.com/@addisonre/video/7321895430207577390',
      author: '@addisonre',
    }),
    collectPageDiagnostics: async () => ({
      title: 'TikTok - Make Your Day',
      canonicalUrl: '',
      finalUrl: 'https://www.tiktok.com/@addisonre/video/7321895430207577390',
      bodySnippet: 'Video currently unavailable',
    }),
    close: async () => {},
  });

  await assert.rejects(
    extractFromTweet('https://www.tiktok.com/@addisonre/video/7321895430207577390', { pageFactory }),
    (err) => {
      assert.equal(err.code, EXTRACTOR_ERROR_CODES.VIDEO_UNAVAILABLE);
      assert.equal(err.details.title, 'TikTok - Make Your Day');
      assert.equal(err.details.canonicalUrl, '');
      assert.match(err.details.bodySnippet, /Video currently unavailable/i);
      return true;
    }
  );
});

test('extractFromTweet throws NO_MEDIA_URL code when diagnostics do not indicate unavailable page', async () => {
  const pageFactory = async () => ({
    goto: async () => {},
    collectMediaUrls: async () => [],
    collectImageUrls: async () => [],
    collectPostMetadata: async () => ({ title: 'TikTok - Make Your Day', canonicalUrl: '', pageUrl: 'https://www.tiktok.com/@x/video/1' }),
    collectPageDiagnostics: async () => ({ bodySnippet: 'Some generic page content', title: 'TikTok - Make Your Day', canonicalUrl: '', finalUrl: 'https://www.tiktok.com/@x/video/1' }),
    close: async () => {},
  });

  await assert.rejects(
    extractFromTweet('https://www.tiktok.com/@x/video/1', { pageFactory }),
    (err) => {
      assert.equal(err.code, EXTRACTOR_ERROR_CODES.NO_MEDIA_URL);
      assert.equal(err.details.mediaUrlCount, 0);
      assert.equal(err.details.imageUrlCount, 0);
      assert.equal(err.details.title, 'TikTok - Make Your Day');
      return true;
    }
  );
});
