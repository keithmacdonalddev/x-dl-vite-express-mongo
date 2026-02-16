const express = require('express');
const mongoose = require('mongoose');
const { Job } = require('../models/job');
const { isTweetUrl } = require('../utils/validation');

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
      status: 'queued',
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

module.exports = {
  jobsRouter,
};
