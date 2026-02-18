const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');
const { logger } = require('../lib/logger');
const { resolvePlatformByMediaHost } = require('../platforms/registry');

function normalizeTelemetryContext(rawValue) {
  if (!rawValue || typeof rawValue !== 'object') {
    return {};
  }
  return rawValue;
}

function isAuthBlockedStatus(status) {
  return status === 401 || status === 403;
}

function buildDownloadHeaders(mediaUrl) {
  const platform = resolvePlatformByMediaHost(mediaUrl);
  const referer = platform ? platform.referer || '' : '';
  const platformHeaders = platform ? platform.downloadHeaders || {} : {};

  const headers = {
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    'user-agent':
      process.env.DOWNLOAD_USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    ...platformHeaders,
  };

  if (referer) {
    headers.referer = referer;
  }

  return headers;
}

function getSignedUrlExpiryMs(mediaUrl) {
  try {
    const parsed = new URL(mediaUrl);
    const expireRaw = parsed.searchParams.get('expire') || parsed.searchParams.get('x-expires') || parsed.searchParams.get('X-Expires') || '';
    const parsedSeconds = Number.parseInt(expireRaw, 10);
    if (!Number.isFinite(parsedSeconds) || parsedSeconds <= 0) {
      return 0;
    }
    return parsedSeconds * 1000;
  } catch {
    return 0;
  }
}

function isSignedUrlExpired(mediaUrl, nowMs = Date.now()) {
  const expiryMs = getSignedUrlExpiryMs(mediaUrl);
  if (!expiryMs) {
    return false;
  }
  return expiryMs <= nowMs;
}

