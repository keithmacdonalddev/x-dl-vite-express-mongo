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

test('extractFromTweet accepts TikTok-style direct media candidates without file extension', async () => {
  const { pickMediaUrl } = require('../src/services/extractor-service');

  const picked = pickMediaUrl([
    'https://v19-webapp-prime.tiktok.com/video/tos/alisg/tos-alisg-pve-0037c001/o48THMGOIDCIRKOheIAAEoVLcLOFjemjgvej4X/?a=1988&mime_type=video_mp4',
    'https://example.com/not-media',
  ]);

  assert.equal(picked.sourceType, 'direct');
  assert.match(picked.mediaUrl, /tiktok\.com\/video\/tos\//i);
});

test('extractFromTweet throws for invalid post URL input', async () => {
  const { extractFromTweet } = require('../src/services/extractor-service');

  await assert.rejects(
    async () => extractFromTweet('https://google.com/anything', { pageFactory: async () => ({}) }),
    /invalid post url/i
  );
});

test('extractFromTweet keeps page open when access challenge is detected', async () => {
  const { extractFromTweet } = require('../src/services/extractor-service');

  let closed = false;
  const fakeFactory = async () => ({
    goto: async () => {
      throw new Error('BOT_CHALLENGE: manual interaction required');
    },
    collectMediaUrls: async () => [],
    close: async () => {
      closed = true;
    },
  });

  await assert.rejects(
    async () => extractFromTweet('https://www.tiktok.com/@u/video/7606119826259512584', { pageFactory: fakeFactory }),
    /BOT_CHALLENGE/i
  );

  assert.equal(closed, false);
});
