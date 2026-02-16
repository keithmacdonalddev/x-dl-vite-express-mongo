const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { jobsRouter } = require('./routes/jobs');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'x-dl-api',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/jobs', jobsRouter);

module.exports = { app };
