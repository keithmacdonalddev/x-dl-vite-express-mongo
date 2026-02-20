const path = require('node:path');
const dns = require('node:dns');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { app } = require('./app');
const { getServerConfig, chooseRuntime } = require('../../config/env');
const { startQueueWorker, stopQueueWorker } = require('../../../worker/queue');
const { processOneCycle } = require('../../../worker/process-job');
const { recoverStaleJobs } = require('../../../worker/recovery');
const { closePersistentContext } = require('../../../services/playwright-adapter');
const { startApiRuntime } = require('../start-api-runtime');
const { startWorkerRuntime } = require('../start-worker-runtime');

dotenv.config({
  path: path.resolve(__dirname, '../../../../.env'),
});

function applyDnsOverrideFromEnv(env = process.env) {
  const configured = typeof env.MONGODB_DNS_SERVERS === 'string' ? env.MONGODB_DNS_SERVERS.trim() : '';
  if (!configured) {
    return;
  }

  const servers = configured
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (servers.length > 0) {
    dns.setServers(servers);
    console.log(`MongoDB DNS override enabled: ${servers.join(', ')}`);
  }
}

// When ROLE is explicitly set, use the split runtime for that role.
// When ROLE is not set, run the monolithic mode (API + worker in same process)
// for full backwards compatibility with existing deploys.
const explicitRole = process.env.ROLE ? chooseRuntime() : null;

if (explicitRole === 'api') {
  startApiRuntime({ applyDnsOverride: applyDnsOverrideFromEnv }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to start API: ${message}`);
    process.exit(1);
  });
} else if (explicitRole === 'worker') {
  startWorkerRuntime({ applyDnsOverride: applyDnsOverrideFromEnv }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to start worker: ${message}`);
    process.exit(1);
  });
} else {
  // Monolithic mode: API + worker in same process (default, backwards-compatible)
  const config = getServerConfig();
  let serverHandle = null;
  let isShuttingDown = false;

  applyDnsOverrideFromEnv();

  serverHandle = app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });

  if (config.mongoUri) {
    mongoose
      .connect(config.mongoUri)
      .then(async () => {
        console.log('MongoDB connected');
        const recoveredCount = await recoverStaleJobs();
        if (recoveredCount > 0) {
          console.warn(`Recovered ${recoveredCount} stale running jobs after restart.`);
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`MongoDB connection failed: ${message}`);
      });
  } else {
    console.warn('MONGODB_URI is not set. Running API without database connection.');
  }

  startQueueWorker({
    intervalMs: 1000,
    onTick: async () => {
      await processOneCycle();
    },
  });

  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    if (signal) {
      console.log(`Received ${signal}; shutting down...`);
    }

    stopQueueWorker();

    if (serverHandle) {
      await new Promise((resolve) => {
        serverHandle.close(() => resolve());
      });
    }

    try {
      await closePersistentContext();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to close Playwright context: ${message}`);
    }

    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }

  process.on('SIGINT', () => {
    shutdown('SIGINT')
      .then(() => process.exit(0))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Shutdown failed: ${message}`);
        process.exit(1);
      });
  });

  process.on('SIGTERM', () => {
    shutdown('SIGTERM')
      .then(() => process.exit(0))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Shutdown failed: ${message}`);
        process.exit(1);
      });
  });
}
