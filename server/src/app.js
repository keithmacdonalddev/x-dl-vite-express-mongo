const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('node:path');
const { jobsRouter } = require('./routes/jobs');
const {
  createCorsOptions,
  jsonBodyParser,
  enforceTweetUrlLength,
  handleRequestLimitErrors,
} = require('./middleware/request-limits');

const app = express();

app.use(cors(createCorsOptions()));
app.use(jsonBodyParser());
app.use(morgan('dev'));
app.use('/downloads', express.static(path.resolve(process.cwd(), 'downloads')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'x-dl-api',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/jobs', enforceTweetUrlLength, jobsRouter);
app.use(handleRequestLimitErrors);

module.exports = { app };
