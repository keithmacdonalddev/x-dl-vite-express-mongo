const path = require('node:path');

function sanitizeAccountSlug(input) {
  const raw = typeof input === 'string' ? input : '';
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned || 'unknown';
}

function normalizePlatform(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
  if (host === 'x.com' || host === 'twitter.com') {
    return 'x';
  }
  if (host.endsWith('tiktok.com')) {
    return 'tiktok';
  }
  return 'unknown';
}

function parseHandleFromPath(platform, pathname) {
  const parts = String(pathname || '')
    .split('/')
    .filter(Boolean);

  if (platform === 'tiktok' && parts.length > 0 && parts[0].startsWith('@')) {
    return parts[0];
  }

  if (platform === 'x' && parts.length > 0) {
    const first = parts[0];
    if (first !== 'i' && first !== 'home' && first !== 'explore') {
      return first.startsWith('@') ? first : `@${first}`;
    }
  }

  return '';
}

function deriveAccountProfile({ postUrl, metadata } = {}) {
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};
  let platform = 'unknown';
  let handle = '';

  try {
    const parsed = new URL(String(postUrl || ''));
    platform = normalizePlatform(parsed.hostname);
    handle = parseHandleFromPath(platform, parsed.pathname);
  } catch {
    platform = 'unknown';
  }

  const displayName = handle || safeMetadata.author || '';
  const slugSource = handle || safeMetadata.author || platform;
  const accountSlug = sanitizeAccountSlug(slugSource);

  return {
    platform,
    handle,
    displayName,
    accountSlug,
  };
}

function inferExtensionFromUrl(url, fallback = '.jpg') {
  if (typeof url !== 'string' || !url) {
    return fallback;
  }

  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname || '').toLowerCase();
    const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.mp4']);
    if (ext && ext.length <= 8 && allowed.has(ext)) {
      return ext;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function normalizePathForApi(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.split(path.sep).join('/');
}

module.exports = {
  sanitizeAccountSlug,
  deriveAccountProfile,
  inferExtensionFromUrl,
  normalizePathForApi,
};
