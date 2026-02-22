const express = require('express');
const mongoose = require('mongoose');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Job } = require('../../core/models/job');
const { getPostUrlInfo, isTweetUrl, canonicalizePostUrl } = require('../../core/utils/validation');
const { JOB_STATUSES } = require('../../core/constants/job-status');
const { ERROR_CODES } = require('../../core/lib/error-codes');
const { logger } = require('../../core/lib/logger');
const { getPlatformCapabilities } = require('../../core/config/platform-capabilities');
const { PLATFORMS } = require('../../core/platforms/registry');
const { resolveDomainId } = require('../../core/dispatch/resolve-domain-id');
const { resolvePublishedAt } = require('../../core/utils/published-at');
const {
  sendError,
  getRequestTraceId,
  getUrlFacts,
  isValidObjectId,
  deleteJobFiles,
  hasJobOutputFile,
  toSafeAbsoluteDownloadPath,
  normalizeBulkDeleteIds,
  normalizeContactSlug,
  sanitizeDisplayName,
  ensureEnabledPlatform,
} = require('./helpers/route-utils');
const jobsRouter = express.Router();
const ACTIVE_JOB_STATUSES = [JOB_STATUSES.QUEUED, JOB_STATUSES.RUNNING];
const DEDUPE_JOB_STATUSES = [...ACTIVE_JOB_STATUSES, JOB_STATUSES.COMPLETED];
const JOB_LIST_VIEW_COMPACT = 'compact';
const JOB_LIST_VIEW_FULL = 'full';
const JOB_LIST_VIEWS = new Set([JOB_LIST_VIEW_COMPACT, JOB_LIST_VIEW_FULL]);
const JOB_LIST_SELECT_COMPACT = [
  'tweetUrl',
  'canonicalUrl',
  'status',
  'accountHandle',
  'accountDisplayName',
  'accountSlug',
  'accountPlatform',
  'platform',
  'publishedAt',
  'createdAt',
  'downloadPath',
  'thumbnailPath',
  'thumbnailUrl',
  'outputPath',
  'error',
  'errorCode',
  'sourceType',
  'attemptCount',
  'removedFromSourceAt',
  'profileRemovedFromSourceAt',
  'isFavorite',
].join(' ');
const JOB_LIST_SELECT_FULL = [
  JOB_LIST_SELECT_COMPACT,
  'imageUrls',
  'metadata',
].join(' ');

function normalizeListView(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (JOB_LIST_VIEWS.has(normalized)) {
    return normalized;
  }
  return JOB_LIST_VIEW_COMPACT;
}

function parseListQuery(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit || 50), 1), 200);
  const status = typeof query.status === 'string' ? query.status.trim() : '';
  const favoriteRaw = typeof query.favoriteOnly === 'string'
    ? query.favoriteOnly.trim().toLowerCase()
    : typeof query.favorite === 'string'
      ? query.favorite.trim().toLowerCase()
      : '';
  const favoriteOnly = favoriteRaw === '1' || favoriteRaw === 'true' || favoriteRaw === 'yes';
  const view = normalizeListView(query.view);
  const projection = view === JOB_LIST_VIEW_FULL ? JOB_LIST_SELECT_FULL : JOB_LIST_SELECT_COMPACT;
  return {
    limit,
    status,
    favoriteOnly,
    view,
    projection,
  };
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildLegacyContactFilter(slug, status) {
  const safeSlug = escapeRegex(slug);
  const handleRegex = new RegExp(`^@?${safeSlug}$`, 'i');
  const urlRegex = new RegExp(`/@${safeSlug}(?:/|$)`, 'i');
  const filter = {
    $or: [
      { accountSlug: slug },
      { accountHandle: handleRegex },
      { tweetUrl: urlRegex },
      { canonicalUrl: urlRegex },
    ],
  };
  if (status) {
    filter.status = status;
  }
  return filter;
}

