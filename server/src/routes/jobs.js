const express = require('express');
const mongoose = require('mongoose');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Job } = require('../models/job');
const { isTweetUrl, isHttpUrl } = require('../utils/validation');
const { canTransition } = require('../domain/job-transitions');
const { JOB_STATUS_VALUES, JOB_STATUSES, SOURCE_TYPES } = require('../constants/job-status');
const { ERROR_CODES } = require('../lib/error-codes');
const { logger } = require('../lib/logger');

const jobsRouter = express.Router();
const DOWNLOADS_ROOT = path.resolve(process.cwd(), 'downloads');

function sendError(res, status, code, error) {
  return res.status(status).json({
    ok: false,
    code,
    error,
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
  const tweetUrl = typeof req.body?.tweetUrl === 'string' ? req.body.tweetUrl.trim() : '';

  if (!isTweetUrl(tweetUrl)) {
    return sendError(
      res,
      400,
      ERROR_CODES.INVALID_TWEET_URL,
      'Invalid tweetUrl. Expected X or TikTok URL, for example: https://x.com/<user>/status/<id> or https://www.tiktok.com/@<user>/video/<id>'
    );
  }

  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  try {
    const job = await Job.create({
      tweetUrl,
      status: JOB_STATUSES.QUEUED,
    });

    return res.status(201).json({
      ok: true,
      job,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.create.failed', { message, tweetUrl });
    return sendError(res, 500, ERROR_CODES.CREATE_JOB_FAILED, `Failed to create job: ${message}`);
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

jobsRouter.patch('/contact/:slug', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  const slug = normalizeContactSlug(req.params.slug);
  if (!slug) {
    return sendError(res, 400, ERROR_CODES.INVALID_CONTACT_SLUG, 'Invalid contact slug.');
  }

  const displayName = sanitizeDisplayName(req.body?.displayName);
  if (!displayName) {
    return sendError(res, 400, ERROR_CODES.UPDATE_CONTACT_FAILED, 'Display name is required.');
  }

  try {
    const result = await Job.updateMany(
      { accountSlug: slug },
      {
        $set: {
          accountDisplayName: displayName,
        },
      }
    );

    return res.json({
      ok: true,
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
      contactSlug: slug,
      displayName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.contact.update.failed', { message, slug });
    return sendError(res, 500, ERROR_CODES.UPDATE_CONTACT_FAILED, `Failed to update contact: ${message}`);
  }
});

jobsRouter.delete('/contact/:slug', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  const slug = normalizeContactSlug(req.params.slug);
  if (!slug) {
    return sendError(res, 400, ERROR_CODES.INVALID_CONTACT_SLUG, 'Invalid contact slug.');
  }

  try {
    const jobs = await Job.find({ accountSlug: slug }).lean();
    await Promise.all(jobs.map((job) => deleteJobFiles(job)));
    const result = await Job.deleteMany({ accountSlug: slug });

    return res.json({
      ok: true,
      deletedCount: result.deletedCount || 0,
      contactSlug: slug,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.contact.delete.failed', { message, slug });
    return sendError(res, 500, ERROR_CODES.DELETE_CONTACT_FAILED, `Failed to delete contact jobs: ${message}`);
  }
});

jobsRouter.post('/:id/manual-retry', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, 400, ERROR_CODES.INVALID_JOB_ID, 'Invalid job id.');
  }

  const mediaUrl = typeof req.body?.mediaUrl === 'string' ? req.body.mediaUrl.trim() : '';
  if (!isHttpUrl(mediaUrl)) {
    return sendError(res, 400, ERROR_CODES.INVALID_MEDIA_URL, 'Invalid media URL.');
  }

  try {
    const original = await Job.findById(req.params.id).lean();
    if (!original) {
      return sendError(res, 404, ERROR_CODES.JOB_NOT_FOUND, 'Job not found.');
    }

    const retryJob = await Job.create({
      tweetUrl: original.tweetUrl,
      status: JOB_STATUSES.QUEUED,
      extractedUrl: mediaUrl,
      sourceType: inferSourceTypeFromMediaUrl(mediaUrl),
      candidateUrls: [mediaUrl],
      imageUrls: Array.isArray(original.imageUrls) ? original.imageUrls : [],
      metadata: original.metadata && typeof original.metadata === 'object' ? original.metadata : {},
      accountPlatform: typeof original.accountPlatform === 'string' ? original.accountPlatform : 'unknown',
      accountHandle: typeof original.accountHandle === 'string' ? original.accountHandle : '',
      accountDisplayName: typeof original.accountDisplayName === 'string' ? original.accountDisplayName : '',
      accountSlug: typeof original.accountSlug === 'string' ? original.accountSlug : '',
      thumbnailUrl: typeof original.thumbnailUrl === 'string' ? original.thumbnailUrl : '',
      thumbnailPath: typeof original.thumbnailPath === 'string' ? original.thumbnailPath : '',
    });

    return res.status(201).json({
      ok: true,
      job: retryJob,
      fromJobId: original._id.toString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.manual_retry.failed', { message, jobId: req.params.id });
    return sendError(res, 500, ERROR_CODES.MANUAL_RETRY_FAILED, `Failed to create manual retry: ${message}`);
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
    if (!isTweetUrl(tweetUrl)) {
      return sendError(
        res,
        400,
        ERROR_CODES.INVALID_TWEET_URL,
        'Invalid tweetUrl. Expected X or TikTok URL.'
      );
    }
    updates.tweetUrl = tweetUrl;
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

jobsRouter.patch('/:id/status', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, 400, ERROR_CODES.INVALID_JOB_ID, 'Invalid job id.');
  }

  const nextStatus = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : '';
  if (!JOB_STATUS_VALUES.includes(nextStatus)) {
    return sendError(
      res,
      400,
      ERROR_CODES.INVALID_STATUS,
      `Invalid status. Allowed: ${JOB_STATUS_VALUES.join(', ')}`
    );
  }

  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return sendError(res, 404, ERROR_CODES.JOB_NOT_FOUND, 'Job not found.');
    }

    if (!canTransition(job.status, nextStatus)) {
      return sendError(
        res,
        409,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        `Invalid status transition: ${job.status} -> ${nextStatus}`
      );
    }

    job.status = nextStatus;
    if (nextStatus === JOB_STATUSES.RUNNING && !job.startedAt) {
      job.startedAt = new Date();
    }
    if (nextStatus === JOB_STATUSES.COMPLETED) {
      job.completedAt = new Date();
    }
    if (nextStatus === JOB_STATUSES.FAILED) {
      job.failedAt = new Date();
    }

    await job.save();

    return res.json({
      ok: true,
      job: job.toObject(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.status.update.failed', { message, jobId: req.params.id });
    return sendError(res, 500, ERROR_CODES.UPDATE_STATUS_FAILED, `Failed to update status: ${message}`);
  }
});

module.exports = {
  jobsRouter,
};
