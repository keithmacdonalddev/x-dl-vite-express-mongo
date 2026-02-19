/**
 * Platform registry.
 *
 * To add a new platform:
 *   1. Create server/src/platforms/<name>/index.js following the x or tiktok template
 *   2. require() it here and add it to PLATFORMS
 *   3. Add ENABLE_<NAME>=true to server/.env.example
 *   4. Add the platform's hosts to the client intake classifier (useIntake.js)
 *
 * Nothing else in the codebase needs to change.
 */

const x = require('../../platforms/x');
const tiktok = require('../../platforms/tiktok');

/** Ordered list of all registered platforms. Order determines match priority. */
const PLATFORMS = [x, tiktok];

// Build lookup maps at startup — O(1) host → platform resolution at runtime
const hostMap = new Map(); // canonical host → platform
const shortHostMap = new Map(); // short-link host → platform

for (const platform of PLATFORMS) {
  for (const host of platform.hosts) {
    hostMap.set(host, platform);
  }
  if (platform.shortHosts) {
    for (const host of platform.shortHosts) {
      shortHostMap.set(host, platform);
    }
  }
}

/**
 * Resolve a hostname to its platform definition, or null if unknown.
 * @param {string} hostname — already lowercased, www-stripped
 * @returns {{ platform, isShortLink } | null}
 */
function resolvePlatform(hostname) {
  const p = hostMap.get(hostname);
  if (p) return { platform: p, isShortLink: false };
  const ps = shortHostMap.get(hostname);
  if (ps) return { platform: ps, isShortLink: true };
  return null;
}

/**
 * Find the platform whose isMediaHost() returns true for a given CDN hostname.
 * Used by the downloader to set correct headers and referer.
 */
function resolvePlatformByMediaHost(mediaUrl) {
  let hostname = '';
  try {
    hostname = new URL(mediaUrl).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }

  // Check mediaPathPatterns first (for platforms like TikTok with non-standard URLs)
  for (const platform of PLATFORMS) {
    if (platform.mediaPathPatterns && platform.mediaPathPatterns.length > 0) {
      for (const pattern of platform.mediaPathPatterns) {
        if (pattern.test(mediaUrl)) return platform;
      }
    }
  }

  for (const platform of PLATFORMS) {
    if (typeof platform.isMediaHost === 'function' && platform.isMediaHost(hostname)) {
      return platform;
    }
  }

  return null;
}

/**
 * Returns all platforms that have auth-wall blocking enabled.
 * Used by playwright-adapter to decide whether a login-wall is a hard error.
 */
function getAuthBlockingHosts() {
  const hosts = new Set();
  for (const platform of PLATFORMS) {
    if (platform.authWallBlocks) {
      for (const host of platform.hosts) {
        hosts.add(host);
      }
    }
  }
  return hosts;
}

/**
 * Returns the combined set of mediaPathPatterns across all platforms.
 * Used by playwright-adapter for response interception.
 */
function getAllMediaPathPatterns() {
  return PLATFORMS.flatMap((p) => p.mediaPathPatterns || []);
}

/**
 * Returns whether a given post URL belongs to a platform that needs
 * 403-refresh retry logic.
 */
function platformNeeds403Refresh(postUrl) {
  try {
    const hostname = new URL(postUrl).hostname.replace(/^www\./i, '').toLowerCase();
    const match = hostMap.get(hostname) || shortHostMap.get(hostname);
    return match ? match.needs403Refresh === true : false;
  } catch {
    return false;
  }
}

module.exports = {
  PLATFORMS,
  resolvePlatform,
  resolvePlatformByMediaHost,
  getAuthBlockingHosts,
  getAllMediaPathPatterns,
  platformNeeds403Refresh,
};
