const { EventEmitter } = require('node:events');

const emitter = new EventEmitter();
const maxHistory = Number.parseInt(process.env.TELEMETRY_HISTORY_LIMIT || '4000', 10) || 4000;
const history = [];
let nextId = 0;
const PROCESS_ID = String(process.pid);
const PROCESS_ROLE = String(process.env.ROLE || 'combined');

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

function resolveSinkMode(input = process.env) {
  const configuredMode = String(input.TELEMETRY_SINK || '').trim().toLowerCase();
  if (configuredMode) {
    return configuredMode;
  }

  const role = String(input.ROLE || '').trim().toLowerCase();
  if (role === 'api' || role === 'worker') {
    // Split runtimes use separate processes; default to shared Mongo sink so
    // worker telemetry is visible in API SSE/history without extra env setup.
    return 'mongo';
  }

  return 'memory';
}

const SINK_MODE = resolveSinkMode();
const useMongo = SINK_MODE === 'mongo' || SINK_MODE === 'mongodb';

// Batch buffer: events are held for up to 500ms then bulk-inserted.
let mongoBatch = [];
let mongoFlushTimer = null;

function scheduleMongoFlush() {
  if (mongoFlushTimer !== null) {
    return;
  }
  mongoFlushTimer = setTimeout(() => {
    mongoFlushTimer = null;
    flushMongoBatch();
  }, 500);
  mongoFlushTimer.unref?.();
}

function flushMongoBatch() {
  if (mongoBatch.length === 0) {
    return;
  }
  const toInsert = mongoBatch;
  mongoBatch = [];

  // Lazy-require to avoid circular dependencies and to let mongoose connect
  // before the first write attempt.
  let TelemetryEvent;
  try {
    ({ TelemetryEvent } = require('../../models/telemetry-event'));
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
    sourceProcessId: payload.sourceProcessId || PROCESS_ID,
    processRole: payload.processRole || PROCESS_ROLE,
    ts: payload.ts,
    data: Object.fromEntries(
      Object.entries(payload).filter(
        ([k]) => !['id', 'event', 'level', 'jobId', 'traceId', 'sourceProcessId', 'processRole', 'ts'].includes(k)
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
let mongoLastPolledId = null;
const seenMongoDocIds = new Set();

function rememberSeenMongoDocId(id) {
  seenMongoDocIds.add(id);
  if (seenMongoDocIds.size > 5000) {
    const first = seenMongoDocIds.values().next();
    if (!first.done) {
      seenMongoDocIds.delete(first.value);
    }
  }
}

async function hydrateHistoryFromMongo(TelemetryEvent) {
  const bootstrap = await TelemetryEvent.find({}, null, { sort: { _id: -1 }, limit: maxHistory, lean: true });
  if (!Array.isArray(bootstrap) || bootstrap.length === 0) {
    return;
  }

  bootstrap.reverse();
  for (const doc of bootstrap) {
    const docId = String(doc._id || '');
    if (docId) {
      rememberSeenMongoDocId(docId);
      mongoLastPolledId = docId;
    }

    const payload = {
      id: ++nextId,
      ts: doc.ts,
      event: doc.event,
      level: doc.level || '',
      jobId: doc.jobId || '',
      traceId: doc.traceId || '',
      sourceProcessId: doc.sourceProcessId || '',
      processRole: doc.processRole || '',
      ...(doc.data || {}),
    };

    if (!isNoiseEvent(payload.event)) {
      pushHistory(payload);
    }
  }
}

async function startMongoPolling() {
  if (!useMongo || mongoPollingHandle !== null) {
    return;
  }

  let TelemetryEvent;
  try {
    ({ TelemetryEvent } = require('../../models/telemetry-event'));
  } catch (_) {
    return;
  }

  try {
    await hydrateHistoryFromMongo(TelemetryEvent);
  } catch (_) {
    // Ignore hydration failures; polling may still succeed later.
  }

  mongoPollingHandle = setInterval(async () => {
    try {
      const filter = mongoLastPolledId ? { _id: { $gt: mongoLastPolledId } } : {};
      const events = await TelemetryEvent.find(filter, null, { sort: { _id: 1 }, limit: 200, lean: true });
      if (events.length === 0) {
        return;
      }

      for (const doc of events) {
        const docId = String(doc._id || '');
        if (docId) {
          if (seenMongoDocIds.has(docId)) {
            continue;
          }
          rememberSeenMongoDocId(docId);
          mongoLastPolledId = docId;
        }

        // Skip local-process events to avoid duplicate emit/list behavior.
        if ((doc.sourceProcessId || '') === PROCESS_ID) {
          continue;
        }

        const payload = {
          id: ++nextId,
          ts: doc.ts,
          event: doc.event,
          level: doc.level || '',
          jobId: doc.jobId || '',
          traceId: doc.traceId || '',
          sourceProcessId: doc.sourceProcessId || '',
          processRole: doc.processRole || '',
          ...(doc.data || {}),
        };
        if (!isNoiseEvent(payload.event)) {
          pushHistory(payload);
        }
        emitter.emit('event', payload);
      }
    } catch (_) {
      // Silently skip if MongoDB is unavailable.
    }
  }, 2000);
  mongoPollingHandle.unref?.();
}

// Start polling only in mongo mode.
if (useMongo) {
  // Defer start until next tick so mongoose has a chance to connect.
  setImmediate(() => {
    startMongoPolling().catch(() => {});
  });
}

// ---------------------------------------------------------------------------
// Public API (UNCHANGED — same three exports, same signatures)
// ---------------------------------------------------------------------------

function publishTelemetry(event, meta = {}) {
  const payload = {
    id: ++nextId,
    ts: new Date().toISOString(),
    event: typeof event === 'string' ? event : 'unknown',
    sourceProcessId: meta && meta.sourceProcessId ? meta.sourceProcessId : PROCESS_ID,
    processRole: meta && meta.processRole ? meta.processRole : PROCESS_ROLE,
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
  __testHooks: {
    useMongo,
    sinkMode: SINK_MODE,
    resolveSinkMode,
    hydrateHistoryFromMongo,
  },
};
