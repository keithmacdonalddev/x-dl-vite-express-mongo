const path = require('node:path');
const { JOB_STATUSES, SOURCE_TYPES } = require('../constants/job-status');
const { extractFromTweet } = require('../services/extractor-service');
const { downloadMedia } = require('../services/downloader-service');
const { createPlaywrightPageFactory } = require('../services/playwright-adapter');
const { isHttpUrl } = require('../utils/validation');
const { claimNextQueuedJob } = require('./queue');

function buildTargetPath(jobId) {
  return path.join('downloads', `${jobId}.mp4`);
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

    if (!mediaUrl) {
      throw new Error('Extractor did not return media URL');
    }

    job.extractedUrl = mediaUrl;
    job.sourceType = sourceType;
    job.candidateUrls = candidateUrls;
    job.imageUrls = imageUrls;
    job.metadata = metadata;
    job.progressPct = 50;
    await job.save();

    const targetPath = buildTargetPath(job._id.toString());
    const downloaded = await downloader(mediaUrl, { targetPath });
    const outputPath = downloaded && typeof downloaded.outputPath === 'string' ? downloaded.outputPath : '';

    if (!outputPath) {
      throw new Error('Downloader did not return output path');
    }

    job.status = JOB_STATUSES.COMPLETED;
    job.progressPct = 100;
    job.outputPath = outputPath;
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
