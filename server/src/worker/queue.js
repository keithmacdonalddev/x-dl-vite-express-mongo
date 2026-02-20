const mongoose = require('mongoose');
const { Job } = require('../core/models/job');
const { WorkerHeartbeat } = require('../core/models/worker-heartbeat');
const { JOB_STATUSES } = require('../core/constants/job-status');
const { logger } = require('../core/lib/logger');

let pollHandle = null;
let isTickRunning = false;

// Heartbeat: upsert once every 30s to keep MongoDB write rate at ~2,880/day.
let lastHeartbeatWrite = 0;
const HEARTBEAT_INTERVAL_MS = 30000;

async function claimNextQueuedJob() {
  if (mongoose.connection.readyState !== 1) {
    logger.info('worker.claim.skipped.db_not_connected', {
      readyState: mongoose.connection.readyState,
    });
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

  if (claimed) {
    const createdAtMs = claimed.createdAt ? new Date(claimed.createdAt).getTime() : 0;
    logger.info('worker.job.claimed', {
      jobId: claimed._id.toString(),
      traceId: claimed.traceId || '',
      status: claimed.status,
      attemptCount: claimed.attemptCount,
      queueWaitMs: createdAtMs > 0 ? Math.max(now.getTime() - createdAtMs, 0) : -1,
      tweetUrl: claimed.tweetUrl,
    });
  }

  return claimed;
}

function startQueueWorker({
  intervalMs = 1000,
  onTick = async () => {},
} = {}) {
  if (pollHandle) {
    return pollHandle;
  }

  let skippedTicks = 0;

  logger.info('worker.started', {
    intervalMs,
    pid: process.pid,
  });

  pollHandle = setInterval(async () => {
    if (isTickRunning) {
      skippedTicks++;
      if (skippedTicks % 10 === 0) {
        logger.info('worker.tick.skipped', {
          skippedTicks,
          message: 'Previous tick still running — job may be stuck or slow.',
        });
      }
      return;
    }

    skippedTicks = 0;
    isTickRunning = true;
    try {
      await onTick();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error('worker.tick.failed', { message, stack });
    } finally {
      isTickRunning = false;
    }

    // Write heartbeat every 30s (fire-and-forget, non-blocking).
    const now = Date.now();
    if (now - lastHeartbeatWrite >= HEARTBEAT_INTERVAL_MS) {
      lastHeartbeatWrite = now;
      WorkerHeartbeat.findOneAndUpdate(
        { workerId: 'default' },
        { $set: { lastHeartbeatAt: new Date(now) } },
        { upsert: true, new: true }
      ).catch(() => {
        // Silently drop if MongoDB is unavailable — heartbeat is best-effort.
      });
    }
  }, intervalMs);

  return pollHandle;
}

function stopQueueWorker() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
    logger.info('worker.stopped', {
      pid: process.pid,
    });
  }
  isTickRunning = false;
}

module.exports = {
  claimNextQueuedJob,
  startQueueWorker,
  stopQueueWorker,
};
