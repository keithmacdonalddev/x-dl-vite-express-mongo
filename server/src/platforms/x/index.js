/**
 * Platform definition for X (Twitter).
 * Owned by the X platform team.
 */

const HOSTS = new Set(['x.com', 'twitter.com']);

function validateUrl(parsed) {
  const parts = parsed.pathname.split('/').filter(Boolean);
  // Requires /<handle>/status/<numeric-id>
  return parts.length >= 3 && parts[1] === 'status' && /^\d+$/.test(parts[2]);
}

function extractHandle(parsed) {
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0];
  if (first === 'i' || first === 'home' || first === 'explore') return '';
  return first.startsWith('@') ? first : `@${first}`;
}

function isMediaHost(hostname) {
  return (
    hostname === 'x.com' ||
    hostname === 'twitter.com' ||
    hostname.endsWith('.x.com') ||
    hostname.endsWith('.twitter.com') ||
    hostname.endsWith('.twimg.com')
  );
}

/** Extra request headers required for this platform's CDN */
const downloadHeaders = {};

/** Referer to send when fetching media from this platform */
const referer = 'https://x.com/';

/**
 * Whether to re-extract a fresh URL and retry when the downloader gets a 403.
 * X signed URLs expire quickly so refresh is worth attempting.
 */
const needs403Refresh = false;

/**
 * Whether login-wall text on this platform's pages should be treated as a
 * blocking auth error. X restricts many posts behind login.
 */
const authWallBlocks = true;

/** TikTok-style path patterns for media interception — not needed for X */
const mediaPathPatterns = [];

module.exports = {
  id: 'x',
  label: 'X',
  envFlag: 'ENABLE_X',
  hosts: HOSTS,
  shortHosts: new Set(),
  validateUrl,
  extractHandle,
  isMediaHost,
  downloadHeaders,
  referer,
  needs403Refresh,
  authWallBlocks,
  mediaPathPatterns,
};
