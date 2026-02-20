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
const {
  sendError,
  getRequestTraceId,
  getUrlFacts,
  isValidObjectId,
  deleteJobFiles,
  normalizeBulkDeleteIds,
  sanitizeDisplayName,
  ensureEnabledPlatform,
} = require('./helpers/route-utils');
const jobsRouter = express.Router();
const ACTIVE_JOB_STATUSES = [JOB_STATUSES.QUEUED, JOB_STATUSES.RUNNING];

jobsRouter.get('/', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const filter = status ? { status } : {};

  try {
    const jobs = await Job.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
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

  try {
    const canonicalUrl = canonicalizePostUrl(tweetUrl) || tweetUrl;
    const existingActive = await Job.findOne({
      status: { $in: ACTIVE_JOB_STATUSES },
      $or: [
        { canonicalUrl },
        { tweetUrl },
      ],
    }).sort({ createdAt: -1 }).lean();

    if (existingActive) {
      const existingJobId = existingActive._id ? String(existingActive._id) : '';
      const existingJobStatus = typeof existingActive.status === 'string'
        ? existingActive.status
        : JOB_STATUSES.QUEUED;

      logger.info('jobs.create.duplicate_active', {
        traceId,
        tweetUrl,
        canonicalUrl,
        existingJobId,
        existingJobStatus,
      });

      return res.status(409).json({
        ok: false,
        code: ERROR_CODES.DUPLICATE_ACTIVE_JOB,
        error: 'This URL is already downloading.',
        existingJobId,
        existingJobStatus,
      });
    }

    const domainId = resolveDomainId({
      platformId: postInfo.platform,
      tweetUrl,
    });

    const job = await Job.create({
      tweetUrl,
      canonicalUrl,
      domainId,
      traceId,
      status: JOB_STATUSES.QUEUED,
    });

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

