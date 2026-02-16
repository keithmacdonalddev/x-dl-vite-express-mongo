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
    collectImageUrls: async () => [
      'https://p16-sign-va.tiktokcdn.com/image1.jpg',
      'https://p16-sign-va.tiktokcdn.com/image1.jpg',
      'bad-url',
    ],
    collectPostMetadata: async () => ({
      title: 'Some post title',
      description: 'Some description',
      author: 'some-author',
    }),
    close: async () => {
      closed = true;
    },
  });

  const data = await extractFromTweet('https://x.com/u/status/1234567890', { pageFactory: fakeFactory });

  assert.equal(typeof data.mediaUrl, 'string');
  assert.match(data.mediaUrl, /^https?:\/\//);
  assert.equal(data.sourceType, 'direct');
  assert.ok(Array.isArray(data.candidateUrls));
  assert.ok(data.candidateUrls.length >= 2);
  assert.deepEqual(data.imageUrls, ['https://p16-sign-va.tiktokcdn.com/image1.jpg']);
  assert.equal(data.metadata.title, 'Some post title');
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

test('pickMediaUrl prefers higher TikTok bitrate direct URL', () => {
  const { pickMediaUrl } = require('../src/services/extractor-service');

  const low = 'https://v16-webapp-prime.tiktok.com/video/tos/alisg/path/?mime_type=video_mp4&br=900&bt=450';
  const high = 'https://v16-webapp-prime.tiktok.com/video/tos/alisg/path/?mime_type=video_mp4&br=3200&bt=1600';

  const picked = pickMediaUrl([low, high]);
  assert.equal(picked.sourceType, 'direct');
  assert.equal(picked.mediaUrl, high);
});

test('pickMediaUrl prefers higher resolution direct URL when present', () => {
  const { pickMediaUrl } = require('../src/services/extractor-service');

  const lowRes = 'https://video.twimg.com/ext_tw_video/1/pu/vid/640x360/video.mp4';
  const highRes = 'https://video.twimg.com/ext_tw_video/1/pu/vid/1280x720/video.mp4';

  const picked = pickMediaUrl([lowRes, highRes]);
  assert.equal(picked.sourceType, 'direct');
  assert.equal(picked.mediaUrl, highRes);
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
