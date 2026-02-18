const { EventEmitter } = require('node:events');

const emitter = new EventEmitter();
const maxHistory = Number.parseInt(process.env.TELEMETRY_HISTORY_LIMIT || '4000', 10) || 4000;
const history = [];
let nextId = 0;

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

function publishTelemetry(event, meta = {}) {
  const payload = {
    id: ++nextId,
    ts: new Date().toISOString(),
    event: typeof event === 'string' ? event : 'unknown',
    ...meta,
  };
  pushHistory(payload);
  emitter.emit('event', payload);
  return payload;
}

function subscribeTelemetry(listener) {
  emitter.on('event', listener);
  return () => {
    emitter.off('event', listener);
  };
}

/**
 * HTTP-request telemetry events (generated every 3s by client polling) can
 * drown out meaningful job-lifecycle events in the fixed-size ring buffer.
 * When `excludeNoise` is true, these events are filtered out before the
 * limit is applied, so callers always get meaningful events.
 */
const NOISE_EVENT_PREFIX = 'http.request.';

function isNoiseEvent(entry) {
  return typeof entry.event === 'string' && entry.event.startsWith(NOISE_EVENT_PREFIX);
}

function matchesFilters(entry, filters = {}) {
  if (filters.excludeNoise && isNoiseEvent(entry)) {
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
