/**
 * Platform definition for TikTok.
 * Owned by the TikTok platform team.
 */

const HOSTS = new Set(['tiktok.com', 'm.tiktok.com']);
const SHORT_HOSTS = new Set(['vm.tiktok.com', 'vt.tiktok.com']);

function validateUrl(parsed) {
  const parts = parsed.pathname.split('/').filter(Boolean);
  // Requires /@handle/video/<numeric-id>
  return (
    parts.length >= 3 &&
    parts[0].startsWith('@') &&
    parts[1] === 'video' &&
    /^\d+$/.test(parts[2])
  );
}

function validateShortUrl(parsed) {
  // Short links like vm.tiktok.com/XYZ redirect to canonical video URLs
  return parsed.pathname.length > 1;
}

function extractHandle(parsed) {
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length > 0 && parts[0].startsWith('@')) {
    return parts[0];
  }
  return '';
}

function isMediaHost(hostname) {
  return (
    hostname.includes('tiktok') ||
    hostname.includes('byteoversea') ||
    hostname.includes('snssdk') ||
    hostname.includes('ibyteimg') ||
    hostname.includes('ibytedtos') ||
    hostname.includes('muscdn') ||
    hostname.includes('musical.ly')
  );
}

/** Extra request headers required for TikTok's CDN */
const downloadHeaders = {
  origin: 'https://www.tiktok.com',
  'sec-fetch-dest': 'video',
  'sec-fetch-mode': 'no-cors',
  'sec-fetch-site': 'cross-site',
};

/** Referer to send when fetching media from TikTok */
const referer = 'https://www.tiktok.com/';

/**
 * TikTok CDN URLs expire quickly. Re-extract a fresh URL and retry on 403.
 */
const needs403Refresh = true;

/**
 * TikTok pages often show "log in" UI text even for fully public videos.
 * Treating login-wall text as a hard block causes too many false positives.
 */
const authWallBlocks = false;

/**
 * TikTok media responses don't always have standard video file extensions.
 * These path patterns identify TikTok media responses during browser interception.
 */
const mediaPathPatterns = [
  /\/video\/tos\//i,
  /\/aweme\/v1\/play\//i,
  /\/obj\/tos[a-z-]*\//i,
];

module.exports = {
  id: 'tiktok',
  label: 'TikTok',
  envFlag: 'ENABLE_TIKTOK',
  hosts: HOSTS,
  shortHosts: SHORT_HOSTS,
  validateUrl,
  validateShortUrl,
  extractHandle,
  isMediaHost,
  downloadHeaders,
  referer,
  needs403Refresh,
  authWallBlocks,
  mediaPathPatterns,
};
