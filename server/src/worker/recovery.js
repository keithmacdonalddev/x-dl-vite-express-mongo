const mongoose = require('mongoose');
const { Job } = require('../core/models/job');
const { JOB_STATUSES } = require('../core/constants/job-status');

const RECOVERED_FROM_RESTART = 'RECOVERED_FROM_RESTART';

async function recoverStaleJobs({ maxAgeMs = 15 * 60 * 1000 } = {}) {
  if (mongoose.connection.readyState !== 1) {
    return 0;
  }

  const cutoff = new Date(Date.now() - maxAgeMs);
  const now = new Date();

  const result = await Job.updateMany(
    {
      status: JOB_STATUSES.RUNNING,
      startedAt: { $lte: cutoff },
    },
    {
      $set: {
        status: JOB_STATUSES.FAILED,
        failedAt: now,
        error: RECOVERED_FROM_RESTART,
      },
    }
  );

  return result.modifiedCount || 0;
}

module.exports = {
  RECOVERED_FROM_RESTART,
  recoverStaleJobs,
};
