const express = require('express');
const mongoose = require('mongoose');
const { DiscoveredPost } = require('../../core/data/discovered-post-model');
const { Job } = require('../../core/models/job');
const { JOB_STATUSES } = require('../../core/constants/job-status');
const { ERROR_CODES } = require('../../core/lib/error-codes');
const { logger } = require('../../core/lib/logger');
const { canonicalizePostUrl } = require('../../core/utils/validation');
const { resolveDomainId } = require('../../core/dispatch/resolve-domain-id');
const { triggerProfileDiscovery } = require('../../services/profile-discovery-service');
const {
  sendError,
  getRequestTraceId,
  isValidObjectId,
  normalizeContactSlug,
} = require('./helpers/route-utils');

const discoveryRouter = express.Router();

// GET /:accountSlug — List discovered posts for a contact
discoveryRouter.get('/:accountSlug', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  const slug = normalizeContactSlug(req.params.accountSlug);
  if (!slug) {
    return sendError(res, 400, ERROR_CODES.INVALID_CONTACT_SLUG, 'Invalid contact slug.');
  }

  try {
    const posts = await DiscoveredPost.find({ accountSlug: slug })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      ok: true,
      posts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('discovery.list.failed', { message, accountSlug: slug });
    return sendError(res, 500, ERROR_CODES.DISCOVERY_FAILED, `Failed to list discovered posts: ${message}`);
  }
});

// POST /:id/download — Create a job from a discovered post
discoveryRouter.post('/:id/download', async (req, res) => {
  const traceId = getRequestTraceId(req);

  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  if (!isValidObjectId(req.params.id)) {
    return sendError(res, 400, ERROR_CODES.INVALID_JOB_ID, 'Invalid discovered post id.');
  }

  try {
    const post = await DiscoveredPost.findById(req.params.id).lean();
    if (!post) {
      return sendError(res, 404, ERROR_CODES.DISCOVERY_NOT_FOUND, 'Discovered post not found.');
    }

    // Check if a job already exists for this URL
    if (post.downloadedJobId) {
      const existingJob = await Job.findById(post.downloadedJobId).lean();
      if (existingJob) {
        return res.json({
          ok: true,
          job: existingJob,
          alreadyExists: true,
        });
      }
    }

    const canonicalUrl = post.canonicalUrl || canonicalizePostUrl(post.postUrl) || post.postUrl;
    const domainId = resolveDomainId({
      platformId: post.accountPlatform || 'tiktok',
      tweetUrl: post.postUrl,
    });

    const job = await Job.create({
      tweetUrl: post.postUrl,
      canonicalUrl,
      domainId,
      traceId,
      status: JOB_STATUSES.QUEUED,
      accountPlatform: post.accountPlatform || 'tiktok',
      accountHandle: post.accountHandle || '',
      accountSlug: post.accountSlug || '',
    });

    // Link the discovered post to the new job
    await DiscoveredPost.findByIdAndUpdate(post._id, { downloadedJobId: job._id });

    logger.info('discovery.download.created', {
      traceId,
      discoveredPostId: post._id.toString(),
      jobId: job._id.toString(),
      postUrl: post.postUrl,
    });

    return res.status(201).json({
      ok: true,
      job,
      traceId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('discovery.download.failed', { traceId, message, discoveredPostId: req.params.id });
    return sendError(res, 500, ERROR_CODES.DISCOVERY_FAILED, `Failed to create download job: ${message}`);
  }
});

// POST /:accountSlug/refresh — Manually re-trigger profile discovery
discoveryRouter.post('/:accountSlug/refresh', async (req, res) => {
  const traceId = getRequestTraceId(req);

  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  const slug = normalizeContactSlug(req.params.accountSlug);
  if (!slug) {
    return sendError(res, 400, ERROR_CODES.INVALID_CONTACT_SLUG, 'Invalid contact slug.');
  }

  try {
    // Find any job for this contact to get the handle
    const sampleJob = await Job.findOne({ accountSlug: slug }).lean();
    if (!sampleJob) {
      return sendError(res, 404, ERROR_CODES.DISCOVERY_NOT_FOUND, 'No jobs found for this contact.');
    }

    // Fire-and-forget
    triggerProfileDiscovery({
      tweetUrl: sampleJob.tweetUrl,
      accountSlug: slug,
      traceId,
    }).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('discovery.refresh.failed', { traceId, message, accountSlug: slug });
    });

    return res.json({
      ok: true,
      message: 'Discovery refresh triggered.',
      traceId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('discovery.refresh.failed', { traceId, message, accountSlug: slug });
    return sendError(res, 500, ERROR_CODES.DISCOVERY_FAILED, `Failed to trigger discovery: ${message}`);
  }
});

module.exports = { discoveryRouter };
