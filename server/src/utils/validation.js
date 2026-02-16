const X_HOSTS = new Set(['x.com', 'twitter.com']);
const TIKTOK_HOSTS = new Set(['tiktok.com', 'm.tiktok.com']);
const TIKTOK_SHORT_HOSTS = new Set(['vm.tiktok.com', 'vt.tiktok.com']);

function isXStatusUrl(parsed) {
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 3 || parts[1] !== 'status') {
    return false;
  }

  return /^\d+$/.test(parts[2]);
}

function isTikTokVideoUrl(parsed) {
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 3 || parts[1] !== 'video') {
    return false;
  }

  if (!parts[0].startsWith('@')) {
    return false;
  }

  return /^\d+$/.test(parts[2]);
}

function isSupportedPostUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return false;
  }

  try {
    const parsed = new URL(input);
    const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();

    if (X_HOSTS.has(hostname)) {
      return isXStatusUrl(parsed);
    }

    if (TIKTOK_HOSTS.has(hostname)) {
      return isTikTokVideoUrl(parsed);
    }

    if (TIKTOK_SHORT_HOSTS.has(hostname)) {
      // TikTok short links redirect to canonical video URLs.
      return parsed.pathname.length > 1;
    }

    return false;
  } catch {
    return false;
  }
}

// Backward-compatible name used throughout existing route/model code.
function isTweetUrl(input) {
  return isSupportedPostUrl(input);
}

function isHttpUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return false;
  }

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
  isHttpUrl,
};
