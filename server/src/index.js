const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { app } = require('./app');
const { getServerConfig } = require('./config/env');
const { startQueueWorker, stopQueueWorker } = require('./worker/queue');
const { processOneCycle } = require('./worker/process-job');
const { recoverStaleJobs } = require('./worker/recovery');

dotenv.config();

const config = getServerConfig();

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

  app.listen(config.port, () => {
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

process.on('exit', () => {
  stopQueueWorker();
});

process.on('SIGINT', () => {
  stopQueueWorker();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopQueueWorker();
  process.exit(0);
});
