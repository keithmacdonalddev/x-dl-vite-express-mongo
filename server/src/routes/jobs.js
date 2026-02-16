const express = require('express');
const mongoose = require('mongoose');
const { Job } = require('../models/job');
const { isTweetUrl } = require('../utils/validation');
const { canTransition } = require('../domain/job-transitions');
const { JOB_STATUS_VALUES, JOB_STATUSES } = require('../constants/job-status');
const { ERROR_CODES } = require('../lib/error-codes');
const { logger } = require('../lib/logger');

const jobsRouter = express.Router();

function sendError(res, status, code, error) {
  return res.status(status).json({
    ok: false,
    code,
    error,
  });
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
      'Invalid tweetUrl. Expected format: https://x.com/<user>/status/<id>'
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
