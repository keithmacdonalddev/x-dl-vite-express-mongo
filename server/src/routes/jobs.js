const express = require('express');
const mongoose = require('mongoose');
const { Job } = require('../models/job');
const { isTweetUrl } = require('../utils/validation');
const { canTransition } = require('../domain/job-transitions');
const { JOB_STATUS_VALUES, JOB_STATUSES } = require('../constants/job-status');

const jobsRouter = express.Router();

jobsRouter.get('/', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      ok: false,
      error: 'Database not connected.',
    });
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
    return res.status(500).json({
      ok: false,
      error: `Failed to list jobs: ${message}`,
    });
  }
});

jobsRouter.get('/:id', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      ok: false,
      error: 'Database not connected.',
    });
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid job id.',
    });
  }

  try {
    const job = await Job.findById(req.params.id).lean();
    if (!job) {
      return res.status(404).json({
        ok: false,
        error: 'Job not found.',
      });
    }
    return res.json({
      ok: true,
      job,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      ok: false,
      error: `Failed to load job: ${message}`,
    });
  }
});

jobsRouter.post('/', async (req, res) => {
  const tweetUrl = typeof req.body?.tweetUrl === 'string' ? req.body.tweetUrl.trim() : '';

  if (!isTweetUrl(tweetUrl)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid tweetUrl. Expected format: https://x.com/<user>/status/<id>',
    });
  }

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      ok: false,
      error: 'Database not connected.',
    });
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
    return res.status(500).json({
      ok: false,
      error: `Failed to create job: ${message}`,
    });
  }
});

jobsRouter.patch('/:id/status', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      ok: false,
      error: 'Database not connected.',
    });
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid job id.',
    });
  }

  const nextStatus = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : '';
  if (!JOB_STATUS_VALUES.includes(nextStatus)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid status. Allowed: ${JOB_STATUS_VALUES.join(', ')}`,
    });
  }

  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({
        ok: false,
        error: 'Job not found.',
      });
    }

    if (!canTransition(job.status, nextStatus)) {
      return res.status(409).json({
        ok: false,
        error: `Invalid status transition: ${job.status} -> ${nextStatus}`,
      });
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
    return res.status(500).json({
      ok: false,
      error: `Failed to update status: ${message}`,
    });
  }
});

module.exports = {
  jobsRouter,
};
