const express = require('express');
const mongoose = require('mongoose');
const { Job } = require('../../core/models/job');
const { canTransition } = require('../../core/domain/job-transitions');
const { JOB_STATUS_VALUES, JOB_STATUSES } = require('../../core/constants/job-status');
const { ERROR_CODES } = require('../../core/lib/error-codes');
const { logger } = require('../../core/lib/logger');
const { resolveDomainId } = require('../../core/dispatch/resolve-domain-id');
const { sendError } = require('./helpers/route-utils');

const statusRouter = express.Router();

statusRouter.patch('/:id/status', async (req, res) => {
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
    if (!job.domainId) {
      job.domainId = resolveDomainId({
        existingDomainId: job.domainId,
        tweetUrl: job.tweetUrl,
      });
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

module.exports = { statusRouter };

