const path = require('node:path');
const { JOB_STATUSES, SOURCE_TYPES } = require('../constants/job-status');
const { extractFromTweet } = require('../services/extractor-service');
const { downloadMedia } = require('../services/downloader-service');
const { claimNextQueuedJob } = require('./queue');

function buildTargetPath(jobId) {
  return path.join('downloads', `${jobId}.mp4`);
}

async function processOneCycle(extractor = extractFromTweet, downloader = downloadMedia) {
  const job = await claimNextQueuedJob();
  if (!job) {
    return null;
  }

  try {
    const extracted = await extractor(job.tweetUrl);
    const mediaUrl = extracted && typeof extracted.mediaUrl === 'string' ? extracted.mediaUrl : '';

    if (!mediaUrl) {
      throw new Error('Extractor did not return media URL');
    }

    job.extractedUrl = mediaUrl;
    job.sourceType = extracted.sourceType || SOURCE_TYPES.UNKNOWN;
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
};
