const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { app } = require('./app');
const { getServerConfig } = require('./config/env');

dotenv.config();

const config = getServerConfig();

async function start() {
  if (config.mongoUri) {
    try {
      await mongoose.connect(config.mongoUri);
      console.log('MongoDB connected');
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
}

start().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start API: ${message}`);
  process.exit(1);
});
