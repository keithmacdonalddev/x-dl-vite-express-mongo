const express = require('express');
const mongoose = require('mongoose');
const fs = require('node:fs/promises');
const { DiscoveredPost } = require('../../core/data/discovered-post-model');
const { Job } = require('../../core/models/job');
const { JOB_STATUSES } = require('../../core/constants/job-status');
const { ERROR_CODES } = require('../../core/lib/error-codes');
const { logger } = require('../../core/lib/logger');
const { canonicalizePostUrl } = require('../../core/utils/validation');
const { resolveDomainId } = require('../../core/dispatch/resolve-domain-id');
const { resolvePublishedAt } = require('../../core/utils/published-at');
const { triggerProfileDiscovery, repairThumbnailsViaOembed } = require('../../services/profile-discovery-service');
const {
  sendError,
  getRequestTraceId,
  isValidObjectId,
  normalizeContactSlug,
  hasJobOutputFile,
  toSafeAbsoluteDownloadPath,
  removeEmptyParentDirs,
  deleteJobFiles,
} = require('./helpers/route-utils');

const discoveryRouter = express.Router();
const ACTIVE_DISCOVERY_REFRESH_BY_SLUG = new Map();
const ACTIVE_THUMBNAIL_REPAIR_BY_SLUG = new Map();
const ACTIVE_JOB_STATUSES = [JOB_STATUSES.QUEUED, JOB_STATUSES.RUNNING];

function isActiveJobStatus(status) {
  return ACTIVE_JOB_STATUSES.includes(status);
}

async function requeueExistingJob(jobId, traceId) {
  if (!jobId) {
    return null;
  }

  const $set = {
    status: JOB_STATUSES.QUEUED,
    progressPct: 0,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    outputPath: '',
    thumbnailPath: '',
    error: '',
    errorCode: '',
    sourceType: 'unknown',
    extractedUrl: '',
    candidateUrls: [],
    removedFromSourceAt: null,
    profileRemovedFromSourceAt: null,
  };

  if (traceId) {
    $set.traceId = traceId;
  }

  return Job.findByIdAndUpdate(
    jobId,
    { $set },
    { returnDocument: 'after' }
  ).lean();
}

async function mapPostsWithDownloadState(posts) {
  if (!Array.isArray(posts) || posts.length === 0) {
    return posts || [];
  }

  const linkedJobIds = Array.from(
    new Set(
      posts
        .map((post) => post && post.downloadedJobId)
        .filter((jobId) => Boolean(jobId))
        .map((jobId) => String(jobId))
    )
  );

  if (linkedJobIds.length === 0) {
    return posts.map((post) => ({
      ...post,
      isDownloaded: false,
      downloadOutputPath: '',
      isFavorite: false,
      isRemovedFromSource: Boolean(post && post.removedFromSourceAt),
      isProfileRemovedFromSource: Boolean(post && post.profileRemovedFromSourceAt),
    }));
  }

  const linkedJobs = await Job.find({ _id: { $in: linkedJobIds } })
    .select({ _id: 1, status: 1, outputPath: 1, isFavorite: 1 })
    .lean();
  const linkedJobsById = new Map(linkedJobs.map((job) => [String(job._id), job]));
  const stalePostIds = [];

  const resolvedPosts = await Promise.all(
    posts.map(async (post) => {
      if (!post || !post.downloadedJobId) {
        return {
          ...(post || {}),
          isDownloaded: false,
          downloadOutputPath: '',
          isFavorite: false,
          isRemovedFromSource: Boolean(post && post.removedFromSourceAt),
          isProfileRemovedFromSource: Boolean(post && post.profileRemovedFromSourceAt),
        };
      }

      const job = linkedJobsById.get(String(post.downloadedJobId));
      if (!job) {
        if (post._id) stalePostIds.push(post._id);
        return {
          ...post,
          downloadedJobId: null,
          isDownloaded: false,
          downloadOutputPath: '',
          isFavorite: false,
          isRemovedFromSource: Boolean(post && post.removedFromSourceAt),
          isProfileRemovedFromSource: Boolean(post && post.profileRemovedFromSourceAt),
        };
      }

      if (isActiveJobStatus(job.status)) {
        return {
          ...post,
          isDownloaded: false,
          downloadOutputPath: '',
          isFavorite: Boolean(job.isFavorite),
          isRemovedFromSource: Boolean(post && post.removedFromSourceAt),
          isProfileRemovedFromSource: Boolean(post && post.profileRemovedFromSourceAt),
        };
      }

      if (job.status === JOB_STATUSES.COMPLETED) {
        const hasOutputFile = await hasJobOutputFile(job);
        if (hasOutputFile) {
          return {
            ...post,
            isDownloaded: true,
            downloadOutputPath: typeof job.outputPath === 'string' ? job.outputPath : '',
            isFavorite: Boolean(job.isFavorite),
            isRemovedFromSource: Boolean(post && post.removedFromSourceAt),
            isProfileRemovedFromSource: Boolean(post && post.profileRemovedFromSourceAt),
          };
        }
      }

      if (post._id) stalePostIds.push(post._id);
      return {
        ...post,
        downloadedJobId: null,
        isDownloaded: false,
        downloadOutputPath: '',
        isFavorite: false,
        isRemovedFromSource: Boolean(post && post.removedFromSourceAt),
        isProfileRemovedFromSource: Boolean(post && post.profileRemovedFromSourceAt),
      };
    })
  );

  if (stalePostIds.length > 0) {
    await DiscoveredPost.updateMany(
      { _id: { $in: stalePostIds } },
      { $set: { downloadedJobId: null } }
    );
  }

  return resolvedPosts;
}

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
    isRemovedFromSource: Boolean(post && post.removedFromSourceAt),
    isProfileRemovedFromSource: Boolean(post && post.profileRemovedFromSourceAt),
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

