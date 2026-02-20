/**
 * Client-side platform registry.
 *
 * To add a new platform, add an entry to PLATFORMS below.
 * Mirror the hosts/shortHosts/validateUrl from the server-side platform definition.
 *
 * This file is the only place in the client that knows about platform hostnames.
 */

const PLATFORMS = [
  {
    id: 'x',
    label: 'X',
    hosts: new Set(['x.com', 'twitter.com']),
    shortHosts: new Set(),
    validateUrl(parsed) {
      const parts = parsed.pathname.split('/').filter(Boolean)
      return parts.length >= 3 && parts[1] === 'status' && /^\d+$/.test(parts[2])
    },
    validateShortUrl: null,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    hosts: new Set(['tiktok.com', 'm.tiktok.com']),
    shortHosts: new Set(['vm.tiktok.com', 'vt.tiktok.com']),
    validateUrl(parsed) {
      const parts = parsed.pathname.split('/').filter(Boolean)
      return (
        parts.length >= 3 &&
        parts[0].startsWith('@') &&
        parts[1] === 'video' &&
        /^\d+$/.test(parts[2])
      )
    },
    validateShortUrl(parsed) {
      return parsed.pathname.length > 1
    },
  },
]

// Build O(1) lookup maps
const hostMap = new Map()
const shortHostMap = new Map()

for (const platform of PLATFORMS) {
  for (const host of platform.hosts) {
    hostMap.set(host, platform)
  }
  if (platform.shortHosts) {
    for (const host of platform.shortHosts) {
      shortHostMap.set(host, platform)
    }
  }
}

/**
 * Given a raw URL string, returns the platform id ('x', 'tiktok', etc.)
 * or 'unknown' if no registered platform matches.
 */
export function detectPlatform(value) {
  try {
    const parsed = new URL(value)
    const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase()

    const p = hostMap.get(hostname)
    if (p) {
      return p.validateUrl(parsed) ? p.id : 'unknown'
    }

    const ps = shortHostMap.get(hostname)
    if (ps) {
      const valid = ps.validateShortUrl ? ps.validateShortUrl(parsed) : parsed.pathname.length > 1
      return valid ? ps.id : 'unknown'
    }

    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Returns a default capabilities object with all platforms enabled.
 * Used before the server responds with actual capabilities.
 */
export function getDefaultCapabilities() {
  return Object.fromEntries(PLATFORMS.map((p) => [p.id, true]))
}

/**
 * Normalizes a raw server capabilities payload into a flat { platformId: boolean } map.
 * Unknown keys are ignored; missing registered platforms default to true.
 */
export function normalizeCapabilities(payload) {
  const platforms = payload && typeof payload === 'object' ? payload.platforms : {}
  const result = {}
  for (const platform of PLATFORMS) {
    result[platform.id] = platforms[platform.id] !== false
  }
  return result
}

export { PLATFORMS }
