const mongoose = require('mongoose');
const { getServerConfig } = require('../config/env');
const { startQueueWorker, stopQueueWorker } = require('../worker/queue');
const { processOneCycle } = require('../worker/process-job');
const { recoverStaleJobs } = require('../worker/recovery');
const { closePersistentContext } = require('../services/playwright-adapter');
const { registerShutdown } = require('./register-shutdown');

async function startWorkerRuntime({ applyDnsOverride } = {}) {
  if (typeof applyDnsOverride === 'function') {
    applyDnsOverride();
  }

  const config = getServerConfig();

  if (!config.mongoUri) {
    console.error('MONGODB_URI is not set. Worker requires a database connection.');
    process.exit(1);
  }

  // CRIT-1: Worker MUST await MongoDB before starting queue.
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  const recoveredCount = await recoverStaleJobs();
  if (recoveredCount > 0) {
    console.warn(`Recovered ${recoveredCount} stale running jobs after restart.`);
  }

  startQueueWorker({
    intervalMs: 1000,
    onTick: async () => {
      await processOneCycle();
    },
  });

  console.log('Worker started');

  registerShutdown(async () => {
    stopQueueWorker();

    try {
      await closePersistentContext();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to close Playwright context: ${message}`);
    }

    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  });
}

module.exports = { startWorkerRuntime };
