const { SOURCE_TYPES } = require('../constants/job-status');
const { isTweetUrl } = require('../utils/validation');

function pickMediaUrl(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { mediaUrl: '', sourceType: SOURCE_TYPES.UNKNOWN };
  }

  const direct = urls.find((url) => typeof url === 'string' && /^https?:\/\/.+\.mp4(\?.*)?$/i.test(url));
  if (direct) {
    return { mediaUrl: direct, sourceType: SOURCE_TYPES.DIRECT };
  }

  const hls = urls.find((url) => typeof url === 'string' && /\.m3u8(\?.*)?$/i.test(url));
  if (hls) {
    return { mediaUrl: hls, sourceType: SOURCE_TYPES.HLS };
  }

  const firstValid = urls.find((url) => typeof url === 'string' && /^https?:\/\//i.test(url));
  if (firstValid) {
    return { mediaUrl: firstValid, sourceType: SOURCE_TYPES.UNKNOWN };
  }

  return { mediaUrl: '', sourceType: SOURCE_TYPES.UNKNOWN };
}

async function extractFromTweet(tweetUrl, { pageFactory } = {}) {
  if (!isTweetUrl(tweetUrl)) {
    throw new Error('Invalid tweet URL');
  }

  if (typeof pageFactory !== 'function') {
    throw new Error('Extractor pageFactory is required');
  }

  const page = await pageFactory();

  try {
    if (typeof page.goto === 'function') {
      await page.goto(tweetUrl);
    }

    const mediaUrls = typeof page.collectMediaUrls === 'function' ? await page.collectMediaUrls() : [];
    const { mediaUrl, sourceType } = pickMediaUrl(mediaUrls);

    if (!mediaUrl) {
      throw new Error('No media URL extracted from tweet');
    }

    return {
      mediaUrl,
      sourceType,
    };
  } finally {
    if (page && typeof page.close === 'function') {
      await page.close();
    }
  }
}

module.exports = {
  extractFromTweet,
  pickMediaUrl,
};
