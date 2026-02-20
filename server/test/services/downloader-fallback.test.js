'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { downloadDirect } = require('../../src/services/downloader-service');

test('downloadDirect falls back to browser navigation when direct and auth attempts return 403', async () => {
  const calls = {
    auth: 0,
    browser: 0,
  };

  const response403 = {
    ok: false,
    status: 403,
    body: null,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === 'content-type') {
          return 'text/plain';
        }
        return '';
      },
    },
  };

  const result = await downloadDirect('https://v16m.tiktokcdn.com/video/tos/test.mp4?expire=9999999999', {
    targetPath: 'downloads/test.mp4',
    fetchImpl: async () => response403,
    authenticatedDownloader: async () => {
      calls.auth += 1;
      throw new Error('Authenticated direct download failed with status 403');
    },
    browserNavigationDownloader: async () => {
      calls.browser += 1;
      return {
        outputPath: 'downloads/test.mp4',
        mode: 'direct',
        bytes: 204800,
        contentType: 'video/mp4',
      };
    },
  });

  assert.equal(calls.auth, 1);
  assert.equal(calls.browser, 1);
  assert.equal(result.outputPath, 'downloads/test.mp4');
  assert.equal(result.mode, 'direct');
  assert.equal(result.bytes, 204800);
});
