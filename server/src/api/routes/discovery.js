const express = require('express');
const mongoose = require('mongoose');
const { DiscoveredPost } = require('../../core/data/discovered-post-model');
const { Job } = require('../../core/models/job');
const { JOB_STATUSES } = require('../../core/constants/job-status');
const { ERROR_CODES } = require('../../core/lib/error-codes');
const { logger } = require('../../core/lib/logger');
const { canonicalizePostUrl } = require('../../core/utils/validation');
const { resolveDomainId } = require('../../core/dispatch/resolve-domain-id');
const { resolvePublishedAt } = require('../../core/utils/published-at');
const { triggerProfileDiscovery } = require('../../services/profile-discovery-service');
const {
  sendError,
  getRequestTraceId,
  isValidObjectId,
  normalizeContactSlug,
} = require('./helpers/route-utils');

const discoveryRouter = express.Router();
const ACTIVE_DISCOVERY_REFRESH_BY_SLUG = new Map();

function normalizeDiscoveredPostPublishedAt(post) {
  const resolvedPublishedAt = resolvePublishedAt({
    publishedAt: post && post.publishedAt,
    videoId: post && post.videoId,
    tweetUrl: post && post.postUrl,
    canonicalUrl: post && post.canonicalUrl,
    createdAtFallback: post && post.createdAt,
  });

  return {
    ...(post || {}),
    publishedAt: resolvedPublishedAt ? resolvedPublishedAt.toISOString() : '',
  };
}

function getTimeMs(value) {
  if (!value) return 0;
  const d = new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function compareByPublishedAtDesc(left, right) {
  const lp = getTimeMs(left && left.publishedAt);
  const rp = getTimeMs(right && right.publishedAt);
  if (rp !== lp) return rp - lp;
  const lc = getTimeMs(left && left.createdAt);
  const rc = getTimeMs(right && right.createdAt);
  return rc - lc;
}

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
    const postsRaw = await DiscoveredPost.find({ accountSlug: slug }).lean();
    const posts = postsRaw
      .map((post) => normalizeDiscoveredPostPublishedAt(post))
      .sort(compareByPublishedAtDesc);

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

    if (!post.postUrl) {
      return sendError(res, 400, ERROR_CODES.DISCOVERY_FAILED, 'Discovered post has no URL.');
    }

    let domainId = '';
    try {
      domainId = resolveDomainId({
        platformId: post.accountPlatform || 'tiktok',
        tweetUrl: post.postUrl,
      });
    } catch (err) {
      logger.error('discovery.download.resolve_domain_failed', {
        traceId,
        discoveredPostId: post._id.toString(),
        message: err instanceof Error ? err.message : String(err),
      });
    }

    let resolvedPublishedAt = null;
    try {
      resolvedPublishedAt = resolvePublishedAt({
        publishedAt: post.publishedAt,
        videoId: post.videoId,
        tweetUrl: post.postUrl,
        canonicalUrl,
        createdAtFallback: post.createdAt,
      });
    } catch (err) {
      logger.error('discovery.download.resolve_published_at_failed', {
        traceId,
        discoveredPostId: post._id.toString(),
        message: err instanceof Error ? err.message : String(err),
      });
    }

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
        accountDisplayName: post.accountDisplayName || '',
        accountSlug: post.accountSlug || '',
        publishedAt: resolvedPublishedAt,
      });
    } catch (createErr) {
      // E11000: concurrent request won the race and created the job first
      if (createErr.code === 11000) {
        let racedJob = await Job.findOne({
          canonicalUrl,
          status: { $in: [JOB_STATUSES.QUEUED, JOB_STATUSES.RUNNING, JOB_STATUSES.COMPLETED] },
        }).lean();
        if (!racedJob) {
          racedJob = await Job.findOne({ canonicalUrl }).lean();
        }
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

  if (ACTIVE_DISCOVERY_REFRESH_BY_SLUG.has(slug)) {
    logger.info('discovery.refresh.already_running', { traceId, accountSlug: slug });
    return res.status(202).json({
      ok: true,
      message: 'Discovery refresh already in progress for this contact.',
      alreadyRunning: true,
      traceId,
    });
  }

  try {
    // Prefer latest TikTok job with an account handle to avoid short-link discovery failures.
    const sampleJob = await Job.findOne({
      accountSlug: slug,
      accountPlatform: 'tiktok',
    })
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();
    if (!sampleJob) {
      return sendError(res, 404, ERROR_CODES.DISCOVERY_NOT_FOUND, 'No TikTok jobs found for this contact.');
    }

    // Fire-and-forget
    ACTIVE_DISCOVERY_REFRESH_BY_SLUG.set(slug, Date.now());
    triggerProfileDiscovery({
      tweetUrl: sampleJob.tweetUrl,
      accountSlug: slug,
      accountHandle: sampleJob.accountHandle || '',
      accountDisplayName: sampleJob.accountDisplayName || '',
      sourceJobId: sampleJob._id,
      traceId,
    })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('discovery.refresh.failed', { traceId, message, accountSlug: slug });
      })
      .finally(() => {
        ACTIVE_DISCOVERY_REFRESH_BY_SLUG.delete(slug);
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

// Catch-all error handler for unexpected errors not caught by route handlers
// eslint-disable-next-line no-unused-vars
discoveryRouter.use((err, req, res, _next) => {
  const traceId = getRequestTraceId(req);
  const message = err instanceof Error ? err.message : String(err);
  logger.error('discovery.unhandled_error', { traceId, message });
  if (!res.headersSent) {
    return sendError(res, 500, ERROR_CODES.DISCOVERY_FAILED, `Unexpected error: ${message}`);
  }
});

module.exports = { discoveryRouter };
