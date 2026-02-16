const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { app } = require('./app');
const { getServerConfig } = require('./config/env');
const { startQueueWorker, stopQueueWorker } = require('./worker/queue');
const { processOneCycle } = require('./worker/process-job');
const { recoverStaleJobs } = require('./worker/recovery');
const { closePersistentContext } = require('./services/playwright-adapter');

dotenv.config();

const config = getServerConfig();
let serverHandle = null;
let isShuttingDown = false;

async function start() {
  if (config.mongoUri) {
    try {
      await mongoose.connect(config.mongoUri);
      console.log('MongoDB connected');
      const recoveredCount = await recoverStaleJobs();
      if (recoveredCount > 0) {
        console.warn(`Recovered ${recoveredCount} stale running jobs after restart.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`MongoDB connection failed: ${message}`);
    }
  } else {
    console.warn('MONGODB_URI is not set. Running API without database connection.');
  }

  serverHandle = app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });

  startQueueWorker({
    intervalMs: 1000,
    onTick: async () => {
      await processOneCycle();
    },
  });
}

start().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start API: ${message}`);
  process.exit(1);
});

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }
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
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Shutdown failed: ${message}`);
      process.exit(1);
    });
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM')
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Shutdown failed: ${message}`);
      process.exit(1);
    });
});
