const express = require('express');
const mongoose = require('mongoose');
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
  normalizeBulkDeleteIds,
  sanitizeDisplayName,
  ensureEnabledPlatform,
} = require('./helpers/route-utils');
const jobsRouter = express.Router();
const ACTIVE_JOB_STATUSES = [JOB_STATUSES.QUEUED, JOB_STATUSES.RUNNING];
const DEDUPE_JOB_STATUSES = [...ACTIVE_JOB_STATUSES, JOB_STATUSES.COMPLETED];

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

function normalizeJobPublishedAt(job) {
  const resolvedPublishedAt = resolvePublishedAt({
    publishedAt: job && job.publishedAt,
    metadataPublishedAt: job && job.metadata && job.metadata.publishedAt,
    tweetUrl: job && job.tweetUrl,
    canonicalUrl: job && job.canonicalUrl,
    createdAtFallback: job && job.createdAt,
  });

  return {
    ...(job || {}),
    publishedAt: resolvedPublishedAt ? resolvedPublishedAt.toISOString() : '',
    isRemovedFromSource: Boolean(job && job.removedFromSourceAt),
    isProfileRemovedFromSource: Boolean(job && job.profileRemovedFromSourceAt),
  };
}

async function requeueExistingJob(jobId) {
  if (!jobId) {
    return null;
  }

  return Job.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: JOB_STATUSES.QUEUED,
        progressPct: 0,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        outputPath: '',
        error: '',
        errorCode: '',
      },
    },
    {
      returnDocument: 'after',
    }
  ).lean();
}

jobsRouter.get('/', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const filter = status ? { status } : {};

  try {
    const jobsRaw = await Job.find(filter)
      .select('tweetUrl canonicalUrl status accountHandle accountDisplayName accountSlug accountPlatform platform publishedAt createdAt downloadPath thumbnailPath outputPath error errorCode sourceType attemptCount imageUrls metadata')
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();
    const jobs = jobsRaw.map((job) => normalizeJobPublishedAt(job));
    return res.json({
      ok: true,
      jobs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.list.failed', { message });
    return sendError(res, 500, ERROR_CODES.LIST_JOBS_FAILED, `Failed to list jobs: ${message}`);
  }
});

jobsRouter.get('/:id', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, 400, ERROR_CODES.INVALID_JOB_ID, 'Invalid job id.');
  }

  try {
    const jobRaw = await Job.findById(req.params.id).lean();
    if (!jobRaw) {
      return sendError(res, 404, ERROR_CODES.JOB_NOT_FOUND, 'Job not found.');
    }
    const job = normalizeJobPublishedAt(jobRaw);
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

      if (
        existingJobStatus === JOB_STATUSES.COMPLETED &&
        typeof existingJob.outputPath === 'string' &&
        existingJob.outputPath.trim()
      ) {
        const hasOutputFile = await hasJobOutputFile(existingJob);
        if (!hasOutputFile) {
          const requeuedJob = await requeueExistingJob(existingJob._id);
          if (requeuedJob) {
            logger.info('jobs.create.requeued_missing_file', {
              traceId,
              tweetUrl,
              canonicalUrl,
              jobId: existingJobId,
            });

            return res.status(201).json({
              ok: true,
              job: normalizeJobPublishedAt(requeuedJob),
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

          if (
            existingJobStatus === JOB_STATUSES.COMPLETED &&
            typeof racedJob.outputPath === 'string' &&
            racedJob.outputPath.trim()
          ) {
            const hasOutputFile = await hasJobOutputFile(racedJob);
            if (!hasOutputFile) {
              const requeuedJob = await requeueExistingJob(racedJob._id);
              if (requeuedJob) {
                logger.info('jobs.create.requeued_missing_file_race', {
                  traceId,
                  tweetUrl,
                  canonicalUrl,
                  jobId: existingJobId,
                });

                return res.status(201).json({
                  ok: true,
                  job: normalizeJobPublishedAt(requeuedJob),
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
      job: normalizeJobPublishedAt(job.toObject()),
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
