const path = require('node:path');
const { JOB_STATUSES, SOURCE_TYPES } = require('../constants/job-status');
const { extractFromTweet } = require('../services/extractor-service');
const { downloadMedia, downloadDirect } = require('../services/downloader-service');
const { createPlaywrightPageFactory } = require('../services/playwright-adapter');
const {
  deriveAccountProfile,
  inferExtensionFromUrl,
  normalizePathForApi,
  sanitizeAccountSlug,
} = require('../utils/account-profile');
const { isHttpUrl } = require('../utils/validation');
const { claimNextQueuedJob } = require('./queue');

function buildTargetPath(jobId, accountSlug = 'unknown') {
  const safeSlug = sanitizeAccountSlug(accountSlug || 'unknown');
  return path.join('downloads', safeSlug, `${jobId}.mp4`);
}

function buildThumbnailPath(jobId, accountSlug, thumbnailUrl) {
  const safeSlug = sanitizeAccountSlug(accountSlug || 'unknown');
  const extension = inferExtensionFromUrl(thumbnailUrl, '.jpg');
  return path.join('downloads', safeSlug, 'thumbnails', `${jobId}${extension}`);
}

function chooseThumbnailUrl(imageUrls, metadata) {
  if (metadata && isHttpUrl(metadata.thumbnailUrl)) {
    return metadata.thumbnailUrl;
  }

  if (Array.isArray(imageUrls)) {
    const firstImage = imageUrls.find((value) => isHttpUrl(value));
    if (firstImage) {
      return firstImage;
    }
  }

  return '';
}

const productionPageFactory = createPlaywrightPageFactory();

async function productionExtractor(tweetUrl) {
  return extractFromTweet(tweetUrl, {
    pageFactory: productionPageFactory,
  });
}

function inferSourceTypeFromMediaUrl(mediaUrl) {
  if (typeof mediaUrl !== 'string') {
    return SOURCE_TYPES.UNKNOWN;
  }
  if (/\.m3u8(\?.*)?$/i.test(mediaUrl)) {
    return SOURCE_TYPES.HLS;
  }
  if (/\.mp4(\?.*)?$/i.test(mediaUrl)) {
    return SOURCE_TYPES.DIRECT;
  }
  return SOURCE_TYPES.UNKNOWN;
}

async function processOneCycle(extractor = productionExtractor, downloader = downloadMedia) {
  const job = await claimNextQueuedJob();
  if (!job) {
    return null;
  }

  try {
    let mediaUrl = '';
    let sourceType = job.sourceType || SOURCE_TYPES.UNKNOWN;
    let candidateUrls = Array.isArray(job.candidateUrls) ? job.candidateUrls : [];
    let imageUrls = Array.isArray(job.imageUrls) ? job.imageUrls : [];
    let metadata = job.metadata && typeof job.metadata === 'object' ? job.metadata : {};
    let accountPlatform = typeof job.accountPlatform === 'string' ? job.accountPlatform : 'unknown';
    let accountHandle = typeof job.accountHandle === 'string' ? job.accountHandle : '';
    let accountDisplayName = typeof job.accountDisplayName === 'string' ? job.accountDisplayName : '';
    let accountSlug = typeof job.accountSlug === 'string' ? job.accountSlug : '';

    if (isHttpUrl(job.extractedUrl)) {
      mediaUrl = job.extractedUrl;
      if (sourceType === SOURCE_TYPES.UNKNOWN) {
        sourceType = inferSourceTypeFromMediaUrl(mediaUrl);
      }
      if (!candidateUrls.includes(mediaUrl)) {
        candidateUrls = [mediaUrl, ...candidateUrls];
      }
    } else {
      const extracted = await extractor(job.tweetUrl);
      mediaUrl = extracted && typeof extracted.mediaUrl === 'string' ? extracted.mediaUrl : '';
      sourceType = extracted.sourceType || SOURCE_TYPES.UNKNOWN;
      candidateUrls = Array.isArray(extracted.candidateUrls) ? extracted.candidateUrls : [];
      imageUrls = Array.isArray(extracted.imageUrls) ? extracted.imageUrls : [];
      metadata = extracted.metadata && typeof extracted.metadata === 'object' ? extracted.metadata : {};
    }

    const derivedAccount = deriveAccountProfile({
      postUrl: job.tweetUrl,
      metadata,
    });

    if (!accountPlatform || accountPlatform === 'unknown') {
      accountPlatform = derivedAccount.platform || 'unknown';
    }
    accountHandle = accountHandle || derivedAccount.handle;
    accountDisplayName = accountDisplayName || derivedAccount.displayName || accountHandle;
    accountSlug = sanitizeAccountSlug(accountSlug || derivedAccount.accountSlug);

    if (!mediaUrl) {
      throw new Error('Extractor did not return media URL');
    }

    job.extractedUrl = mediaUrl;
    job.sourceType = sourceType;
    job.candidateUrls = candidateUrls;
    job.imageUrls = imageUrls;
    job.metadata = metadata;
    job.accountPlatform = accountPlatform || 'unknown';
    job.accountHandle = accountHandle;
    job.accountDisplayName = accountDisplayName;
    job.accountSlug = accountSlug;
    job.progressPct = 50;
    await job.save();

    const targetPath = buildTargetPath(job._id.toString(), accountSlug);
    const downloaded = await downloader(mediaUrl, { targetPath });
    const outputPath = downloaded && typeof downloaded.outputPath === 'string' ? downloaded.outputPath : '';

    if (!outputPath) {
      throw new Error('Downloader did not return output path');
    }

    let thumbnailPath = '';
    const thumbnailUrl = chooseThumbnailUrl(imageUrls, metadata);
    if (thumbnailUrl) {
      const thumbnailTargetPath = buildThumbnailPath(job._id.toString(), accountSlug, thumbnailUrl);
      try {
        const thumbnailSaved = await downloadDirect(thumbnailUrl, { targetPath: thumbnailTargetPath });
        thumbnailPath = thumbnailSaved && typeof thumbnailSaved.outputPath === 'string' ? thumbnailSaved.outputPath : '';
      } catch (_thumbnailError) {
        thumbnailPath = '';
      }
    }

    job.status = JOB_STATUSES.COMPLETED;
    job.progressPct = 100;
    job.outputPath = normalizePathForApi(outputPath);
    job.thumbnailUrl = thumbnailUrl;
    job.thumbnailPath = normalizePathForApi(thumbnailPath);
    job.completedAt = new Date();
    job.error = '';
    await job.save();

    return job.toObject();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    job.status = JOB_STATUSES.FAILED;
    job.failedAt = new Date();
    job.error = message;
    await job.save();

    return job.toObject();
  }
}

module.exports = {
  processOneCycle,
  buildTargetPath,
  productionExtractor,
};
