const { SOURCE_TYPES } = require('../constants/job-status');
const { isSupportedPostUrl } = require('../utils/validation');

function isAccessChallengeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:AUTH_REQUIRED|BOT_CHALLENGE)/i.test(message);
}

function isHlsCandidate(url) {
  if (typeof url !== 'string') {
    return false;
  }

  if (/\.m3u8(\?.*)?$/i.test(url)) {
    return true;
  }

  return /mime_type=(application%2Fvnd\.apple\.mpegurl|application%2Fx-mpegurl)/i.test(url);
}

function isDirectVideoCandidate(url) {
  if (typeof url !== 'string') {
    return false;
  }

  if (/^https?:\/\/.+\.(mp4|webm|mov|m4v|gif)(\?.*)?$/i.test(url)) {
    return true;
  }

  if (/mime_type=video_[a-z0-9]+/i.test(url)) {
    return true;
  }

  if (/\/video\/tos\//i.test(url) || /\/aweme\/v1\/play\//i.test(url)) {
    return true;
  }

  return false;
}

function pickMediaUrl(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { mediaUrl: '', sourceType: SOURCE_TYPES.UNKNOWN };
  }

  const direct = urls.find((url) => isDirectVideoCandidate(url));
  if (direct) {
    return { mediaUrl: direct, sourceType: SOURCE_TYPES.DIRECT };
  }

  const hls = urls.find((url) => isHlsCandidate(url));
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
  if (!isSupportedPostUrl(tweetUrl)) {
    throw new Error('Invalid post URL');
  }

  if (typeof pageFactory !== 'function') {
    throw new Error('Extractor pageFactory is required');
  }

  const page = await pageFactory();
  let shouldClosePage = true;

  try {
    if (typeof page.goto === 'function') {
      await page.goto(tweetUrl);
    }

    const mediaUrls = typeof page.collectMediaUrls === 'function' ? await page.collectMediaUrls() : [];
    const { mediaUrl, sourceType } = pickMediaUrl(mediaUrls);

    if (!mediaUrl) {
      throw new Error('No media URL extracted from post');
    }

    return {
      mediaUrl,
      sourceType,
    };
  } catch (error) {
    if (isAccessChallengeError(error)) {
      // Keep the browser tab open for manual challenge/login completion.
      shouldClosePage = false;
    }
    throw error;
  } finally {
    if (shouldClosePage && page && typeof page.close === 'function') {
      await page.close();
    }
  }
}

module.exports = {
  extractFromTweet,
  pickMediaUrl,
};
