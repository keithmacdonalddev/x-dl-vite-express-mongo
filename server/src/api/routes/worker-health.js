const express = require('express');
const mongoose = require('mongoose');
const { WorkerHeartbeat } = require('../../core/models/worker-heartbeat');
const { ERROR_CODES } = require('../../core/lib/error-codes');
const { sendError } = require('./helpers/route-utils');

const workerHealthRouter = express.Router();

const STALE_THRESHOLD_MS = 120000; // 2 minutes

workerHealthRouter.get('/api/worker/health', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  const heartbeat = await WorkerHeartbeat.findOne({ workerId: 'default' }).lean();

  if (!heartbeat) {
    return res.json({
      ok: false,
      error: 'No heartbeat recorded',
      lastHeartbeatAt: null,
      ageMs: null,
      staleAfterMs: STALE_THRESHOLD_MS,
    });
  }

  const ageMs = Date.now() - new Date(heartbeat.lastHeartbeatAt).getTime();

  return res.json({
    ok: ageMs <= STALE_THRESHOLD_MS,
    lastHeartbeatAt: heartbeat.lastHeartbeatAt,
    ageMs,
    staleAfterMs: STALE_THRESHOLD_MS,
  });
});

module.exports = { workerHealthRouter };