function parseListQuery(query = {}) {
  const parsedLimit = Number(query.limit);
  const parsedOffset = Number(query.offset);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(Math.floor(parsedLimit), 0), 200) : 0;
  const offset = Number.isFinite(parsedOffset) ? Math.max(Math.floor(parsedOffset), 0) : 0;
  return { limit, offset };
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
    const { limit, offset } = parseListQuery(req.query);
    const filter = { accountSlug: slug };
    const query = DiscoveredPost.find(filter);
    if (query && typeof query.sort === 'function') {
      query.sort({ publishedAt: -1, createdAt: -1, _id: -1 });
    }
    if (query && typeof query.skip === 'function') {
      query.skip(offset);
    }
    if (limit > 0 && query && typeof query.limit === 'function') {
      query.limit(limit);
    }

    const postsRaw = await query.lean();
    const normalizedPosts = postsRaw
      .map((post) => normalizeDiscoveredPostPublishedAt(post))
      .sort(compareByPublishedAtDesc);
    const posts = await mapPostsWithDownloadState(normalizedPosts);
    let total = posts.length;
    let hasMore = false;
    let nextOffset = null;
    if (limit > 0) {
      total = await DiscoveredPost.countDocuments(filter);
      hasMore = (offset + posts.length) < total;
      nextOffset = hasMore ? offset + posts.length : null;
    }

    return res.json({
      ok: true,
      posts,
      pagination: {
        limit,
        offset,
        returned: posts.length,
        total,
        hasMore,
        nextOffset,
      },
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
        if (isActiveJobStatus(existingJob.status)) {
          return res.json({
            ok: true,
            job: existingJob,
            alreadyExists: true,
          });
        }

        if (existingJob.status === JOB_STATUSES.COMPLETED) {
          const hasOutputFile = await hasJobOutputFile(existingJob);
          if (hasOutputFile) {
            return res.json({
              ok: true,
              job: existingJob,
              alreadyExists: true,
            });
          }

          const requeued = await requeueExistingJob(existingJob._id);
          if (requeued) {
            await DiscoveredPost.findByIdAndUpdate(post._id, { downloadedJobId: requeued._id }, { new: true });
            logger.info('discovery.download.requeued_missing_file', {
              traceId,
              discoveredPostId: post._id.toString(),
              jobId: requeued._id.toString(),
            });
            return res.status(201).json({
              ok: true,
              job: requeued,
              requeued: true,
              traceId,
            });
          }
        }

        await DiscoveredPost.findByIdAndUpdate(post._id, { downloadedJobId: null }, { new: true });
      } else {
        await DiscoveredPost.findByIdAndUpdate(post._id, { downloadedJobId: null }, { new: true });
      }
    }

    const canonicalUrl = post.canonicalUrl || canonicalizePostUrl(post.postUrl) || post.postUrl;

    // Race-safe duplicate check: look for any active/completed job for this URL
    const duplicateJob = await Job.findOne({
      canonicalUrl,
      status: { $in: [JOB_STATUSES.QUEUED, JOB_STATUSES.RUNNING, JOB_STATUSES.COMPLETED] },
    }).lean();

    if (duplicateJob) {
      if (isActiveJobStatus(duplicateJob.status)) {
        await DiscoveredPost.findByIdAndUpdate(post._id, { downloadedJobId: duplicateJob._id }, { new: true });
        return res.json({
          ok: true,
          job: duplicateJob,
          alreadyExists: true,
        });
      }

      if (duplicateJob.status === JOB_STATUSES.COMPLETED) {
        const hasOutputFile = await hasJobOutputFile(duplicateJob);
        if (hasOutputFile) {
          // Atomically link the discovered post to the existing completed job (idempotent)
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

        const requeued = await requeueExistingJob(duplicateJob._id);
        if (requeued) {
          await DiscoveredPost.findByIdAndUpdate(post._id, { downloadedJobId: requeued._id }, { new: true });
          logger.info('discovery.download.requeued_duplicate_missing_file', {
            traceId,
            discoveredPostId: post._id.toString(),
            jobId: requeued._id.toString(),
            canonicalUrl,
          });
          return res.status(201).json({
            ok: true,
            job: requeued,
            requeued: true,
            traceId,
          });
        }
      }
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

// POST /:id/redownload — Force re-download a single discovered post (overwrite existing file)
discoveryRouter.post('/:id/redownload', async (req, res) => {
  const traceId = getRequestTraceId(req);

  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  if (!isValidObjectId(req.params.id)) {
    return sendError(res, 400, ERROR_CODES.INVALID_JOB_ID, 'Invalid post ID.');
  }

  const post = await DiscoveredPost.findById(req.params.id).lean();
  if (!post) {
    return sendError(res, 404, ERROR_CODES.DISCOVERY_NOT_FOUND, 'Discovered post not found.');
  }

  if (!post.downloadedJobId) {
    return sendError(res, 400, ERROR_CODES.DISCOVERY_FAILED, 'This post has not been downloaded yet.');
  }

  const existingJob = await Job.findById(post.downloadedJobId).lean();
  if (!existingJob) {
    return sendError(res, 400, ERROR_CODES.JOB_NOT_FOUND, 'Linked download job not found.');
  }

  if (isActiveJobStatus(existingJob.status)) {
    return sendError(res, 409, ERROR_CODES.DISCOVERY_FAILED, 'A download is already in progress for this post.');
  }

  // Delete existing output and thumbnail files before requeuing
  await deleteJobFiles(existingJob);

  const requeued = await requeueExistingJob(existingJob._id, traceId);
  if (!requeued) {
    return sendError(res, 500, ERROR_CODES.DISCOVERY_FAILED, 'Failed to requeue job.');
  }

  await DiscoveredPost.findByIdAndUpdate(post._id, { downloadedJobId: requeued._id });

  logger.info('discovery.redownload.success', {
    traceId,
    discoveredPostId: req.params.id,
    jobId: String(requeued._id),
  });

  res.set('x-trace-id', traceId);
  return res.status(201).json({ ok: true, job: requeued, redownloaded: true, traceId });
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

// POST /:accountSlug/repair-thumbnails — Repair missing thumbnails via TikTok oEmbed API
discoveryRouter.post('/:accountSlug/repair-thumbnails', async (req, res) => {
  const traceId = getRequestTraceId(req);

  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  const slug = normalizeContactSlug(req.params.accountSlug);
  if (!slug) {
    return sendError(res, 400, ERROR_CODES.INVALID_CONTACT_SLUG, 'Invalid contact slug.');
  }

  if (ACTIVE_THUMBNAIL_REPAIR_BY_SLUG.has(slug)) {
    logger.info('discovery.repair_thumbnails.already_running', { traceId, accountSlug: slug });
    return res.status(202).json({
      ok: true,
      message: 'Thumbnail repair already in progress for this contact.',
      alreadyRunning: true,
      traceId,
    });
  }

  // Fire-and-forget
  ACTIVE_THUMBNAIL_REPAIR_BY_SLUG.set(slug, Date.now());
  repairThumbnailsViaOembed(slug, { traceId })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('discovery.repair_thumbnails.failed', { traceId, message, accountSlug: slug });
    })
    .finally(() => {
      ACTIVE_THUMBNAIL_REPAIR_BY_SLUG.delete(slug);
    });

  return res.json({
    ok: true,
    message: 'Sync started.',
    traceId,
  });
});

// DELETE /posts/:id — Delete a single discovered post by MongoDB ObjectId
discoveryRouter.delete('/posts/:id', async (req, res) => {
  const traceId = getRequestTraceId(req);

  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  if (!isValidObjectId(req.params.id)) {
    return sendError(res, 400, ERROR_CODES.INVALID_JOB_ID, 'Invalid discovered post id.');
  }

  const post = await DiscoveredPost.findByIdAndDelete(req.params.id).lean();

  if (!post) {
    return sendError(res, 404, ERROR_CODES.DISCOVERY_NOT_FOUND, 'Discovered post not found.');
  }

  // Delete the local thumbnail file if one exists
  if (post.thumbnailPath) {
    const absolutePath = toSafeAbsoluteDownloadPath(post.thumbnailPath);
    if (absolutePath) {
      try {
        await fs.rm(absolutePath, { force: true });
        await removeEmptyParentDirs(absolutePath);
      } catch {
        // Ignore file deletion failures; DB delete is authoritative.
      }
    }
  }

  logger.info('discovery.post.deleted', {
    traceId,
    discoveredPostId: req.params.id,
    accountSlug: post.accountSlug || '',
  });

  return res.json({ ok: true });
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
