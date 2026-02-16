const test = require('node:test');
const assert = require('node:assert/strict');

test('extractFromTweet returns direct media URL payload shape', async () => {
  const { extractFromTweet } = require('../src/services/extractor-service');

  let closed = false;

  const fakeFactory = async () => ({
    goto: async () => {},
    collectMediaUrls: async () => [
      'https://video.twimg.com/ext_tw_video/123/pu/vid/1280x720/video.mp4',
      'https://video.twimg.com/ext_tw_video/123/pl/playlist.m3u8',
    ],
    close: async () => {
      closed = true;
    },
  });

  const data = await extractFromTweet('https://x.com/u/status/1234567890', { pageFactory: fakeFactory });

  assert.equal(typeof data.mediaUrl, 'string');
  assert.match(data.mediaUrl, /^https?:\/\//);
  assert.equal(data.sourceType, 'direct');
  assert.equal(closed, true);
});

test('extractFromTweet throws for invalid tweet URL input', async () => {
  const { extractFromTweet } = require('../src/services/extractor-service');

  await assert.rejects(
    async () => extractFromTweet('https://google.com/anything', { pageFactory: async () => ({}) }),
    /invalid tweet url/i
  );
});
