'use strict';

const MIN_REASONABLE_PUBLISHED_AT_MS = Date.UTC(2016, 0, 1);
const MAX_FUTURE_SKEW_MS = 1000 * 60 * 60 * 24 * 3;

function toFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function parsePublishedAt(value) {
  if (!value) return null;

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return new Date(value.getTime());
  }

  const numeric = toFiniteNumber(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    const asMs = numeric > 1e12 ? numeric : numeric * 1000;
    const date = new Date(asMs);
    if (Number.isFinite(date.getTime())) return date;
    return null;
  }

  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value.trim());
    if (Number.isFinite(date.getTime())) return date;
  }

  return null;
}

function extractTikTokVideoIdFromUrl(url) {
  if (typeof url !== 'string' || !url) return '';
  const match = /\/video\/(\d+)/i.exec(url);
  return match ? match[1] : '';
}

function derivePublishedAtFromTikTokVideoId(videoId) {
  if (typeof videoId !== 'string' || !/^\d+$/.test(videoId)) return null;

  try {
    const idBigInt = BigInt(videoId);
    if (idBigInt <= 0n) return null;
    const seconds = Number(idBigInt >> 32n);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    const asMs = seconds * 1000;
    const nowWithSkew = Date.now() + MAX_FUTURE_SKEW_MS;
    if (asMs < MIN_REASONABLE_PUBLISHED_AT_MS || asMs > nowWithSkew) return null;
    return new Date(asMs);
  } catch {
    return null;
  }
}

function resolvePublishedAt({
  publishedAt,
  metadataPublishedAt,
  videoId,
  tweetUrl,
  canonicalUrl,
  createdAtFallback,
} = {}) {
  const fromPrimary = parsePublishedAt(publishedAt);
  if (fromPrimary) return fromPrimary;

  const fromMetadata = parsePublishedAt(metadataPublishedAt);
  if (fromMetadata) return fromMetadata;

  const candidateVideoId =
    (typeof videoId === 'string' && videoId.trim()) ||
    extractTikTokVideoIdFromUrl(canonicalUrl) ||
    extractTikTokVideoIdFromUrl(tweetUrl);

  const fromVideoId = derivePublishedAtFromTikTokVideoId(candidateVideoId);
  if (fromVideoId) return fromVideoId;

  const fromCreatedAt = parsePublishedAt(createdAtFallback);
  if (fromCreatedAt) return fromCreatedAt;

  return null;
}

module.exports = {
  parsePublishedAt,
  extractTikTokVideoIdFromUrl,
  derivePublishedAtFromTikTokVideoId,
  resolvePublishedAt,
};
