const express = require('express');
const mongoose = require('mongoose');
const { Job } = require('../models/job');
const { isTweetUrl } = require('../utils/validation');

const jobsRouter = express.Router();

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
