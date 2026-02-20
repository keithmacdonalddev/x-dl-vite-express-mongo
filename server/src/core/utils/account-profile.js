const path = require('node:path');
const { resolvePlatform } = require('../../core/platforms/registry');

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

function deriveAccountProfile({ postUrl, metadata } = {}) {
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};
  let platform = 'unknown';
  let handle = '';

  try {
    const parsed = new URL(String(postUrl || ''));
    const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const match = resolvePlatform(hostname);

    if (match) {
      platform = match.platform.id;
      if (typeof match.platform.extractHandle === 'function') {
        handle = match.platform.extractHandle(parsed) || '';
      }
    }
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
  if (typeof url !== 'string' || !url) return fallback;
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname || '').toLowerCase();
    const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.mp4']);
    if (ext && ext.length <= 8 && allowed.has(ext)) return ext;
  } catch {
    return fallback;
  }
  return fallback;
}

function normalizePathForApi(value) {
  if (typeof value !== 'string') return '';
  return value.split(path.sep).join('/');
}

module.exports = {
  sanitizeAccountSlug,
  deriveAccountProfile,
  inferExtensionFromUrl,
  normalizePathForApi,
};

