const { SOURCE_TYPES } = require('../core/constants/job-status');
const { EXTRACTOR_ERROR_CODES } = require('../core/constants/extractor-error-codes');
const { isSupportedPostUrl } = require('../core/utils/validation');
const { logger } = require('../core/lib/logger');

function isAccessChallengeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:AUTH_REQUIRED|BOT_CHALLENGE)/i.test(message);
}

function createExtractorError({ code, message, details = {}, cause = null }) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  if (cause) {
    error.cause = cause;
  }
  return error;
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

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    const mimeType = (parsed.searchParams.get('mime_type') || '').toLowerCase();

    // Exclude obvious static/login assets that are not post media candidates.
    if (hostname.includes('ttwstatic.com') || pathname.includes('/webapp-desktop/playback')) {
      return false;
    }

    // Exclude audio-only variants that occasionally appear in TikTok captures.
    if (mimeType.startsWith('audio_')) {
      return false;
    }
  } catch {
    // Ignore parse failures and fall back to string checks below.
  }

  if (/^https?:\/\/.+\.(mp4|webm|mov|m4v|gif)(\?.*)?$/i.test(url)) {
    return true;
  }

  if (/mime_type=video_[a-z0-9]+/i.test(url)) {
    return true;
  }

  if (/\/video\/tos\//i.test(url) || /\/aweme\/v1\/play\//i.test(url) || /\/obj\/tos[a-z-]*\//i.test(url)) {
    return true;
  }

  return false;
}

function hasSignedMediaHints(parsedUrl) {
  if (!parsedUrl || typeof parsedUrl !== 'object' || !parsedUrl.searchParams) {
    return false;
  }

  const hasExpiry =
    parsedUrl.searchParams.has('expire') ||
    parsedUrl.searchParams.has('x-expires') ||
    parsedUrl.searchParams.has('X-Expires');
  const hasSignature =
    parsedUrl.searchParams.has('signature') ||
    parsedUrl.searchParams.has('sig') ||
    parsedUrl.searchParams.has('tk') ||
    parsedUrl.searchParams.has('policy');

  return hasExpiry || hasSignature;
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
  if (/\/bytevc2\//i.test(pathValue)) {
    return 'bytevc2';
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
    isLikelyClean: false,
    isSigned: false,
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

    const hasWatermark =
      watermarkParam === '1' ||
      parsed.searchParams.get('is_watermark') === '1' ||
      parsed.searchParams.has('logo_name') ||
      /watermark/i.test(parsed.pathname) ||
      /watermark/i.test(parsed.search) ||
      /_watermark/i.test(parsed.pathname) ||
      /[?&]wm=1/i.test(url);

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
      hasWatermark,
      isLikelyClean: !hasWatermark && !/watermark/i.test(url) && !/logo_name/i.test(url),
      isSigned: hasSignedMediaHints(parsed),
      mimeType,
      codec: inferCodecFromPath(parsed.pathname),
    };
  } catch {
    return fallback;
  }
}

function extractVideoIdFromUrl(url) {
  if (typeof url !== 'string' || !url) {
    return '';
  }
  const match = /\/video\/(\d+)/i.exec(url);
  return match && match[1] ? String(match[1]) : '';
}

function getDirectQualityScore(url, targetVideoId = '') {
  const facts = getMediaCandidateFacts(url);

  // Identity verification: a URL whose item_id param matches the target video is
  // guaranteed to be the right video. Prioritise it above all quality criteria so
  // that a lower-resolution confirmed-target URL is always preferred over a
  // high-quality URL that might belong to a recommendation/autoplay video.
  let identityMatch = 0;
  if (targetVideoId) {
    try {
      const parsed = new URL(url);
      const itemId = parsed.searchParams.get('item_id');
      if (itemId === targetVideoId) {
        identityMatch = 1;
      }
    } catch {
      // ignore parse failures — URL remains unverified (identityMatch stays 0)
    }
  }

  return {
    identityMatch,
    nonWatermark: facts.hasWatermark ? 0 : 1,
    likelyClean: facts.isLikelyClean ? 1 : 0,
    signedPreference: facts.isSigned ? 1 : 0,
    area: facts.area,
    br: facts.br,
    bt: facts.bt,
    fps: facts.fps,
    codecPreference: facts.codec === 'bytevc2' ? -1 : facts.codec === 'avc1' ? 2 : facts.codec ? 1 : 0,
    mimePreference: facts.mimeType === 'video_mp4' ? 2 : facts.mimeType.startsWith('video_') ? 1 : 0,
  };
}

