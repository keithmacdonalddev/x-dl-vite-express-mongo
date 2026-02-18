const mongoose = require('mongoose');
const { app } = require('../app');
const { getServerConfig } = require('../config/env');
const { registerShutdown } = require('./register-shutdown');

async function startApiRuntime({ applyDnsOverride } = {}) {
  if (typeof applyDnsOverride === 'function') {
    applyDnsOverride();
  }

  const config = getServerConfig();

  const serverHandle = app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });

  if (config.mongoUri) {
    // Fire-and-forget: do not block HTTP startup on MongoDB handshake.
    mongoose
      .connect(config.mongoUri)
      .then(() => {
        console.log('MongoDB connected');
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`MongoDB connection failed: ${message}`);
      });
  } else {
    console.warn('MONGODB_URI is not set. Running API without database connection.');
  }

  registerShutdown(async () => {
    await new Promise((resolve) => {
      serverHandle.close(() => resolve());
    });

    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  });
}

module.exports = { startApiRuntime };
