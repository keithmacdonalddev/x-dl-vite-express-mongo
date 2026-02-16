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

function toPositiveInt(value) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getResolutionAreaFromPath(pathname) {
  if (typeof pathname !== 'string') {
    return 0;
  }

  const match = pathname.match(/(?:^|\/)(\d{2,5})x(\d{2,5})(?:\/|$)/);
  if (!match) {
    return 0;
  }

  const width = toPositiveInt(match[1]);
  const height = toPositiveInt(match[2]);
  if (!width || !height) {
    return 0;
  }

  return width * height;
}

function getDirectQualityScore(url) {
  const fallback = {
    nonWatermark: 1,
    area: 0,
    br: 0,
    bt: 0,
  };

  try {
    const parsed = new URL(url);
    const watermarkParam = parsed.searchParams.get('watermark') || parsed.searchParams.get('is_watermark') || '';
    const hasWatermark = watermarkParam === '1' || /watermark/i.test(parsed.pathname) || /watermark/i.test(parsed.search);

    return {
      nonWatermark: hasWatermark ? 0 : 1,
      area: getResolutionAreaFromPath(parsed.pathname),
      br: toPositiveInt(parsed.searchParams.get('br')),
      bt: toPositiveInt(parsed.searchParams.get('bt')),
    };
  } catch {
    return fallback;
  }
}

function compareDirectQuality(leftUrl, rightUrl) {
  const left = getDirectQualityScore(leftUrl);
  const right = getDirectQualityScore(rightUrl);

  if (left.nonWatermark !== right.nonWatermark) {
    return right.nonWatermark - left.nonWatermark;
  }
  if (left.area !== right.area) {
    return right.area - left.area;
  }
  if (left.br !== right.br) {
    return right.br - left.br;
  }
  if (left.bt !== right.bt) {
    return right.bt - left.bt;
  }
  return 0;
}

function pickBestDirectMediaUrl(urls) {
  const candidates = urls.filter((url) => isDirectVideoCandidate(url));
  if (candidates.length === 0) {
    return '';
  }

  return candidates.sort(compareDirectQuality)[0];
}

function pickMediaUrl(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { mediaUrl: '', sourceType: SOURCE_TYPES.UNKNOWN };
  }

  const direct = pickBestDirectMediaUrl(urls);
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
