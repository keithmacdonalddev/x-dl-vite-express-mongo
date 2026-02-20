const express = require('express');
const mongoose = require('mongoose');
const { Job } = require('../../core/models/job');
const { isHttpUrl } = require('../../core/utils/validation');
const { JOB_STATUSES } = require('../../core/constants/job-status');
const { ERROR_CODES } = require('../../core/lib/error-codes');
const { logger } = require('../../core/lib/logger');
const { resolveDomainId } = require('../../core/dispatch/resolve-domain-id');
const {
  sendError,
  getRequestTraceId,
  inferSourceTypeFromMediaUrl,
} = require('./helpers/route-utils');

const retryRouter = express.Router();

retryRouter.post('/:id/manual-retry', async (req, res) => {
  const traceId = getRequestTraceId(req);
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, 400, ERROR_CODES.INVALID_JOB_ID, 'Invalid job id.');
  }

  const mediaUrl = typeof req.body?.mediaUrl === 'string' ? req.body.mediaUrl.trim() : '';
  if (!isHttpUrl(mediaUrl)) {
    logger.info('jobs.manual_retry.invalid_media_url', {
      traceId,
      jobId: req.params.id,
      mediaUrlLength: mediaUrl.length,
    });
    return sendError(res, 400, ERROR_CODES.INVALID_MEDIA_URL, 'Invalid media URL.');
  }

  try {
    const original = await Job.findById(req.params.id).lean();
    if (!original) {
      return sendError(res, 404, ERROR_CODES.JOB_NOT_FOUND, 'Job not found.');
    }

    const retryJob = await Job.create({
      tweetUrl: original.tweetUrl,
      domainId: resolveDomainId({
        existingDomainId: original.domainId,
        tweetUrl: original.tweetUrl,
      }),
      traceId,
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
      traceId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.manual_retry.failed', { traceId, message, jobId: req.params.id });
    return sendError(res, 500, ERROR_CODES.MANUAL_RETRY_FAILED, `Failed to create manual retry: ${message}`);
  }
});

module.exports = { retryRouter };

