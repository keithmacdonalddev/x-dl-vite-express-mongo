const { EventEmitter } = require('node:events');

const emitter = new EventEmitter();
const maxHistory = Number.parseInt(process.env.TELEMETRY_HISTORY_LIMIT || '4000', 10) || 4000;
const history = [];
let nextId = 0;

/**
 * HTTP-request telemetry events (generated every 3s by client polling) flood
 * the fixed-size ring buffer and evict meaningful job-lifecycle events.
 *
 * These noise events are NEVER stored in the ring buffer.  They are still
 * emitted via the EventEmitter so live SSE subscribers can see them in
 * real-time, but they will not appear in history queries.  This guarantees
 * that job events survive in the buffer indefinitely (up to maxHistory
 * meaningful events).
 */
const NOISE_EVENT_PREFIX = 'http.request.';

function isNoiseEvent(eventName) {
  return typeof eventName === 'string' && eventName.startsWith(NOISE_EVENT_PREFIX);
}

function normalizeLimit(rawLimit) {
  const parsed = Number.parseInt(rawLimit || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 200;
  }
  return Math.min(parsed, 2000);
}

function pushHistory(entry) {
  history.push(entry);
  if (history.length > maxHistory) {
    history.splice(0, history.length - maxHistory);
  }
}

// ---------------------------------------------------------------------------
// MongoDB sink (TELEMETRY_SINK=mongo)
// Active only when TELEMETRY_SINK env var is set to 'mongo'.
// The singleton API (publishTelemetry/subscribeTelemetry/listTelemetry) is
// IDENTICAL regardless of sink mode — callers never need to change.
// ---------------------------------------------------------------------------

const SINK_MODE = (process.env.TELEMETRY_SINK || 'memory').toLowerCase();
const useMongo = SINK_MODE === 'mongo';

// Batch buffer: events are held for up to 500ms then bulk-inserted.
let mongoBatch = [];
let mongoFlushTimer = null;

function scheduleMongoFlush() {
  if (mongoFlushTimer !== null) {
    return;
  }
  mongoFlushTimer = setTimeout(() => {
    mongoFlushTimer = null;
    flushMongooBatch();
  }, 500);
}

function flushMongooBatch() {
  if (mongoBatch.length === 0) {
    return;
  }
  const toInsert = mongoBatch;
  mongoBatch = [];

  // Lazy-require to avoid circular dependencies and to let mongoose connect
  // before the first write attempt.
  let TelemetryEvent;
  try {
    ({ TelemetryEvent } = require('../models/telemetry-event'));
  } catch (_) {
    return;
  }

  TelemetryEvent.insertMany(toInsert, { ordered: false }).catch(() => {
    // Fire-and-forget: silently drop if MongoDB is unavailable.
  });
}

function queueMongoWrite(payload) {
  if (!useMongo) {
    return;
  }
  // Noise events are never persisted to MongoDB.
  if (isNoiseEvent(payload.event)) {
    return;
  }
  mongoBatch.push({
    event: payload.event,
    level: payload.level || '',
    jobId: payload.jobId || '',
    traceId: payload.traceId || '',
    ts: payload.ts,
    data: Object.fromEntries(
      Object.entries(payload).filter(
        ([k]) => !['id', 'event', 'level', 'jobId', 'traceId', 'ts'].includes(k)
      )
    ),
    createdAt: new Date(payload.ts),
  });
  scheduleMongoFlush();
}

// ---------------------------------------------------------------------------
// Mongo polling for subscribeTelemetry (cross-process events from worker)
// When TELEMETRY_SINK=mongo, the API process may not share memory with the
// worker process.  A 2s poll on the TelemetryEvent collection bridges the gap.
// ---------------------------------------------------------------------------

let mongoPollingHandle = null;
let mongoLastPolledTs = null;

function startMongoPolling() {
  if (!useMongo || mongoPollingHandle !== null) {
    return;
  }
  mongoLastPolledTs = new Date().toISOString();

  mongoPollingHandle = setInterval(async () => {
    let TelemetryEvent;
    try {
      ({ TelemetryEvent } = require('../models/telemetry-event'));
    } catch (_) {
      return;
    }
    try {
      const since = mongoLastPolledTs;
      const events = await TelemetryEvent.find(
        { ts: { $gt: since } },
        null,
        { sort: { ts: 1 }, limit: 200, lean: true }
      );
      if (events.length > 0) {
        mongoLastPolledTs = events[events.length - 1].ts;
        for (const doc of events) {
          const payload = {
            id: ++nextId,
            ts: doc.ts,
            event: doc.event,
            level: doc.level || '',
            jobId: doc.jobId || '',
            traceId: doc.traceId || '',
            ...(doc.data || {}),
          };
          // Add to local ring buffer so listTelemetry stays consistent.
          if (!isNoiseEvent(payload.event)) {
            pushHistory(payload);
          }
          emitter.emit('event', payload);
        }
      }
    } catch (_) {
      // Silently skip if MongoDB is unavailable.
    }
  }, 2000);
}

// Start polling only in mongo mode.
if (useMongo) {
  // Defer start until next tick so mongoose has a chance to connect.
  setImmediate(startMongoPolling);
}

// ---------------------------------------------------------------------------
// Public API (UNCHANGED — same three exports, same signatures)
// ---------------------------------------------------------------------------

function publishTelemetry(event, meta = {}) {
  const payload = {
    id: ++nextId,
    ts: new Date().toISOString(),
    event: typeof event === 'string' ? event : 'unknown',
    ...meta,
  };
  // Only store meaningful events in the ring buffer.
  // Noise events (http.request.*) are emitted for live SSE but never persisted.
  if (!isNoiseEvent(payload.event)) {
    pushHistory(payload);
  }
  emitter.emit('event', payload);
  // Queue async MongoDB write (no-op in memory mode).
  queueMongoWrite(payload);
  return payload;
}

function subscribeTelemetry(listener) {
  emitter.on('event', listener);
  return () => {
    emitter.off('event', listener);
  };
}

function matchesFilters(entry, filters = {}) {
  if (filters.excludeNoise && isNoiseEvent(entry.event)) {
    return false;
  }
  if (filters.jobId && entry.jobId !== filters.jobId) {
    return false;
  }
  if (filters.traceId && entry.traceId !== filters.traceId) {
    return false;
  }
  if (filters.level && entry.level !== filters.level) {
    return false;
  }
  return true;
}

function listTelemetry(filters = {}) {
  const limit = normalizeLimit(filters.limit);
  const filtered = history.filter((entry) => matchesFilters(entry, filters));
  return filtered.slice(Math.max(filtered.length - limit, 0));
}

module.exports = {
  publishTelemetry,
  subscribeTelemetry,
  listTelemetry,
};
