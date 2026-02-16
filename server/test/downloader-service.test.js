const test = require('node:test');
const assert = require('node:assert/strict');

test('chooseDownloadMode selects hls mode for m3u8 URLs', () => {
  const { chooseDownloadMode } = require('../src/services/downloader-service');

  const mode = chooseDownloadMode('https://video.twimg.com/ext_tw_video/123/pl/playlist.m3u8');
  assert.equal(mode, 'hls');
});

test('chooseDownloadMode selects direct mode for non-m3u8 URLs', () => {
  const { chooseDownloadMode } = require('../src/services/downloader-service');

  const mode = chooseDownloadMode('https://video.twimg.com/ext_tw_video/123/pu/vid/1280x720/video.mp4');
  assert.equal(mode, 'direct');
});

test('downloadMedia delegates to direct strategy when URL is direct media', async () => {
  const { downloadMedia } = require('../src/services/downloader-service');

  let directCalled = false;
  let hlsCalled = false;

  const result = await downloadMedia('https://video.twimg.com/v/clip.mp4', {
    targetPath: 'downloads/a.mp4',
    directDownloader: async () => {
      directCalled = true;
      return { outputPath: 'downloads/a.mp4' };
    },
    hlsDownloader: async () => {
      hlsCalled = true;
      return { outputPath: 'downloads/a.mp4' };
    },
  });

  assert.equal(directCalled, true);
  assert.equal(hlsCalled, false);
  assert.equal(result.mode, 'direct');
  assert.equal(result.outputPath, 'downloads/a.mp4');
});

test('downloadMedia delegates to hls strategy when URL points to a playlist', async () => {
  const { downloadMedia } = require('../src/services/downloader-service');

  let directCalled = false;
  let hlsCalled = false;

  const result = await downloadMedia('https://video.twimg.com/v/playlist.m3u8', {
    targetPath: 'downloads/a.mp4',
    directDownloader: async () => {
      directCalled = true;
      return { outputPath: 'downloads/a.mp4' };
    },
    hlsDownloader: async () => {
      hlsCalled = true;
      return { outputPath: 'downloads/a.mp4' };
    },
  });

  assert.equal(directCalled, false);
  assert.equal(hlsCalled, true);
  assert.equal(result.mode, 'hls');
  assert.equal(result.outputPath, 'downloads/a.mp4');
});
