const mongoose = require('mongoose');
const { Job } = require('../models/job');
const { JOB_STATUSES } = require('../constants/job-status');

let pollHandle = null;

async function claimNextQueuedJob() {
  if (mongoose.connection.readyState !== 1) {
    return null;
  }

  const now = new Date();

  const claimed = await Job.findOneAndUpdate(
    { status: JOB_STATUSES.QUEUED },
    {
      $set: {
        status: JOB_STATUSES.RUNNING,
        startedAt: now,
      },
      $inc: { attemptCount: 1 },
    },
    {
      returnDocument: 'after',
      sort: { createdAt: 1 },
    }
  );

  return claimed;
}

function startQueueWorker({
  intervalMs = 1000,
  onTick = async () => {},
} = {}) {
  if (pollHandle) {
    return pollHandle;
  }

  pollHandle = setInterval(async () => {
    try {
      await onTick();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Queue worker tick failed: ${message}`);
    }
  }, intervalMs);

  return pollHandle;
}

function stopQueueWorker() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

module.exports = {
  claimNextQueuedJob,
  startQueueWorker,
  stopQueueWorker,
};
