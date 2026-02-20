const { resolvePlatform } = require('../../core/platforms/registry');

const UNKNOWN_PLATFORM = 'unknown';

function normalizeHostname(hostname) {
  return String(hostname || '').replace(/^www\./i, '').toLowerCase();
}

function getPostUrlInfo(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return { isValid: false, platform: UNKNOWN_PLATFORM, normalizedUrl: '' };
  }

  try {
    const normalizedUrl = input.trim();
    const parsed = new URL(normalizedUrl);
    const hostname = normalizeHostname(parsed.hostname);

    const match = resolvePlatform(hostname);
    if (!match) {
      return { isValid: false, platform: UNKNOWN_PLATFORM, normalizedUrl };
    }

    const { platform, isShortLink } = match;
    const isValid = isShortLink
      ? typeof platform.validateShortUrl === 'function'
        ? platform.validateShortUrl(parsed)
        : parsed.pathname.length > 1
      : platform.validateUrl(parsed);

    return { isValid, platform: platform.id, normalizedUrl };
  } catch {
    return { isValid: false, platform: UNKNOWN_PLATFORM, normalizedUrl: '' };
  }
}

function isEnabledForPlatform(platform, enabledPlatforms = {}) {
  if (platform === UNKNOWN_PLATFORM) return false;
  // Generic: any platform id present and not explicitly false is enabled
  return enabledPlatforms[platform] !== false;
}

function isSupportedPostUrl(input, { enabledPlatforms } = {}) {
  const info = getPostUrlInfo(input);
  if (!info.isValid) return false;
  return isEnabledForPlatform(info.platform, enabledPlatforms || {});
}

function canonicalizePostUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return '';
  }

  try {
    const parsed = new URL(input.trim());
    const protocol = parsed.protocol.toLowerCase();
    const hostname = normalizeHostname(parsed.hostname);
    let pathname = parsed.pathname || '/';
    if (pathname.length > 1) {
      pathname = pathname.replace(/\/+$/, '');
    }

    return `${protocol}//${hostname}${pathname}`;
  } catch {
    return '';
  }
}

// Backward-compatible name used throughout existing route/model code.
function isTweetUrl(input, options) {
  return isSupportedPostUrl(input, options);
}

function isHttpUrl(input) {
  if (typeof input !== 'string' || !input.trim()) return false;
  try {
    const parsed = new URL(input);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = {
  isTweetUrl,
  isSupportedPostUrl,
  getPostUrlInfo,
  canonicalizePostUrl,
  isHttpUrl,
};

