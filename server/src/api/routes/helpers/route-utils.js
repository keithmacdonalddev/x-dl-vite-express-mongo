const mongoose = require('mongoose');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SOURCE_TYPES } = require('../../../core/constants/job-status');
const { getPlatformCapabilities, isPlatformEnabled } = require('../../../core/config/platform-capabilities');
const { PLATFORMS } = require('../../../core/platforms/registry');
const { ERROR_CODES } = require('../../../core/lib/error-codes');

// Build label map from registry so platformLabel() never needs updating
const PLATFORM_LABELS = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label]));

const DOWNLOADS_ROOT = path.resolve(process.cwd(), 'downloads');

function sendError(res, status, code, error) {
  return res.status(status).json({
    ok: false,
    code,
    error,
  });
}

function getRequestTraceId(req) {
  if (req && typeof req.traceId === 'string' && req.traceId.trim()) {
    return req.traceId.trim().slice(0, 120);
  }
  const fromHeader = typeof req.get === 'function' ? req.get('x-trace-id') : '';
  if (typeof fromHeader === 'string' && fromHeader.trim()) {
    return fromHeader.trim().slice(0, 120);
  }
  return randomUUID();
}

function getUrlFacts(value) {
  try {
    const parsed = new URL(value);
    return {
      host: parsed.hostname,
      pathname: parsed.pathname,
      searchLength: parsed.search.length,
    };
  } catch {
    return {
      host: '',
      pathname: '',
      searchLength: 0,
    };
  }
}

function inferSourceTypeFromMediaUrl(mediaUrl) {
  if (typeof mediaUrl !== 'string') {
    return SOURCE_TYPES.UNKNOWN;
  }
  if (/\.m3u8(\?.*)?$/i.test(mediaUrl)) {
    return SOURCE_TYPES.HLS;
  }
  if (/\.mp4(\?.*)?$/i.test(mediaUrl)) {
    return SOURCE_TYPES.DIRECT;
  }
  return SOURCE_TYPES.UNKNOWN;
}

function isValidObjectId(value) {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
}

function toSafeAbsoluteDownloadPath(inputPath) {
  if (typeof inputPath !== 'string' || !inputPath.trim()) {
    return '';
  }

  const trimmed = inputPath.trim().replace(/\\/g, '/');

  let absolutePath = '';
  if (path.isAbsolute(trimmed)) {
    absolutePath = path.resolve(trimmed);
  } else if (trimmed.startsWith('downloads/')) {
    absolutePath = path.resolve(process.cwd(), trimmed);
  } else {
    return '';
  }

  const relativeToDownloads = path.relative(DOWNLOADS_ROOT, absolutePath);
  if (!relativeToDownloads || relativeToDownloads.startsWith('..') || path.isAbsolute(relativeToDownloads)) {
    return '';
  }

  return absolutePath;
}

async function removeEmptyParentDirs(filePath) {
  let currentDir = path.dirname(filePath);

  while (currentDir && currentDir !== DOWNLOADS_ROOT) {
    try {
      const entries = await fs.readdir(currentDir);
      if (entries.length > 0) {
        break;
      }
      await fs.rmdir(currentDir);
      currentDir = path.dirname(currentDir);
    } catch {
      break;
    }
  }
}

async function deleteJobFiles(job) {
  const candidates = [job && job.outputPath, job && job.thumbnailPath];

  for (const candidate of candidates) {
    const absolutePath = toSafeAbsoluteDownloadPath(candidate);
    if (!absolutePath) {
      continue;
    }

    try {
      await fs.rm(absolutePath, { force: true });
      await removeEmptyParentDirs(absolutePath);
    } catch {
      // Ignore file deletion failures; DB delete is authoritative.
    }
  }
}

function normalizeBulkDeleteIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const asStrings = value
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const deduped = Array.from(new Set(asStrings));
  return deduped.filter((entry) => isValidObjectId(entry));
}

function normalizeContactSlug(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

function sanitizeDisplayName(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, 120);
}

function platformLabel(platform) {
  return PLATFORM_LABELS[platform] || 'This platform';
}

function ensureEnabledPlatform(postInfo, res) {
  const capabilities = getPlatformCapabilities();
  if (!postInfo || !postInfo.platform || !isPlatformEnabled(postInfo.platform, capabilities)) {
    return sendError(
      res,
      400,
      ERROR_CODES.PLATFORM_DISABLED,
      `${platformLabel(postInfo && postInfo.platform)} downloads are currently disabled by server configuration.`
    );
  }
  return null;
}

module.exports = {
  DOWNLOADS_ROOT,
  sendError,
  getRequestTraceId,
  getUrlFacts,
  inferSourceTypeFromMediaUrl,
  isValidObjectId,
  toSafeAbsoluteDownloadPath,
  removeEmptyParentDirs,
  deleteJobFiles,
  normalizeBulkDeleteIds,
  normalizeContactSlug,
  sanitizeDisplayName,
  platformLabel,
  ensureEnabledPlatform,
};

