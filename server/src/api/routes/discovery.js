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

    // Short-circuit: post already has a linked job
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

    // Race-safe duplicate check: look for any active/completed job for this URL
    const duplicateJob = await Job.findOne({
      canonicalUrl,
      status: { $in: [JOB_STATUSES.QUEUED, JOB_STATUSES.RUNNING, JOB_STATUSES.COMPLETED] },
    }).lean();

    if (duplicateJob) {
      // Atomically link the discovered post to the existing job (idempotent)
      await DiscoveredPost.findByIdAndUpdate(post._id, { downloadedJobId: duplicateJob._id }, { new: true });
      logger.info('discovery.download.deduplicated', {
        traceId,
        discoveredPostId: post._id.toString(),
        jobId: duplicateJob._id.toString(),
        canonicalUrl,
      });
      return res.json({
        ok: true,
        job: duplicateJob,
        alreadyExists: true,
      });
    }

    const domainId = resolveDomainId({
      platformId: post.accountPlatform || 'tiktok',
      tweetUrl: post.postUrl,
    });

    let job;
    try {
      job = await Job.create({
        tweetUrl: post.postUrl,
        canonicalUrl,
        domainId,
        traceId,
        status: JOB_STATUSES.QUEUED,
        accountPlatform: post.accountPlatform || 'tiktok',
        accountHandle: post.accountHandle || '',
        accountSlug: post.accountSlug || '',
      });
    } catch (createErr) {
      // E11000: concurrent request won the race and created the job first
      if (createErr.code === 11000) {
        const racedJob = await Job.findOne({
          canonicalUrl,
          status: { $in: [JOB_STATUSES.QUEUED, JOB_STATUSES.RUNNING, JOB_STATUSES.COMPLETED] },
        }).lean();
        if (racedJob) {
          await DiscoveredPost.findByIdAndUpdate(post._id, { downloadedJobId: racedJob._id }, { new: true });
          logger.info('discovery.download.race-resolved', {
            traceId,
            discoveredPostId: post._id.toString(),
            jobId: racedJob._id.toString(),
            canonicalUrl,
          });
          return res.json({
            ok: true,
            job: racedJob,
            alreadyExists: true,
          });
        }
      }
      throw createErr;
    }

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
    // Prefer latest TikTok job with an account handle to avoid short-link discovery failures.
    const sampleJob = await Job.findOne({
      accountSlug: slug,
      accountPlatform: 'tiktok',
    })
      .sort({ createdAt: -1 })
      .lean();
    if (!sampleJob) {
      return sendError(res, 404, ERROR_CODES.DISCOVERY_NOT_FOUND, 'No TikTok jobs found for this contact.');
    }

    // Fire-and-forget
    triggerProfileDiscovery({
      tweetUrl: sampleJob.tweetUrl,
      accountSlug: slug,
      accountHandle: sampleJob.accountHandle || '',
      accountDisplayName: sampleJob.accountDisplayName || '',
      sourceJobId: sampleJob._id,
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