async function downloadDirectWithPlaywrightSession(
  mediaUrl,
  {
    targetPath,
    getPersistentContextImpl,
    telemetryContext,
  } = {}
) {
  const contextMeta = normalizeTelemetryContext(telemetryContext);
  const startedAt = Date.now();
  if (!targetPath) {
    throw new Error('targetPath is required for authenticated direct download');
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

  const getPersistentContext =
    getPersistentContextImpl ||
    require('./playwright-adapter').getPersistentContext;

  if (typeof getPersistentContext !== 'function') {
    throw new Error('Playwright persistent context is not available');
  }

  const context = await getPersistentContext();
  const headers = buildDownloadHeaders(mediaUrl);
  logger.info('downloader.direct.auth.started', {
    ...contextMeta,
    mediaUrl,
    targetPath,
    hasReferer: Boolean(headers.referer),
  });
  const response = await context.request.get(mediaUrl, { headers });

  if (!response || !response.ok()) {
    logger.error('downloader.direct.auth.failed', {
      ...contextMeta,
      mediaUrl,
      targetPath,
      status: response ? response.status() : -1,
    });
    throw new Error(
      `Authenticated direct download failed with status ${response ? response.status() : 'unknown'}`
    );
  }

  const body = await response.body();
  await fs.promises.writeFile(targetPath, body);
  const bytes = Buffer.isBuffer(body) ? body.byteLength : 0;
  const responseHeaders = typeof response.headers === 'function' ? response.headers() : {};
  const responseContentType = (responseHeaders['content-type'] || '').split(';')[0].trim();
  logger.info('downloader.direct.auth.completed', {
    ...contextMeta,
    mediaUrl,
    targetPath,
    status: response.status(),
    contentType: responseContentType,
    bytes,
    durationMs: Date.now() - startedAt,
  });

  return {
    outputPath: targetPath,
    mode: 'direct',
    bytes,
    contentType: responseContentType,
  };
}

function chooseDownloadMode(mediaUrl) {
  return typeof mediaUrl === 'string' && /\.m3u8(\?.*)?$/i.test(mediaUrl) ? 'hls' : 'direct';
}

async function downloadDirect(
  mediaUrl,
  {
    targetPath,
    fetchImpl = globalThis.fetch,
    authenticatedDownloader = downloadDirectWithPlaywrightSession,
    telemetryContext,
  } = {}
) {
  const contextMeta = normalizeTelemetryContext(telemetryContext);
  const startedAt = Date.now();
  if (!targetPath) {
    throw new Error('targetPath is required for direct download');
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available for direct download');
  }

  if (isSignedUrlExpired(mediaUrl)) {
    logger.error('downloader.direct.expired_url', {
      ...contextMeta,
      mediaUrl,
      targetPath,
      expiryMs: getSignedUrlExpiryMs(mediaUrl),
    });
    throw new Error('Signed media URL has expired. Re-submit the original post URL to refresh media links.');
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const headers = buildDownloadHeaders(mediaUrl);

  logger.info('downloader.direct.started', {
    ...contextMeta,
    mediaUrl,
    targetPath,
    hasReferer: Boolean(headers.referer),
  });
  const response = await fetchImpl(mediaUrl, { headers });
  const responseStatus = response && Number.isFinite(response.status) ? response.status : -1;
  const responseContentType = response && typeof response.headers?.get === 'function'
    ? (response.headers.get('content-type') || '').split(';')[0].trim()
    : '';
  const responseContentLength = response && typeof response.headers?.get === 'function'
    ? Number.parseInt(response.headers.get('content-length') || '0', 10) || 0
    : 0;
  logger.info('downloader.direct.response', {
    ...contextMeta,
    mediaUrl,
    targetPath,
    status: responseStatus,
    contentType: responseContentType,
    contentLength: responseContentLength,
    ok: Boolean(response && response.ok),
    hasBody: Boolean(response && response.body),
  });
  if (!response || !response.ok || !response.body) {
    if (
      response &&
      isAuthBlockedStatus(response.status) &&
      typeof authenticatedDownloader === 'function'
    ) {
      logger.info('downloader.direct.auth_fallback', {
        ...contextMeta,
        mediaUrl,
        targetPath,
        status: response.status,
      });
      try {
        return await authenticatedDownloader(mediaUrl, {
          targetPath,
          telemetryContext: contextMeta,
        });
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        logger.error('downloader.direct.auth_fallback.failed', {
          ...contextMeta,
          mediaUrl,
          targetPath,
          status: response.status,
          fallbackMessage,
        });
        throw new Error(
          `Media host denied access (${response.status}). URL may be expired or blocked by origin protection. ${fallbackMessage}`
        );
      }
    }

    logger.error('downloader.direct.failed', {
      ...contextMeta,
      mediaUrl,
      targetPath,
      status: responseStatus,
      durationMs: Date.now() - startedAt,
    });
    throw new Error(`Direct download failed with status ${response ? response.status : 'unknown'}`);
  }

  const output = fs.createWriteStream(targetPath);
  await pipeline(Readable.fromWeb(response.body), output);
  const fileStat = await fs.promises.stat(targetPath);
  const bytes = Number.isFinite(fileStat.size) ? fileStat.size : 0;
  logger.info('downloader.direct.completed', {
    ...contextMeta,
    mediaUrl,
    targetPath,
    status: responseStatus,
    contentType: responseContentType,
    bytes,
    durationMs: Date.now() - startedAt,
  });

  return {
    outputPath: targetPath,
    mode: 'direct',
    bytes,
    contentType: responseContentType,
  };
}

function downloadHlsWithFfmpeg(
  mediaUrl,
  {
    targetPath,
    spawnImpl = spawn,
    ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg',
    telemetryContext,
  } = {}
) {
  const contextMeta = normalizeTelemetryContext(telemetryContext);
  const startedAt = Date.now();
  if (!targetPath) {
    throw new Error('targetPath is required for hls download');
  }

  return new Promise(async (resolve, reject) => {
    try {
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    } catch (error) {
      reject(error);
      return;
    }

    const child = spawnImpl(ffmpegPath, ['-y', '-i', mediaUrl, '-c', 'copy', targetPath], {
      stdio: 'ignore',
    });
    logger.info('downloader.hls.ffmpeg.started', {
      ...contextMeta,
      mediaUrl,
      targetPath,
      ffmpegPath,
    });

    child.once('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('downloader.hls.ffmpeg.error', {
        ...contextMeta,
        mediaUrl,
        targetPath,
        message,
      });
      if (message.includes('ENOENT')) {
        reject(new Error('ffmpeg not found. Set FFMPEG_PATH or install ffmpeg on PATH.'));
        return;
      }
      reject(error);
    });
    child.once('close', (code) => {
      if (code === 0) {
        fs.promises
          .stat(targetPath)
          .then((fileStat) => {
            const bytes = Number.isFinite(fileStat.size) ? fileStat.size : 0;
            logger.info('downloader.hls.ffmpeg.completed', {
              ...contextMeta,
              mediaUrl,
              targetPath,
              bytes,
              durationMs: Date.now() - startedAt,
            });
            resolve({
              outputPath: targetPath,
              mode: 'hls',
              bytes,
            });
          })
          .catch(() => {
            logger.info('downloader.hls.ffmpeg.completed', {
              ...contextMeta,
              mediaUrl,
              targetPath,
              bytes: -1,
              durationMs: Date.now() - startedAt,
            });
            resolve({
              outputPath: targetPath,
              mode: 'hls',
              bytes: -1,
            });
          });
        return;
      }

      logger.error('downloader.hls.ffmpeg.failed', {
        ...contextMeta,
        mediaUrl,
        targetPath,
        exitCode: code,
        durationMs: Date.now() - startedAt,
      });
      reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

async function downloadMedia(
  mediaUrl,
  {
    targetPath,
    directDownloader = downloadDirect,
    hlsDownloader = downloadHlsWithFfmpeg,
    telemetryContext,
  } = {}
) {
  const contextMeta = normalizeTelemetryContext(telemetryContext);
  const startedAt = Date.now();
  if (typeof mediaUrl !== 'string' || !/^https?:\/\//i.test(mediaUrl)) {
    throw new Error('Invalid media URL');
  }

  const mode = chooseDownloadMode(mediaUrl);
  logger.info('downloader.mode.selected', {
    ...contextMeta,
    mediaUrl,
    targetPath,
    mode,
  });
  const downloader = mode === 'hls' ? hlsDownloader : directDownloader;

  const result = await downloader(mediaUrl, { targetPath, telemetryContext: contextMeta });
  logger.info('downloader.completed', {
    ...contextMeta,
    mediaUrl,
    targetPath,
    mode,
    bytes: result && Number.isFinite(result.bytes) ? result.bytes : -1,
    durationMs: Date.now() - startedAt,
  });
  return {
    ...result,
    mode,
  };
}

module.exports = {
  isAuthBlockedStatus,
  isSignedUrlExpired,
  chooseDownloadMode,
  downloadDirect,
  downloadDirectWithPlaywrightSession,
  downloadHlsWithFfmpeg,
  downloadMedia,
};
