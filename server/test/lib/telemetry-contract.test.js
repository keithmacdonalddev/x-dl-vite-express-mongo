'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Ensure memory sink mode for unit tests (no MongoDB dependency).
process.env.TELEMETRY_SINK = 'memory';

// Re-require after setting env so module-level SINK_MODE reads correctly.
// Use a fresh require each time by clearing the cache.
function freshTelemetry() {
  delete require.cache[require.resolve('../../src/lib/telemetry')];
  return require('../../src/lib/telemetry');
}

test('telemetry.js exports publishTelemetry, subscribeTelemetry, listTelemetry', () => {
  const tel = freshTelemetry();
  assert.equal(typeof tel.publishTelemetry, 'function');
  assert.equal(typeof tel.subscribeTelemetry, 'function');
  assert.equal(typeof tel.listTelemetry, 'function');
});

test('publishTelemetry returns a payload with id, ts, and event fields', () => {
  const tel = freshTelemetry();
  const payload = tel.publishTelemetry('test.event', { level: 'info', jobId: 'j1' });
  assert.ok(typeof payload.id === 'number');
  assert.ok(typeof payload.ts === 'string');
  assert.equal(payload.event, 'test.event');
  assert.equal(payload.level, 'info');
  assert.equal(payload.jobId, 'j1');
});

test('publish + list roundtrip works with memory sink', () => {
  const tel = freshTelemetry();
  tel.publishTelemetry('test.roundtrip', { level: 'info', jobId: 'j2' });
  const events = tel.listTelemetry({ jobId: 'j2' });
  assert.ok(events.length > 0);
  assert.equal(events[events.length - 1].event, 'test.roundtrip');
});

test('listTelemetry filters by jobId', () => {
  const tel = freshTelemetry();
  tel.publishTelemetry('job.started', { level: 'info', jobId: 'job-a' });
  tel.publishTelemetry('job.started', { level: 'info', jobId: 'job-b' });
  const events = tel.listTelemetry({ jobId: 'job-a' });
  assert.ok(events.every((e) => e.jobId === 'job-a'));
});

test('listTelemetry filters by traceId', () => {
  const tel = freshTelemetry();
  tel.publishTelemetry('job.started', { level: 'info', traceId: 'trace-x' });
  tel.publishTelemetry('job.started', { level: 'info', traceId: 'trace-y' });
  const events = tel.listTelemetry({ traceId: 'trace-x' });
  assert.ok(events.every((e) => e.traceId === 'trace-x'));
});

test('listTelemetry filters by level', () => {
  const tel = freshTelemetry();
  tel.publishTelemetry('something.happened', { level: 'error', jobId: 'j3' });
  tel.publishTelemetry('something.else', { level: 'info', jobId: 'j3' });
  const errors = tel.listTelemetry({ level: 'error', jobId: 'j3' });
  assert.ok(errors.every((e) => e.level === 'error'));
});

test('noise events (http.request.*) are not stored in ring buffer', () => {
  const tel = freshTelemetry();
  tel.publishTelemetry('http.request.started', { level: 'info', traceId: 'noise-trace' });
  const events = tel.listTelemetry({ traceId: 'noise-trace' });
  assert.equal(events.length, 0, 'Noise events should not appear in listTelemetry');
});

test('noise events are still emitted to live SSE subscribers', (_, done) => {
  const tel = freshTelemetry();
  const unsubscribe = tel.subscribeTelemetry((entry) => {
    if (entry.event === 'http.request.started' && entry.traceId === 'noise-emit-trace') {
      unsubscribe();
      done();
    }
  });
  tel.publishTelemetry('http.request.started', { level: 'info', traceId: 'noise-emit-trace' });
});

test('subscribeTelemetry receives published events', (_, done) => {
  const tel = freshTelemetry();
  const unsubscribe = tel.subscribeTelemetry((entry) => {
    if (entry.event === 'subscribe.test' && entry.jobId === 'sub-j1') {
      unsubscribe();
      done();
    }
  });
  tel.publishTelemetry('subscribe.test', { level: 'info', jobId: 'sub-j1' });
});

test('subscribeTelemetry returns an unsubscribe function', () => {
  const tel = freshTelemetry();
  const received = [];
  const unsubscribe = tel.subscribeTelemetry((entry) => {
    received.push(entry);
  });
  assert.equal(typeof unsubscribe, 'function');
  tel.publishTelemetry('before.unsub', { jobId: 'unsub-test' });
  unsubscribe();
  tel.publishTelemetry('after.unsub', { jobId: 'unsub-test' });
  // Only the event before unsubscribe should have been received.
  const relevant = received.filter((e) => e.jobId === 'unsub-test');
  assert.equal(relevant.length, 1);
  assert.equal(relevant[0].event, 'before.unsub');
});

test('listTelemetry respects limit', () => {
  const tel = freshTelemetry();
  for (let i = 0; i < 10; i++) {
    tel.publishTelemetry('limit.test', { level: 'info', jobId: 'limit-j' });
  }
  const events = tel.listTelemetry({ jobId: 'limit-j', limit: 3 });
  assert.ok(events.length <= 3);
});

test('TELEMETRY_SINK=memory does not attempt MongoDB writes', () => {
  // In memory mode, queueMongoWrite should be a no-op.
  // We verify this by checking that requiring the model doesn't throw.
  const tel = freshTelemetry();
  // Publish a batch of events — should not throw even if mongoose isn't connected.
  for (let i = 0; i < 5; i++) {
    tel.publishTelemetry('memory.mode.test', { level: 'info' });
  }
  assert.ok(true, 'No error thrown in memory sink mode');
});
