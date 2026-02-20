const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { jobsRouter } = require('../../../api/routes/jobs');
const { contactsRouter } = require('../../../api/routes/contacts');
const { retryRouter } = require('../../../api/routes/retry');
const { statusRouter } = require('../../../api/routes/status');
const { workerHealthRouter } = require('../../../api/routes/worker-health');
const { discoveryRouter } = require('../../../api/routes/discovery');
const { authRouter } = require('../../../api/routes/auth');
const { getPlatformCapabilities, setPlatformCapabilities } = require('../../config/platform-capabilities');
const { listTelemetry, subscribeTelemetry } = require('../../lib/telemetry');
const { logger } = require('../../lib/logger');
const {
  createCorsOptions,
  jsonBodyParser,
  enforceTweetUrlLength,
  handleRequestLimitErrors,
} = require('../../middleware/request-limits');

const app = express();

app.use(cors(createCorsOptions()));
app.use(jsonBodyParser());
app.use(morgan('dev'));
app.use((req, res, next) => {
  const requestStartedAt = Date.now();
  const traceIdHeader = typeof req.get === 'function' ? req.get('x-trace-id') : '';
  const traceId = typeof traceIdHeader === 'string' && traceIdHeader.trim() ? traceIdHeader.trim() : randomUUID();
  req.traceId = traceId;
  res.setHeader('x-trace-id', traceId);

  logger.info('http.request.started', {
    traceId,
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    ip: req.ip || '',
    contentLength: Number.parseInt(req.get('content-length') || '0', 10) || 0,
    userAgent: req.get('user-agent') || '',
  });

  res.on('finish', () => {
    logger.info('http.request.completed', {
      traceId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - requestStartedAt,
      responseContentLength: Number.parseInt(String(res.getHeader('content-length') || '0'), 10) || 0,
    });
  });

  next();
});
app.use('/downloads', express.static(path.resolve(process.cwd(), 'downloads')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'x-dl-api',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/capabilities', (_req, res) => {
  res.json({
    ok: true,
    platforms: getPlatformCapabilities(),
  });
});

app.get('/api/telemetry', (req, res) => {
  const excludeNoise = req.query.excludeNoise !== 'false';
  const events = listTelemetry({
    jobId: typeof req.query.jobId === 'string' ? req.query.jobId.trim() : '',
    traceId: typeof req.query.traceId === 'string' ? req.query.traceId.trim() : '',
    level: typeof req.query.level === 'string' ? req.query.level.trim() : '',
    limit: req.query.limit,
    excludeNoise,
  });

  return res.json({
    ok: true,
    count: events.length,
    events,
  });
});

app.get('/api/telemetry/stream', (req, res) => {
  const jobId = typeof req.query.jobId === 'string' ? req.query.jobId.trim() : '';
  const traceId = typeof req.query.traceId === 'string' ? req.query.traceId.trim() : '';
  const level = typeof req.query.level === 'string' ? req.query.level.trim() : '';
  const limit = req.query.limit;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const historical = listTelemetry({ jobId, traceId, level, limit, excludeNoise: true });
  for (const entry of historical) {
    res.write(`event: telemetry\n`);
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  const unsubscribe = subscribeTelemetry((entry) => {
    if (jobId && entry.jobId !== jobId) {
      return;
    }
    if (traceId && entry.traceId !== traceId) {
      return;
    }
    if (level && entry.level !== level) {
      return;
    }
    res.write(`event: telemetry\n`);
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\n`);
    res.write(`data: {"ts":"${new Date().toISOString()}"}\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.patch('/api/capabilities', (req, res) => {
  const { PLATFORMS } = require('../../platforms/registry');
  const platforms = req.body && typeof req.body === 'object' ? req.body.platforms : null;
  if (!platforms || typeof platforms !== 'object') {
    return res.status(400).json({
      ok: false,
      error: 'Request body must include a platforms object.',
    });
  }

  const nextCapabilities = {};
  for (const platform of PLATFORMS) {
    if (Object.prototype.hasOwnProperty.call(platforms, platform.id)) {
      if (typeof platforms[platform.id] !== 'boolean') {
        return res.status(400).json({
          ok: false,
          error: `platforms.${platform.id} must be a boolean.`,
        });
      }
      nextCapabilities[platform.id] = platforms[platform.id];
    }
  }

  res.json({
    ok: true,
    platforms: setPlatformCapabilities(nextCapabilities),
  });
});

app.use('/api/jobs', enforceTweetUrlLength, jobsRouter);
app.use('/api/jobs', enforceTweetUrlLength, contactsRouter);
app.use('/api/jobs', enforceTweetUrlLength, retryRouter);
app.use('/api/jobs', enforceTweetUrlLength, statusRouter);
app.use('/api/discovery', discoveryRouter);
app.use('/api/auth', authRouter);
app.use(workerHealthRouter);
app.use(handleRequestLimitErrors);

module.exports = { app };
