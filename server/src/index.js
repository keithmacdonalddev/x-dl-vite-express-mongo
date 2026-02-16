const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { app } = require('./app');

dotenv.config();

const PORT = Number(process.env.PORT || 4000);
const MONGODB_URI = process.env.MONGODB_URI || '';

async function start() {
  if (MONGODB_URI) {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log('MongoDB connected');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`MongoDB connection failed: ${message}`);
    }
  } else {
    console.warn('MONGODB_URI is not set. Running API without database connection.');
  }

  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start API: ${message}`);
  process.exit(1);
});
