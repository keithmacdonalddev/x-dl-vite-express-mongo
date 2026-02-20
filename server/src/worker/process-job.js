const path = require('node:path');
const fs = require('node:fs');
const { JOB_STATUSES, SOURCE_TYPES } = require('../core/constants/job-status');
const { extractFromTweet } = require('../services/extractor-service');
const { downloadMedia, downloadDirect, downloadDirectWithPlaywrightSession, downloadDirectWithBrowserNavigation, isSignedUrlExpired } = require('../services/downloader-service');
const { createPlaywrightPageFactory } = require('../services/playwright-adapter');
const {
  deriveAccountProfile,
  inferExtensionFromUrl,
  normalizePathForApi,
  sanitizeAccountSlug,
} = require('../core/utils/account-profile');
const { isHttpUrl } = require('../core/utils/validation');
const { platformNeeds403Refresh } = require('../core/platforms/registry');
const { routeJobByDomain } = require('../core/dispatch/route-job-by-domain');
const { claimNextQueuedJob } = require('./queue');
const { logger } = require('../core/lib/logger');

function buildTargetPath(jobId, accountSlug = 'unknown') {
  const safeSlug = sanitizeAccountSlug(accountSlug || 'unknown');
  return path.join('downloads', safeSlug, `${jobId}.mp4`);
}

function buildThumbnailPath(jobId, accountSlug, thumbnailUrl) {
  const safeSlug = sanitizeAccountSlug(accountSlug || 'unknown');
  const extension = inferExtensionFromUrl(thumbnailUrl, '.jpg');
  return path.join('downloads', safeSlug, 'thumbnails', `${jobId}${extension}`);
}

function chooseThumbnailUrl(imageUrls, metadata) {
  if (metadata && isHttpUrl(metadata.thumbnailUrl)) {
    return metadata.thumbnailUrl;
  }

  if (Array.isArray(imageUrls)) {
    const firstImage = imageUrls.find((value) => isHttpUrl(value));
    if (firstImage) {
      return firstImage;
    }
  }

  return '';
}

function applyFailureIdentity(job) {
  const derived = deriveAccountProfile({ postUrl: job.tweetUrl, metadata: job.metadata || {} });
  if (!job.accountPlatform || job.accountPlatform === 'unknown') {
    job.accountPlatform = derived.platform || 'unknown';
  }
  if (!job.accountHandle) {
    job.accountHandle = derived.handle || '';
  }
  if (!job.accountDisplayName) {
    job.accountDisplayName = derived.displayName || derived.handle || '';
  }
  job.accountSlug = sanitizeAccountSlug(job.accountSlug || derived.accountSlug || derived.handle || derived.platform);
}

const productionPageFactory = createPlaywrightPageFactory();

async function productionExtractor(tweetUrl, options = {}) {
  return extractFromTweet(tweetUrl, {
    pageFactory: productionPageFactory,
    telemetryContext: options.telemetryContext || {},
  });
}

class TimeoutError extends Error {
  constructor(message, timeoutMs) {
    super(message);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

async function withTimeout(task, timeoutMs, timeoutMessage) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return task;
  }

  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new TimeoutError(timeoutMessage || `Operation timed out after ${timeoutMs}ms`, timeoutMs));
    }, timeoutMs);
    timeoutHandle.unref?.();

    Promise.resolve(task)
      .then((value) => {
        clearTimeout(timeoutHandle);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
  });
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

function isAccessDeniedDownloadError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:status 403|denied access \(403\))/i.test(message);
}

function chooseRetryMediaUrl(previousUrl, extractedResult = {}, triedUrls = new Set()) {
  const primary = typeof extractedResult.mediaUrl === 'string' ? extractedResult.mediaUrl : '';
  const candidates = Array.isArray(extractedResult.candidateUrls) ? extractedResult.candidateUrls : [];
  const deduped = Array.from(new Set([primary, ...candidates].filter((value) => isHttpUrl(value))));

  const untried = deduped.filter((value) => value !== previousUrl && !triedUrls.has(value));
  if (untried.length > 0) {
    return untried[0];
  }

  const alternative = deduped.find((value) => value !== previousUrl);
  if (alternative) {
    return alternative;
  }

  return primary;
}