function compareDirectQuality(leftUrl, rightUrl, targetVideoId = '') {
  const left = getDirectQualityScore(leftUrl, targetVideoId);
  const right = getDirectQualityScore(rightUrl, targetVideoId);

  // Identity match is the absolute highest priority: a URL confirmed to belong to the
  // target video must win over any unconfirmed URL regardless of quality metrics.
  if (left.identityMatch !== right.identityMatch) {
    return right.identityMatch - left.identityMatch;
  }
  if (left.nonWatermark !== right.nonWatermark) {
    return right.nonWatermark - left.nonWatermark;
  }
  if (left.likelyClean !== right.likelyClean) {
    return right.likelyClean - left.likelyClean;
  }
  if (left.signedPreference !== right.signedPreference) {
    return right.signedPreference - left.signedPreference;
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

function pickBestDirectMediaUrl(urls, targetVideoId = '') {
  const candidates = urls.filter((url) => isDirectVideoCandidate(url));
  if (candidates.length === 0) {
    return '';
  }

  return candidates.sort((a, b) => compareDirectQuality(a, b, targetVideoId))[0];
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

function listCandidateMediaUrls(urls, targetVideoId = '') {
  if (!Array.isArray(urls) || urls.length === 0) {
    return [];
  }

  const directCandidates = urls
    .filter((url) => isDirectVideoCandidate(url))
    .sort((a, b) => compareDirectQuality(a, b, targetVideoId));

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

function pickMediaUrl(urls, targetVideoId = '') {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { mediaUrl: '', sourceType: SOURCE_TYPES.UNKNOWN, candidateUrls: [] };
  }

  const candidateUrls = listCandidateMediaUrls(urls, targetVideoId);
  const direct = pickBestDirectMediaUrl(urls, targetVideoId);
  if (direct) {
    return { mediaUrl: direct, sourceType: SOURCE_TYPES.DIRECT, candidateUrls };
  }

  const hls = urls.find((url) => isHlsCandidate(url));
  if (hls) {
    return { mediaUrl: hls, sourceType: SOURCE_TYPES.HLS, candidateUrls };
  }

  const fallbackCandidates = sanitizeUrlArray(urls).filter((url) => isDirectVideoCandidate(url) || isHlsCandidate(url));
  if (fallbackCandidates.length > 0) {
    return {
      mediaUrl: fallbackCandidates[0],
      sourceType: SOURCE_TYPES.UNKNOWN,
      candidateUrls,
    };
  }

  return { mediaUrl: '', sourceType: SOURCE_TYPES.UNKNOWN, candidateUrls };
}

async function extractFromTweet(tweetUrl, { pageFactory, telemetryContext } = {}) {
  const contextMeta = telemetryContext && typeof telemetryContext === 'object' ? telemetryContext : {};
  const startedAt = Date.now();
  if (!isSupportedPostUrl(tweetUrl)) {
    throw new Error('Invalid post URL');
  }

  if (typeof pageFactory !== 'function') {
    throw new Error('Extractor pageFactory is required');
  }

  const page = await pageFactory();
  let shouldClosePage = true;
  logger.info('extractor.request.started', {
    ...contextMeta,
    tweetUrl,
  });

  try {
    if (typeof page.goto === 'function') {
      const gotoStartedAt = Date.now();
      await page.goto(tweetUrl);
      logger.info('extractor.page.goto.completed', {
        ...contextMeta,
        tweetUrl,
        durationMs: Date.now() - gotoStartedAt,
      });
    }

    const mediaStartedAt = Date.now();
    const mediaUrls = typeof page.collectMediaUrls === 'function' ? await page.collectMediaUrls() : [];
    logger.info('extractor.collect.media_urls.completed', {
      ...contextMeta,
      tweetUrl,
      durationMs: Date.now() - mediaStartedAt,
      mediaUrlCount: Array.isArray(mediaUrls) ? mediaUrls.length : 0,
    });
    const imageStartedAt = Date.now();
    const imageUrls = typeof page.collectImageUrls === 'function' ? await page.collectImageUrls() : [];
    logger.info('extractor.collect.image_urls.completed', {
      ...contextMeta,
      tweetUrl,
      durationMs: Date.now() - imageStartedAt,
      imageUrlCount: Array.isArray(imageUrls) ? imageUrls.length : 0,
    });
    const metadataStartedAt = Date.now();
    const metadata = typeof page.collectPostMetadata === 'function' ? await page.collectPostMetadata() : {};

    // Merge TikTok-specific cover and author avatar from rehydration JSON.
    // These fields are only populated on TikTok pages; non-TikTok pages return {}.
    if (typeof page.collectTikTokMetadata === 'function') {
      try {
        const tikTokMeta = await page.collectTikTokMetadata();
        if (tikTokMeta && typeof tikTokMeta === 'object') {
          if (tikTokMeta.coverUrl) {
            metadata.coverUrl = tikTokMeta.coverUrl;
          }
          if (tikTokMeta.authorAvatarUrl) {
            metadata.authorAvatarUrl = tikTokMeta.authorAvatarUrl;
          }
        }
      } catch {
        // Non-blocking: if TikTok metadata extraction fails, proceed without it
      }
    }

    logger.info('extractor.collect.metadata.completed', {
      ...contextMeta,
      tweetUrl,
      durationMs: Date.now() - metadataStartedAt,
      metadataKeys: metadata && typeof metadata === 'object' ? Object.keys(metadata) : [],
    });
    const targetVideoId = extractVideoIdFromUrl(tweetUrl);
    const { mediaUrl, sourceType, candidateUrls } = pickMediaUrl(mediaUrls, targetVideoId);

    if (!mediaUrl) {
      const diagnostics = typeof page.collectPageDiagnostics === 'function'
        ? await page.collectPageDiagnostics()
        : {};

      const unavailable = /video currently unavailable/i.test(diagnostics.bodySnippet || '');

      const code = unavailable ? EXTRACTOR_ERROR_CODES.VIDEO_UNAVAILABLE : EXTRACTOR_ERROR_CODES.NO_MEDIA_URL;
      const message = unavailable
        ? 'Video is unavailable on source platform'
        : 'No media URL extracted from post';

      const mediaUrlCount = Array.isArray(mediaUrls) ? mediaUrls.length : 0;
      const imageUrlCount = Array.isArray(imageUrls) ? imageUrls.length : 0;
      const details = {
        mediaUrlCount,
        imageUrlCount,
        title: metadata?.title || diagnostics?.title || '',
        canonicalUrl: metadata?.canonicalUrl || diagnostics?.canonicalUrl || '',
        pageUrl: metadata?.pageUrl || '',
        finalUrl: diagnostics?.finalUrl || '',
        bodySnippet: diagnostics?.bodySnippet || '',
      };

      logger.error('extractor.pick_media.failed', {
        ...contextMeta,
        tweetUrl,
        mediaUrlCount,
        imageUrlCount,
        title: details.title,
        canonicalUrl: details.canonicalUrl,
        finalUrl: details.finalUrl,
        errorCode: code,
      });

      throw createExtractorError({ code, message, details });
    }

    const selectedFacts = getMediaCandidateFacts(mediaUrl);
    const candidateSummaries = sanitizeUrlArray(candidateUrls).map((candidateUrl) => ({
      url: candidateUrl,
      ...getMediaCandidateFacts(candidateUrl),
    }));
    const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};
    logger.info('extractor.request.completed', {
      ...contextMeta,
      tweetUrl,
      selectedMediaUrl: mediaUrl,
      sourceType,
      candidateCount: candidateSummaries.length,
      imageCount: Array.isArray(imageUrls) ? imageUrls.length : 0,
      durationMs: Date.now() - startedAt,
    });

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
    const message = error instanceof Error ? error.message : String(error);
    if (isAccessChallengeError(error)) {
      // Keep the browser tab open for manual challenge/login completion.
      shouldClosePage = false;
      logger.error('extractor.access_challenge', {
        ...contextMeta,
        tweetUrl,
        message,
        durationMs: Date.now() - startedAt,
      });
    } else {
      logger.error('extractor.request.failed', {
        ...contextMeta,
        tweetUrl,
        message,
        durationMs: Date.now() - startedAt,
      });
    }
    throw error;
  } finally {
    if (shouldClosePage && page && typeof page.close === 'function') {
      await page.close();
      logger.info('extractor.page.closed', {
        ...contextMeta,
        tweetUrl,
        durationMs: Date.now() - startedAt,
      });
    } else {
      logger.info('extractor.page.kept_open', {
        ...contextMeta,
        tweetUrl,
        durationMs: Date.now() - startedAt,
      });
    }
  }
}

module.exports = {
  extractFromTweet,
  pickMediaUrl,
  listCandidateMediaUrls,
  getMediaCandidateFacts,
  createExtractorError,
};
