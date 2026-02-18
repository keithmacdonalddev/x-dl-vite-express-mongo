const express = require('express');
const { WorkerHeartbeat } = require('../models/worker-heartbeat');

const workerHealthRouter = express.Router();

const STALE_THRESHOLD_MS = 120000; // 2 minutes

workerHealthRouter.get('/api/worker/health', async (req, res) => {
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