const MIN_VIDEO_BYTES = 10000;

/**
 * Validates that a downloaded file looks like a real video.
 * Returns an Error if validation fails, or null if the file is valid.
 */
function validateDownloadedFile(downloaded, outputPath, mediaUrl, logContext) {
  const bytes = downloaded && Number.isFinite(downloaded.bytes) ? downloaded.bytes : 0;
  const contentType = downloaded && typeof downloaded.contentType === 'string' ? downloaded.contentType : '';

  if (contentType && !/^(video\/|application\/octet-stream|binary\/)/i.test(contentType)) {
    logger.error('worker.job.download.wrong_content_type', {
      ...logContext,
      contentType,
      bytes,
      outputPath,
      mediaUrl,
    });
    return new Error(
      `Download returned ${contentType} instead of video — the media URL likely expired or returned an error page.`
    );
  }

  if (bytes < MIN_VIDEO_BYTES) {
    logger.error('worker.job.download.suspiciously_small', {
      ...logContext,
      bytes,
      contentType,
      outputPath,
      mediaUrl,
    });
    return new Error(
      `Download is only ${bytes === 0 ? '0 KB' : `${bytes} bytes`} — likely not a valid video. The media URL may have expired or returned an error page.`
    );
  }

  return null;
}

async function processOneCycle(extractor = productionExtractor, downloader = downloadMedia) {
  const cycleStartedAt = Date.now();
  const job = await claimNextQueuedJob();
  if (!job) {
    return null;
  }

  const jobId = job._id.toString();
  const traceId = job.traceId || '';
  const startedAt = Date.now();
  logger.info('worker.job.processing_started', {
    jobId,
    traceId,
    tweetUrl: job.tweetUrl,
    attemptCount: job.attemptCount,
  });

  return routeJobByDomain({
    job,
    routes: {},
    fallback: async () => {
  const extractionTimeoutMs = Number.parseInt(process.env.EXTRACTION_TIMEOUT_MS || '180000', 10);
  try {
    const triedUrls = new Set();
    let mediaUrl = '';
    let sourceType = job.sourceType || SOURCE_TYPES.UNKNOWN;
    let candidateUrls = Array.isArray(job.candidateUrls) ? job.candidateUrls : [];
    let imageUrls = Array.isArray(job.imageUrls) ? job.imageUrls : [];
    let metadata = job.metadata && typeof job.metadata === 'object' ? job.metadata : {};
    let accountPlatform = typeof job.accountPlatform === 'string' ? job.accountPlatform : 'unknown';
    let accountHandle = typeof job.accountHandle === 'string' ? job.accountHandle : '';
    let accountDisplayName = typeof job.accountDisplayName === 'string' ? job.accountDisplayName : '';
    let accountSlug = typeof job.accountSlug === 'string' ? job.accountSlug : '';

    if (isHttpUrl(job.extractedUrl) && !isSignedUrlExpired(job.extractedUrl)) {
      logger.info('worker.job.extraction.reused', {
        jobId,
        traceId,
        hasExtractedUrl: true,
        extractedUrl: job.extractedUrl,
      });
      mediaUrl = job.extractedUrl;
      if (sourceType === SOURCE_TYPES.UNKNOWN) {
        sourceType = inferSourceTypeFromMediaUrl(mediaUrl);
      }
      if (!candidateUrls.includes(mediaUrl)) {
        candidateUrls = [mediaUrl, ...candidateUrls];
      }
    } else {
      const extractionStartedAt = Date.now();
      logger.info('worker.job.extraction.started', {
        jobId,
        traceId,
        tweetUrl: job.tweetUrl,
        extractionTimeoutMs: Number.isFinite(extractionTimeoutMs) ? extractionTimeoutMs : 0,
      });
      const extracted = await withTimeout(
        extractor(job.tweetUrl, {
          telemetryContext: { jobId, traceId },
        }),
        extractionTimeoutMs,
        `Extraction timed out after ${extractionTimeoutMs}ms`
      );
      logger.info('worker.job.extraction.completed', {
        jobId,
        traceId,
        durationMs: Date.now() - extractionStartedAt,
        sourceType: extracted && extracted.sourceType ? extracted.sourceType : SOURCE_TYPES.UNKNOWN,
        candidateCount: Array.isArray(extracted && extracted.candidateUrls) ? extracted.candidateUrls.length : 0,
        imageCount: Array.isArray(extracted && extracted.imageUrls) ? extracted.imageUrls.length : 0,
        hasMetadata: Boolean(extracted && extracted.metadata && typeof extracted.metadata === 'object'),
      });
      mediaUrl = extracted && typeof extracted.mediaUrl === 'string' ? extracted.mediaUrl : '';
      sourceType = extracted.sourceType || SOURCE_TYPES.UNKNOWN;
      candidateUrls = Array.isArray(extracted.candidateUrls) ? extracted.candidateUrls : [];
      imageUrls = Array.isArray(extracted.imageUrls) ? extracted.imageUrls : [];
      metadata = extracted.metadata && typeof extracted.metadata === 'object' ? extracted.metadata : {};
    }

    const derivedAccount = deriveAccountProfile({
      postUrl: job.tweetUrl,
      metadata,
    });

    if (!accountPlatform || accountPlatform === 'unknown') {
      accountPlatform = derivedAccount.platform || 'unknown';
    }
    accountHandle = accountHandle || derivedAccount.handle;
    accountDisplayName = accountDisplayName || derivedAccount.displayName || accountHandle;
    accountSlug = sanitizeAccountSlug(accountSlug || derivedAccount.accountSlug);

    if (!mediaUrl) {
      logger.error('worker.job.extraction.empty_media_url', {
        jobId,
        traceId,
      });
      throw new Error('Extractor did not return media URL');
    }

    job.extractedUrl = mediaUrl;
    job.sourceType = sourceType;
    job.candidateUrls = candidateUrls;
    job.imageUrls = imageUrls;
    job.metadata = metadata;
    job.accountPlatform = accountPlatform || 'unknown';
    job.accountHandle = accountHandle;
    job.accountDisplayName = accountDisplayName;
    job.accountSlug = accountSlug;
    job.progressPct = 50;
    await job.save();
    logger.info('worker.job.progress.saved', {
      jobId,
      traceId,
      progressPct: job.progressPct,
      sourceType: job.sourceType,
      candidateCount: Array.isArray(job.candidateUrls) ? job.candidateUrls.length : 0,
      imageCount: Array.isArray(job.imageUrls) ? job.imageUrls.length : 0,
      accountSlug: job.accountSlug,
    });

    const targetPath = buildTargetPath(job._id.toString(), accountSlug);
    let downloadUrl = mediaUrl;
    triedUrls.add(downloadUrl);
    const downloadStartedAt = Date.now();
    logger.info('worker.job.download.started', {
      jobId,
      traceId,
      mediaUrl: downloadUrl,
      targetPath,
    });
    let downloaded;
    try {
      downloaded = await downloader(downloadUrl, {
        targetPath,
        telemetryContext: { jobId, traceId },
      });
    } catch (downloadError) {
      const shouldRetryWithRefresh =
        platformNeeds403Refresh(job.tweetUrl) &&
        isAccessDeniedDownloadError(downloadError) &&
        typeof extractor === 'function';

      if (!shouldRetryWithRefresh) {
        throw downloadError;
      }

      const refreshStartedAt = Date.now();
      logger.info('worker.job.download.access_denied.retrying_with_refreshed_extraction', {
        jobId,
        traceId,
        mediaUrl: downloadUrl,
      });

      const refreshed = await withTimeout(
        extractor(job.tweetUrl, {
          telemetryContext: { jobId, traceId, stage: 'download-retry-refresh' },
        }),
        extractionTimeoutMs,
        `Retry extraction timed out after ${extractionTimeoutMs}ms`
      );

      const refreshedMediaUrl = chooseRetryMediaUrl(downloadUrl, refreshed, triedUrls);
      if (!refreshedMediaUrl) {
        throw downloadError;
      }

      sourceType = refreshed.sourceType || sourceType || SOURCE_TYPES.UNKNOWN;
      candidateUrls = Array.isArray(refreshed.candidateUrls) ? refreshed.candidateUrls : candidateUrls;
      imageUrls = Array.isArray(refreshed.imageUrls) ? refreshed.imageUrls : imageUrls;
      metadata = refreshed.metadata && typeof refreshed.metadata === 'object' ? refreshed.metadata : metadata;
      job.sourceType = sourceType;
      job.candidateUrls = candidateUrls;
      job.imageUrls = imageUrls;
      job.metadata = metadata;
      job.extractedUrl = refreshedMediaUrl;
      await job.save();

      logger.info('worker.job.download.refreshed_extraction.completed', {
        jobId,
        traceId,
        durationMs: Date.now() - refreshStartedAt,
        refreshedMediaUrl,
        changedMediaUrl: refreshedMediaUrl !== downloadUrl,
        candidateCount: Array.isArray(candidateUrls) ? candidateUrls.length : 0,
      });

      downloadUrl = refreshedMediaUrl;
      triedUrls.add(downloadUrl);
      downloaded = await downloader(downloadUrl, {
        targetPath,
        telemetryContext: { jobId, traceId, stage: 'download-retry' },
      });
    }
    let outputPath = downloaded && typeof downloaded.outputPath === 'string' ? downloaded.outputPath : '';
    logger.info('worker.job.download.completed', {
      jobId,
      traceId,
      durationMs: Date.now() - downloadStartedAt,
      mode: downloaded && downloaded.mode ? downloaded.mode : 'unknown',
      mediaUrl: downloadUrl,
      outputPath,
      bytes: downloaded && Number.isFinite(downloaded.bytes) ? downloaded.bytes : -1,
    });

    if (!outputPath) {
      logger.error('worker.job.download.empty_output', {
        jobId,
        traceId,
      });
      throw new Error('Downloader did not return output path');
    }

    const validationError = validateDownloadedFile(downloaded, outputPath, downloadUrl, { jobId, traceId });

    if (validationError) {
      logger.error('worker.job.download.validation_failed', {
        jobId,
        traceId,
        reason: validationError.message,
        mediaUrl: downloadUrl,
      });

      // Clean up the bad file before retrying
      try {
        if (outputPath && fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      } catch (_cleanupErr) {
        logger.error('worker.job.download.cleanup_failed', {
          jobId,
          traceId,
          outputPath,
          message: _cleanupErr instanceof Error ? _cleanupErr.message : String(_cleanupErr),
        });
      }

      // Strategy 1: Try authenticated download (Playwright session with cookies).
      // TikTok CDN returns 200 with empty body when cookies are missing.
      let authRetrySucceeded = false;
      try {
        logger.info('worker.job.download.validation_retry.auth_attempt', {
          jobId,
          traceId,
          mediaUrl: downloadUrl,
        });
        downloaded = await downloadDirectWithPlaywrightSession(downloadUrl, {
          targetPath,
          telemetryContext: { jobId, traceId, stage: 'validation-retry-auth' },
        });
        const authOutputPath = downloaded && typeof downloaded.outputPath === 'string' ? downloaded.outputPath : '';
        const authValidationError = validateDownloadedFile(downloaded, authOutputPath, downloadUrl, { jobId, traceId });
        if (!authValidationError) {
          outputPath = authOutputPath;
          authRetrySucceeded = true;
          logger.info('worker.job.download.validation_retry.auth_succeeded', {
            jobId,
            traceId,
            mediaUrl: downloadUrl,
            bytes: downloaded && Number.isFinite(downloaded.bytes) ? downloaded.bytes : -1,
          });
        } else {
          logger.error('worker.job.download.validation_retry.auth_still_invalid', {
            jobId,
            traceId,
            reason: authValidationError.message,
          });
          // Clean up before next strategy
          try {
            if (authOutputPath && fs.existsSync(authOutputPath)) {
              fs.unlinkSync(authOutputPath);
            }
          } catch { /* ignore */ }
        }
      } catch (authErr) {
        const authMessage = authErr instanceof Error ? authErr.message : String(authErr);
        logger.error('worker.job.download.validation_retry.auth_failed', {
          jobId,
          traceId,
          message: authMessage,
        });
      }

      // Strategy 2: Try browser-native download (page.goto + download event).
      // Uses Chromium's real TLS fingerprint and full cookie jar.
      if (!authRetrySucceeded) {
        try {
          logger.info('worker.job.download.validation_retry.browser_nav_attempt', {
            jobId,
            traceId,
            mediaUrl: downloadUrl,
          });
          // Clean up before retry
          try {
            if (targetPath && fs.existsSync(targetPath)) {
              fs.unlinkSync(targetPath);
            }
          } catch { /* ignore */ }

          downloaded = await downloadDirectWithBrowserNavigation(downloadUrl, {
            targetPath,
            telemetryContext: { jobId, traceId, stage: 'validation-retry-browser-nav' },
          });
          const browserNavOutputPath = downloaded && typeof downloaded.outputPath === 'string' ? downloaded.outputPath : '';
          const browserNavValidationError = validateDownloadedFile(downloaded, browserNavOutputPath, downloadUrl, { jobId, traceId });
          if (!browserNavValidationError) {
            outputPath = browserNavOutputPath;
            authRetrySucceeded = true;  // reuse this flag to skip further strategies
            logger.info('worker.job.download.validation_retry.browser_nav_succeeded', {
              jobId,
              traceId,
              mediaUrl: downloadUrl,
              bytes: downloaded && Number.isFinite(downloaded.bytes) ? downloaded.bytes : -1,
            });
          } else {
            logger.error('worker.job.download.validation_retry.browser_nav_still_invalid', {
              jobId,
              traceId,
              reason: browserNavValidationError.message,
            });
            try {
              if (browserNavOutputPath && fs.existsSync(browserNavOutputPath)) {
                fs.unlinkSync(browserNavOutputPath);
              }
            } catch { /* ignore */ }
          }
        } catch (browserNavErr) {
          const browserNavMessage = browserNavErr instanceof Error ? browserNavErr.message : String(browserNavErr);
          logger.error('worker.job.download.validation_retry.browser_nav_failed', {
            jobId,
            traceId,
            message: browserNavMessage,
          });
        }
      }

      // Strategy 3: Re-extract fresh URL + download (if auth and browser nav didn't work)
      if (!authRetrySucceeded && typeof extractor === 'function') {
        logger.info('worker.job.download.validation_retry.re_extracting', {
          jobId,
          traceId,
          mediaUrl: downloadUrl,
        });

        const reExtractStartedAt = Date.now();
        const reExtracted = await withTimeout(
          extractor(job.tweetUrl, {
            telemetryContext: { jobId, traceId, stage: 'validation-retry-refresh' },
          }),
          extractionTimeoutMs,
          `Validation-retry extraction timed out after ${extractionTimeoutMs}ms`
        );

        const freshMediaUrl = chooseRetryMediaUrl(downloadUrl, reExtracted, triedUrls);
        if (!freshMediaUrl) {
          throw validationError;
        }

        sourceType = reExtracted.sourceType || sourceType || SOURCE_TYPES.UNKNOWN;
        candidateUrls = Array.isArray(reExtracted.candidateUrls) ? reExtracted.candidateUrls : candidateUrls;
        imageUrls = Array.isArray(reExtracted.imageUrls) ? reExtracted.imageUrls : imageUrls;
        metadata = reExtracted.metadata && typeof reExtracted.metadata === 'object' ? reExtracted.metadata : metadata;
        job.sourceType = sourceType;
        job.candidateUrls = candidateUrls;
        job.imageUrls = imageUrls;
        job.metadata = metadata;
        job.extractedUrl = freshMediaUrl;
        await job.save();

        logger.info('worker.job.download.validation_retry.re_extracted', {
          jobId,
          traceId,
          durationMs: Date.now() - reExtractStartedAt,
          freshMediaUrl,
          changedMediaUrl: freshMediaUrl !== downloadUrl,
          candidateCount: Array.isArray(candidateUrls) ? candidateUrls.length : 0,
        });

        // Try fresh URL with authenticated download first, then fall back to plain fetch
        downloadUrl = freshMediaUrl;
        triedUrls.add(downloadUrl);
        let freshDownloadValid = false;

        try {
          downloaded = await downloadDirectWithPlaywrightSession(freshMediaUrl, {
            targetPath,
            telemetryContext: { jobId, traceId, stage: 'validation-retry-fresh-auth' },
          });
          const freshAuthOutputPath = downloaded && typeof downloaded.outputPath === 'string' ? downloaded.outputPath : '';
          const freshAuthError = validateDownloadedFile(downloaded, freshAuthOutputPath, freshMediaUrl, { jobId, traceId });
          if (!freshAuthError) {
            outputPath = freshAuthOutputPath;
            freshDownloadValid = true;
            logger.info('worker.job.download.validation_retry.fresh_auth_succeeded', {
              jobId,
              traceId,
              freshMediaUrl,
              bytes: downloaded && Number.isFinite(downloaded.bytes) ? downloaded.bytes : -1,
            });
          } else {
            try {
              if (freshAuthOutputPath && fs.existsSync(freshAuthOutputPath)) {
                fs.unlinkSync(freshAuthOutputPath);
              }
            } catch { /* ignore */ }
          }
        } catch {
          // Auth download of fresh URL failed, try plain fetch below
        }

        if (!freshDownloadValid) {
          downloaded = await downloader(downloadUrl, {
            targetPath,
            telemetryContext: { jobId, traceId, stage: 'validation-retry' },
          });

          const retryOutputPath = downloaded && typeof downloaded.outputPath === 'string' ? downloaded.outputPath : '';
          const retryValidationError = validateDownloadedFile(downloaded, retryOutputPath, downloadUrl, { jobId, traceId });
          if (retryValidationError) {
            throw retryValidationError;
          }
          outputPath = retryOutputPath;
        }

        logger.info('worker.job.download.validation_retry.succeeded', {
          jobId,
          traceId,
          mediaUrl: downloadUrl,
          bytes: downloaded && Number.isFinite(downloaded.bytes) ? downloaded.bytes : -1,
        });
      } else if (!authRetrySucceeded) {
        throw validationError;
      }
    }

    let thumbnailPath = '';
    const thumbnailUrl = chooseThumbnailUrl(imageUrls, metadata);
    if (thumbnailUrl) {
      const thumbnailTargetPath = buildThumbnailPath(job._id.toString(), accountSlug, thumbnailUrl);
      try {
        const thumbnailStartedAt = Date.now();
        logger.info('worker.job.thumbnail.started', {
          jobId,
          traceId,
          thumbnailUrl,
          targetPath: thumbnailTargetPath,
        });
        const thumbnailSaved = await downloadDirect(thumbnailUrl, {
          targetPath: thumbnailTargetPath,
          telemetryContext: { jobId, traceId, stage: 'thumbnail' },
        });
        thumbnailPath = thumbnailSaved && typeof thumbnailSaved.outputPath === 'string' ? thumbnailSaved.outputPath : '';
        logger.info('worker.job.thumbnail.completed', {
          jobId,
          traceId,
          durationMs: Date.now() - thumbnailStartedAt,
          outputPath: thumbnailPath,
          bytes: thumbnailSaved && Number.isFinite(thumbnailSaved.bytes) ? thumbnailSaved.bytes : -1,
        });
      } catch (_thumbnailError) {
        const thumbMessage = _thumbnailError instanceof Error ? _thumbnailError.message : String(_thumbnailError);
        logger.error('worker.job.thumbnail.failed', {
          jobId,
          traceId,
          message: thumbMessage,
        });
        thumbnailPath = '';
      }
    }

    job.status = JOB_STATUSES.COMPLETED;
    job.progressPct = 100;
    job.outputPath = normalizePathForApi(outputPath);
    job.thumbnailUrl = thumbnailUrl;
    job.thumbnailPath = normalizePathForApi(thumbnailPath);
    job.completedAt = new Date();
    job.errorCode = '';
    job.error = '';
    await job.save();
    logger.info('worker.job.completed', {
      jobId,
      traceId,
      totalDurationMs: Date.now() - startedAt,
      cycleDurationMs: Date.now() - cycleStartedAt,
      outputPath: job.outputPath,
      thumbnailPath: job.thumbnailPath,
      candidateCount: Array.isArray(job.candidateUrls) ? job.candidateUrls.length : 0,
      imageCount: Array.isArray(job.imageUrls) ? job.imageUrls.length : 0,
      metadataKeys: Object.keys(job.metadata || {}),
      accountPlatform: job.accountPlatform,
      accountHandle: job.accountHandle,
      accountDisplayName: job.accountDisplayName,
      accountSlug: job.accountSlug,
    });

    // Fire-and-forget: trigger profile discovery after successful TikTok extraction
    // Discovery runs AFTER extraction so the browser session has fresh CAPTCHA-cleared cookies
    if (job.accountPlatform === 'tiktok' && job.tweetUrl) {
      const { triggerProfileDiscovery } = require('../services/profile-discovery-service');
      triggerProfileDiscovery({
        tweetUrl: job.tweetUrl,
        accountSlug: job.accountSlug || '',
        traceId: job.traceId || '',
      }).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('discovery.trigger.failed', { traceId: job.traceId, message: msg });
      });
    }

    return job.toObject();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    applyFailureIdentity(job);
    job.errorCode = typeof error?.code === 'string' ? error.code : 'EXTRACT_UNKNOWN';
    job.status = JOB_STATUSES.FAILED;
    job.failedAt = new Date();
    job.error = message;
    await job.save();
    const isTimeout = error instanceof TimeoutError;
    logger.error('worker.job.failed', {
      jobId,
      traceId,
      totalDurationMs: Date.now() - startedAt,
      cycleDurationMs: Date.now() - cycleStartedAt,
      message,
      isTimeout,
      timeoutMs: isTimeout ? error.timeoutMs : undefined,
      errorName: error instanceof Error ? error.name : undefined,
      errorCode: job.errorCode || '',
      pageTitle: error?.details?.title || '',
      canonicalUrl: error?.details?.canonicalUrl || '',
      finalUrl: error?.details?.finalUrl || '',
      mediaUrlCount: error?.details?.mediaUrlCount ?? 0,
      imageUrlCount: error?.details?.imageUrlCount ?? 0,
      progressPct: job.progressPct,
      sourceType: job.sourceType,
      candidateCount: Array.isArray(job.candidateUrls) ? job.candidateUrls.length : 0,
      imageCount: Array.isArray(job.imageUrls) ? job.imageUrls.length : 0,
    });

    return job.toObject();
  }
    },
  });
}

module.exports = {
  processOneCycle,
  buildTargetPath,
  productionExtractor,
  applyFailureIdentity,
};
