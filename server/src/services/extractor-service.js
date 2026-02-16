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

function getResolutionFromSearchParams(searchParams) {
  const width =
    toPositiveInt(searchParams.get('vw')) ||
    toPositiveInt(searchParams.get('width')) ||
    toPositiveInt(searchParams.get('video_width'));
  const height =
    toPositiveInt(searchParams.get('vh')) ||
    toPositiveInt(searchParams.get('height')) ||
    toPositiveInt(searchParams.get('video_height'));

  if (!width || !height) {
    return { width: 0, height: 0 };
  }

  return { width, height };
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

function inferCodecFromPath(pathname) {
  const pathValue = String(pathname || '').toLowerCase();
  if (pathValue.includes('/avc1/')) {
    return 'avc1';
  }
  if (pathValue.includes('/h265/') || pathValue.includes('/hevc/')) {
    return 'h265';
  }
  if (pathValue.includes('/vp9/')) {
    return 'vp9';
  }
  return '';
}

function getMediaCandidateFacts(url) {
  const fallback = {
    host: '',
    isDirect: false,
    isHls: false,
    width: 0,
    height: 0,
    area: 0,
    br: 0,
    bt: 0,
    fps: 0,
    hasWatermark: false,
    mimeType: '',
    codec: '',
  };

  try {
    const parsed = new URL(url);
    const { width, height } = getResolutionFromSearchParams(parsed.searchParams);
    const areaFromParams = width && height ? width * height : 0;
    const area = areaFromParams || getResolutionAreaFromPath(parsed.pathname);
    const watermarkParam = parsed.searchParams.get('watermark') || parsed.searchParams.get('is_watermark') || '';
    const mimeType = (parsed.searchParams.get('mime_type') || '').toLowerCase();

    return {
      host: parsed.hostname,
      isDirect: isDirectVideoCandidate(url),
      isHls: isHlsCandidate(url),
      width,
      height,
      area,
      br: toPositiveInt(parsed.searchParams.get('br')),
      bt: toPositiveInt(parsed.searchParams.get('bt')),
      fps: toPositiveInt(parsed.searchParams.get('fps')),
      hasWatermark: watermarkParam === '1' || /watermark/i.test(parsed.pathname) || /watermark/i.test(parsed.search),
      mimeType,
      codec: inferCodecFromPath(parsed.pathname),
    };
  } catch {
    return fallback;
  }
}

function getDirectQualityScore(url) {
  const facts = getMediaCandidateFacts(url);

  return {
    nonWatermark: facts.hasWatermark ? 0 : 1,
    area: facts.area,
    br: facts.br,
    bt: facts.bt,
    fps: facts.fps,
    codecPreference: facts.codec === 'avc1' ? 2 : facts.codec ? 1 : 0,
    mimePreference: facts.mimeType === 'video_mp4' ? 2 : facts.mimeType.startsWith('video_') ? 1 : 0,
  };
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
  if (left.fps !== right.fps) {
    return right.fps - left.fps;
  }
  if (left.codecPreference !== right.codecPreference) {
    return right.codecPreference - left.codecPreference;
  }
  if (left.mimePreference !== right.mimePreference) {
    return right.mimePreference - left.mimePreference;
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

function compareHlsQuality(leftUrl, rightUrl) {
  const left = getMediaCandidateFacts(leftUrl);
  const right = getMediaCandidateFacts(rightUrl);

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

function listCandidateMediaUrls(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return [];
  }

  const directCandidates = urls
    .filter((url) => isDirectVideoCandidate(url))
    .sort(compareDirectQuality);

  const hlsCandidates = urls.filter((url) => isHlsCandidate(url)).sort(compareHlsQuality);

  const combined = [...directCandidates, ...hlsCandidates];
  return Array.from(new Set(combined));
}

function sanitizeUrlArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const cleaned = values.filter((value) => typeof value === 'string' && /^https?:\/\//i.test(value));
  return Array.from(new Set(cleaned));
}

function pickMediaUrl(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { mediaUrl: '', sourceType: SOURCE_TYPES.UNKNOWN, candidateUrls: [] };
  }

  const candidateUrls = listCandidateMediaUrls(urls);
  const direct = pickBestDirectMediaUrl(urls);
  if (direct) {
    return { mediaUrl: direct, sourceType: SOURCE_TYPES.DIRECT, candidateUrls };
  }

  const hls = urls.find((url) => isHlsCandidate(url));
  if (hls) {
    return { mediaUrl: hls, sourceType: SOURCE_TYPES.HLS, candidateUrls };
  }

  const firstValid = urls.find((url) => typeof url === 'string' && /^https?:\/\//i.test(url));
  if (firstValid) {
    return { mediaUrl: firstValid, sourceType: SOURCE_TYPES.UNKNOWN, candidateUrls };
  }

  return { mediaUrl: '', sourceType: SOURCE_TYPES.UNKNOWN, candidateUrls };
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
    const imageUrls = typeof page.collectImageUrls === 'function' ? await page.collectImageUrls() : [];
    const metadata = typeof page.collectPostMetadata === 'function' ? await page.collectPostMetadata() : {};
    const { mediaUrl, sourceType, candidateUrls } = pickMediaUrl(mediaUrls);

    if (!mediaUrl) {
      throw new Error('No media URL extracted from post');
    }

    const selectedFacts = getMediaCandidateFacts(mediaUrl);
    const candidateSummaries = sanitizeUrlArray(candidateUrls).map((candidateUrl) => ({
      url: candidateUrl,
      ...getMediaCandidateFacts(candidateUrl),
    }));
    const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};

    return {
      mediaUrl,
      sourceType,
      candidateUrls: sanitizeUrlArray(candidateUrls),
      imageUrls: sanitizeUrlArray(imageUrls),
      metadata: {
        ...safeMetadata,
        selectedMediaUrl: mediaUrl,
        selectedMediaType: sourceType,
        selectedMedia: selectedFacts,
        candidateCount: candidateSummaries.length,
        candidateSummaries,
      },
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
  listCandidateMediaUrls,
  getMediaCandidateFacts,
};