async function listJobsByFilter({
  filter = {},
  projection = JOB_LIST_SELECT_COMPACT,
  limit = 50,
} = {}) {
  return Job.find(filter)
    .select(projection)
    .sort({ publishedAt: -1, createdAt: -1 })
    .limit(limit)
    .lean();
}

function buildDuplicateJobError(existingJobStatus) {
  if (existingJobStatus === JOB_STATUSES.COMPLETED) {
    return {
      code: ERROR_CODES.DUPLICATE_COMPLETED_JOB,
      message: 'This URL was already downloaded.',
      event: 'jobs.create.duplicate_completed',
    };
  }

  return {
    code: ERROR_CODES.DUPLICATE_ACTIVE_JOB,
    message: 'This URL is already downloading.',
    event: 'jobs.create.duplicate_active',
  };
}

async function requeueExistingJob(jobId, traceId) {
  if (!jobId) {
    return null;
  }

  return Job.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: JOB_STATUSES.QUEUED,
        traceId: traceId || '',
        progressPct: 0,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        outputPath: '',
        thumbnailPath: '',
        sourceType: 'unknown',
        extractedUrl: '',
        candidateUrls: [],
        error: '',
        errorCode: '',
      },
    },
    {
      returnDocument: 'after',
    }
  ).lean();
}

