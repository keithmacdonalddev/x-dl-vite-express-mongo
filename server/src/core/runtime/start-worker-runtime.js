const mongoose = require('mongoose');
const { getServerConfig, isDomainKernelEnabled, isStrictPluginStartup } = require('../../config/env');
const { createDomainContext } = require('./domain-context');
const { loadDomainsForRuntime } = require('./load-domains');
const { startQueueWorker, stopQueueWorker } = require('../../worker/queue');
const { processOneCycle } = require('../../worker/process-job');
const { recoverStaleJobs } = require('../../worker/recovery');
const { closePersistentContext } = require('../../services/playwright-adapter');
const { registerShutdown } = require('../../runtime/register-shutdown');

async function startWorkerRuntime({ applyDnsOverride } = {}) {
  if (typeof applyDnsOverride === 'function') {
    applyDnsOverride();
  }

  const config = getServerConfig();
  const domainKernelEnabled =
    typeof isDomainKernelEnabled === 'function' ? isDomainKernelEnabled() : false;
  const strictDomainStartup =
    typeof isStrictPluginStartup === 'function' ? isStrictPluginStartup() : false;
  let domainRuntime = { stopAll: async () => {} };

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

  if (domainKernelEnabled) {
    const domainCtx = createDomainContext({
      role: 'worker',
      config,
    });
    domainRuntime = await loadDomainsForRuntime({
      role: 'worker',
      ctx: domainCtx,
      strict: strictDomainStartup,
    });
  }

  startQueueWorker({
    intervalMs: 1000,
    onTick: async () => {
      await processOneCycle();
    },
  });

  console.log('Worker started');

  registerShutdown(async () => {
    await domainRuntime.stopAll();

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