function spawnDetached(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.once('error', (error) => reject(error));
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function buildVlcLaunchAttempts(absolutePath) {
  const configuredVlcPath = typeof process.env.VLC_PATH === 'string' ? process.env.VLC_PATH.trim() : '';
  const attempts = [];

  if (configuredVlcPath) {
    attempts.push({ command: configuredVlcPath, args: [absolutePath], requiresExistingPath: true });
  }

  if (process.platform === 'win32') {
    attempts.push(
      { command: 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe', args: [absolutePath], requiresExistingPath: true },
      { command: 'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe', args: [absolutePath], requiresExistingPath: true },
      { command: 'vlc', args: [absolutePath], requiresExistingPath: false }
    );
  } else if (process.platform === 'darwin') {
    attempts.push(
      { command: '/Applications/VLC.app/Contents/MacOS/VLC', args: [absolutePath], requiresExistingPath: true },
      { command: 'open', args: ['-a', 'VLC', absolutePath], requiresExistingPath: false },
      { command: 'vlc', args: [absolutePath], requiresExistingPath: false }
    );
  } else {
    attempts.push({ command: 'vlc', args: [absolutePath], requiresExistingPath: false });
  }

  return attempts;
}

function buildOpenFolderAttempts(absolutePath) {
  const folderPath = path.dirname(absolutePath);
  if (process.platform === 'win32') {
    return [
      { command: 'explorer.exe', args: [`/select,${absolutePath}`], fallbackFolder: folderPath },
      { command: 'explorer.exe', args: [folderPath], fallbackFolder: folderPath },
    ];
  }
  if (process.platform === 'darwin') {
    return [
      { command: 'open', args: ['-R', absolutePath], fallbackFolder: folderPath },
      { command: 'open', args: [folderPath], fallbackFolder: folderPath },
    ];
  }
  return [
    { command: 'xdg-open', args: [folderPath], fallbackFolder: folderPath },
  ];
}

async function launchVlc(absolutePath) {
  const attempts = buildVlcLaunchAttempts(absolutePath);
  let lastError = null;

  for (const attempt of attempts) {
    if (attempt.requiresExistingPath && !fs.existsSync(attempt.command)) {
      continue;
    }

    try {
      await spawnDetached(attempt.command, attempt.args);
      return { ok: true, command: attempt.command };
    } catch (error) {
      lastError = error;
      if (error && error.code === 'ENOENT') {
        continue;
      }
    }
  }

  return { ok: false, error: lastError };
}

async function openContainingFolder(absolutePath) {
  const attempts = buildOpenFolderAttempts(absolutePath);
  let lastError = null;

  for (const attempt of attempts) {
    try {
      await spawnDetached(attempt.command, attempt.args);
      return { ok: true, command: attempt.command };
    } catch (error) {
      lastError = error;
      if (error && error.code === 'ENOENT') {
        continue;
      }
    }
  }

  return { ok: false, error: lastError };
}

jobsRouter.get('/', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  const { limit, status, favoriteOnly, view, projection } = parseListQuery(req.query);
  const filter = {};
  if (status) {
    filter.status = status;
  }
  if (favoriteOnly) {
    filter.isFavorite = true;
  }

  try {
    const jobs = await listJobsByFilter({ filter, projection, limit });
    return res.json({
      ok: true,
      view,
      jobs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.list.failed', { message });
    return sendError(res, 500, ERROR_CODES.LIST_JOBS_FAILED, `Failed to list jobs: ${message}`);
  }
});

jobsRouter.get('/contact/:slug', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  const slug = normalizeContactSlug(req.params.slug);
  if (!slug) {
    return sendError(res, 400, ERROR_CODES.INVALID_CONTACT_SLUG, 'Invalid contact slug.');
  }

  const { limit, status, favoriteOnly, view, projection } = parseListQuery(req.query);
  const primaryFilter = { accountSlug: slug };
  if (status) {
    primaryFilter.status = status;
  }
  if (favoriteOnly) {
    primaryFilter.isFavorite = true;
  }

  try {
    let jobs = await listJobsByFilter({ filter: primaryFilter, projection, limit });
    let usedLegacyFallback = false;

    if (jobs.length === 0) {
      const legacyFilter = buildLegacyContactFilter(slug, status);
      jobs = await listJobsByFilter({ filter: legacyFilter, projection, limit });
      usedLegacyFallback = true;
    }

    return res.json({
      ok: true,
      view,
      contactSlug: slug,
      usedLegacyFallback,
      jobs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.list.contact.failed', { message, contactSlug: slug });
    return sendError(res, 500, ERROR_CODES.LIST_JOBS_FAILED, `Failed to list jobs: ${message}`);
  }
});

jobsRouter.post('/open-vlc', async (req, res) => {
  const requestedOutputPath = typeof req.body?.outputPath === 'string' ? req.body.outputPath.trim() : '';
  if (!requestedOutputPath) {
    return sendError(res, 400, ERROR_CODES.INVALID_MEDIA_URL, 'Missing outputPath.');
  }

  const absolutePath = toSafeAbsoluteDownloadPath(requestedOutputPath);
  if (!absolutePath) {
    return sendError(res, 400, ERROR_CODES.INVALID_MEDIA_URL, 'Invalid outputPath.');
  }

  const hasOutputFile = await hasJobOutputFile({ outputPath: requestedOutputPath });
  if (!hasOutputFile) {
    return sendError(res, 404, ERROR_CODES.JOB_NOT_FOUND, 'Downloaded file not found.');
  }

  const launched = await launchVlc(absolutePath);
  if (!launched.ok) {
    const message = launched.error instanceof Error ? launched.error.message : String(launched.error || '');
    logger.error('jobs.open_vlc.failed', {
      outputPath: requestedOutputPath,
      absolutePath,
      platform: process.platform,
      message,
    });
    return sendError(
      res,
      500,
      ERROR_CODES.BROWSER_LAUNCH_FAILED,
      'Failed to launch VLC. Verify VLC is installed and set VLC_PATH if needed.'
    );
  }

  logger.info('jobs.open_vlc.launched', {
    outputPath: requestedOutputPath,
    absolutePath,
    command: launched.command,
  });
  return res.json({
    ok: true,
    launched: true,
  });
});

jobsRouter.post('/open-folder', async (req, res) => {
  const requestedOutputPath = typeof req.body?.outputPath === 'string' ? req.body.outputPath.trim() : '';
  if (!requestedOutputPath) {
    return sendError(res, 400, ERROR_CODES.INVALID_MEDIA_URL, 'Missing outputPath.');
  }

  const absolutePath = toSafeAbsoluteDownloadPath(requestedOutputPath);
  if (!absolutePath) {
    return sendError(res, 400, ERROR_CODES.INVALID_MEDIA_URL, 'Invalid outputPath.');
  }

  const hasOutputFile = await hasJobOutputFile({ outputPath: requestedOutputPath });
  if (!hasOutputFile) {
    return sendError(res, 404, ERROR_CODES.JOB_NOT_FOUND, 'Downloaded file not found.');
  }

  const opened = await openContainingFolder(absolutePath);
  if (!opened.ok) {
    const message = opened.error instanceof Error ? opened.error.message : String(opened.error || '');
    logger.error('jobs.open_folder.failed', {
      outputPath: requestedOutputPath,
      absolutePath,
      platform: process.platform,
      message,
    });
    return sendError(
      res,
      500,
      ERROR_CODES.BROWSER_LAUNCH_FAILED,
      'Failed to open folder. Verify your OS file manager is available.'
    );
  }

  logger.info('jobs.open_folder.launched', {
    outputPath: requestedOutputPath,
    absolutePath,
    command: opened.command,
  });
  return res.json({
    ok: true,
    opened: true,
  });
});

jobsRouter.get('/:id', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, 400, ERROR_CODES.INVALID_JOB_ID, 'Invalid job id.');
  }

  try {
    const job = await Job.findById(req.params.id).lean();
    if (!job) {
      return sendError(res, 404, ERROR_CODES.JOB_NOT_FOUND, 'Job not found.');
    }
    return res.json({
      ok: true,
      job,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.detail.failed', { message, jobId: req.params.id });
    return sendError(res, 500, ERROR_CODES.LOAD_JOB_FAILED, `Failed to load job: ${message}`);
  }
});

jobsRouter.post('/', async (req, res) => {
  const traceId = getRequestTraceId(req);
  const startedAt = Date.now();
  const tweetUrl = typeof req.body?.tweetUrl === 'string' ? req.body.tweetUrl.trim() : '';
  const postInfo = getPostUrlInfo(tweetUrl);
  const urlFacts = getUrlFacts(tweetUrl);

  logger.info('jobs.create.request_received', {
    traceId,
    postUrlLength: tweetUrl.length,
    ...urlFacts,
    platformDetected: postInfo.platform || 'unknown',
    platformValid: postInfo.isValid === true,
  });

  if (!postInfo.isValid || !isTweetUrl(tweetUrl)) {
    logger.info('jobs.create.invalid_url', {
      traceId,
      postUrlLength: tweetUrl.length,
      ...urlFacts,
    });
    return sendError(
      res,
      400,
      ERROR_CODES.INVALID_TWEET_URL,
      `Invalid postUrl. Expected a supported platform URL. Supported: ${PLATFORMS.map((p) => p.label).join(', ')}.`
    );
  }

  const platformError = ensureEnabledPlatform(postInfo, res);
  if (platformError) {
    logger.info('jobs.create.platform_disabled', {
      traceId,
      tweetUrl,
      platform: postInfo.platform,
      capabilities: getPlatformCapabilities(),
    });
    return platformError;
  }

  if (mongoose.connection.readyState !== 1) {
    logger.error('jobs.create.db_not_connected', {
      traceId,
      readyState: mongoose.connection.readyState,
    });
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  const canonicalUrl = canonicalizePostUrl(tweetUrl) || tweetUrl;
  const resolvedPublishedAt = resolvePublishedAt({
    tweetUrl,
    canonicalUrl,
  });
  const duplicateQuery = {
    status: { $in: DEDUPE_JOB_STATUSES },
    $or: [
      { canonicalUrl },
      { tweetUrl },
    ],
  };

  try {
    const existingJob = await Job.findOne(duplicateQuery).sort({ createdAt: -1 }).lean();
    if (existingJob) {
      const existingJobId = existingJob._id ? String(existingJob._id) : '';
      const existingJobStatus = typeof existingJob.status === 'string'
        ? existingJob.status
        : JOB_STATUSES.QUEUED;

      if (existingJobStatus === JOB_STATUSES.COMPLETED) {
        const hasOutput = typeof existingJob.outputPath === 'string' &&
          existingJob.outputPath.trim() &&
          await hasJobOutputFile(existingJob);
        if (!hasOutput) {
          const requeuedJob = await requeueExistingJob(existingJob._id, traceId);
          if (requeuedJob) {
            logger.info('jobs.create.requeued_missing_file', {
              traceId,
              tweetUrl,
              canonicalUrl,
              jobId: existingJobId,
            });

            return res.status(201).json({
              ok: true,
              job: requeuedJob,
              traceId,
              requeued: true,
            });
          }
        }
      }

      const duplicate = buildDuplicateJobError(existingJobStatus);

      logger.info(duplicate.event, {
        traceId,
        tweetUrl,
        canonicalUrl,
        existingJobId,
        existingJobStatus,
      });

      return res.status(409).json({
        ok: false,
        code: duplicate.code,
        error: duplicate.message,
        existingJobId,
        existingJobStatus,
      });
    }

    const domainId = resolveDomainId({
      platformId: postInfo.platform,
      tweetUrl,
    });

    let job;
    try {
      job = await Job.create({
        tweetUrl,
        canonicalUrl,
        domainId,
        traceId,
        status: JOB_STATUSES.QUEUED,
        publishedAt: resolvedPublishedAt,
      });
    } catch (createErr) {
      if (createErr && createErr.code === 11000) {
        const racedJob = await Job.findOne(duplicateQuery).sort({ createdAt: -1 }).lean();
        if (racedJob) {
          const existingJobId = racedJob._id ? String(racedJob._id) : '';
          const existingJobStatus = typeof racedJob.status === 'string'
            ? racedJob.status
            : JOB_STATUSES.QUEUED;

          if (existingJobStatus === JOB_STATUSES.COMPLETED) {
            const hasOutput = typeof racedJob.outputPath === 'string' &&
              racedJob.outputPath.trim() &&
              await hasJobOutputFile(racedJob);
            if (!hasOutput) {
              const requeuedJob = await requeueExistingJob(racedJob._id, traceId);
              if (requeuedJob) {
                logger.info('jobs.create.requeued_missing_file_race', {
                  traceId,
                  tweetUrl,
                  canonicalUrl,
                  jobId: existingJobId,
                });

                return res.status(201).json({
                  ok: true,
                  job: requeuedJob,
                  traceId,
                  requeued: true,
                });
              }
            }
          }

          const duplicate = buildDuplicateJobError(existingJobStatus);

          logger.info('jobs.create.duplicate_race_resolved', {
            traceId,
            tweetUrl,
            canonicalUrl,
            existingJobId,
            existingJobStatus,
          });

          return res.status(409).json({
            ok: false,
            code: duplicate.code,
            error: duplicate.message,
            existingJobId,
            existingJobStatus,
          });
        }
      }

      throw createErr;
    }

    logger.info('jobs.create.queued', {
      traceId,
      jobId: job._id.toString(),
      status: job.status,
      domainId: job.domainId || '',
      platform: postInfo.platform || 'unknown',
      durationMs: Date.now() - startedAt,
      createdAt: job.createdAt,
    });

    return res.status(201).json({
      ok: true,
      job,
      traceId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.create.failed', {
      traceId,
      message,
      tweetUrl,
      durationMs: Date.now() - startedAt,
    });
    return sendError(res, 500, ERROR_CODES.CREATE_JOB_FAILED, `Failed to create job: ${message}`);
  }
});

jobsRouter.patch('/:id', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  if (!isValidObjectId(req.params.id)) {
    return sendError(res, 400, ERROR_CODES.INVALID_JOB_ID, 'Invalid job id.');
  }

  const updates = {};
  if (typeof req.body?.tweetUrl === 'string') {
    const tweetUrl = req.body.tweetUrl.trim();
    const postInfo = getPostUrlInfo(tweetUrl);
    if (!postInfo.isValid || !isTweetUrl(tweetUrl)) {
      return sendError(
        res,
        400,
        ERROR_CODES.INVALID_TWEET_URL,
        `Invalid postUrl. Expected a supported platform URL. Supported: ${PLATFORMS.map((p) => p.label).join(', ')}.`
      );
    }
    const platformError = ensureEnabledPlatform(postInfo, res);
    if (platformError) {
      logger.info('jobs.update.platform_disabled', { tweetUrl, platform: postInfo.platform, jobId: req.params.id });
      return platformError;
    }
    updates.tweetUrl = tweetUrl;
    updates.canonicalUrl = canonicalizePostUrl(tweetUrl) || tweetUrl;
    updates.publishedAt = resolvePublishedAt({
      publishedAt: updates.publishedAt,
      metadataPublishedAt: null,
      tweetUrl,
      canonicalUrl: updates.canonicalUrl,
    });
    updates.domainId = resolveDomainId({
      platformId: postInfo.platform,
      tweetUrl,
    });
  }

  if (typeof req.body?.accountDisplayName === 'string') {
    updates.accountDisplayName = sanitizeDisplayName(req.body.accountDisplayName);
  }
  if (typeof req.body?.isFavorite === 'boolean') {
    updates.isFavorite = req.body.isFavorite;
  }

  if (Object.keys(updates).length === 0) {
    return sendError(res, 400, ERROR_CODES.UPDATE_JOB_FAILED, 'No editable fields were provided.');
  }

  try {
    const job = await Job.findByIdAndUpdate(req.params.id, { $set: updates }, { returnDocument: 'after' });
    if (!job) {
      return sendError(res, 404, ERROR_CODES.JOB_NOT_FOUND, 'Job not found.');
    }

    return res.json({
      ok: true,
      job: job.toObject(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.update.failed', { message, jobId: req.params.id });
    return sendError(res, 500, ERROR_CODES.UPDATE_JOB_FAILED, `Failed to update job: ${message}`);
  }
});

jobsRouter.delete('/:id', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  if (!isValidObjectId(req.params.id)) {
    return sendError(res, 400, ERROR_CODES.INVALID_JOB_ID, 'Invalid job id.');
  }

  try {
    const job = await Job.findById(req.params.id).lean();
    if (!job) {
      return sendError(res, 404, ERROR_CODES.JOB_NOT_FOUND, 'Job not found.');
    }

    await deleteJobFiles(job);
    await Job.deleteOne({ _id: req.params.id });

    return res.json({
      ok: true,
      deletedJobId: req.params.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.delete.failed', { message, jobId: req.params.id });
    return sendError(res, 500, ERROR_CODES.DELETE_JOB_FAILED, `Failed to delete job: ${message}`);
  }
});

jobsRouter.post('/bulk-delete', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  const jobIds = normalizeBulkDeleteIds(req.body?.jobIds);
  if (jobIds.length === 0) {
    return sendError(res, 400, ERROR_CODES.INVALID_BULK_DELETE_IDS, 'Provide one or more valid job IDs.');
  }

  try {
    const jobs = await Job.find({ _id: { $in: jobIds } }).lean();
    await Promise.all(jobs.map((job) => deleteJobFiles(job)));
    const result = await Job.deleteMany({ _id: { $in: jobIds } });

    return res.json({
      ok: true,
      deletedCount: result.deletedCount || 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.bulk_delete.failed', { message, jobIds });
    return sendError(res, 500, ERROR_CODES.BULK_DELETE_FAILED, `Failed to bulk delete jobs: ${message}`);
  }
});

module.exports = {
  jobsRouter,
};
