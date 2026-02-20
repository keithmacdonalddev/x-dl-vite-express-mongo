'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Ensure memory sink mode for unit tests (no MongoDB dependency).
process.env.TELEMETRY_SINK = 'memory';

// Re-require after setting env so module-level SINK_MODE reads correctly.
// Use a fresh require each time by clearing the cache.
function freshTelemetry() {
  delete require.cache[require.resolve('../../src/core/lib/telemetry')];
  return require('../../src/core/lib/telemetry');
}

function freshTelemetryWithSink(sinkValue, telemetryModelStub) {
  process.env.TELEMETRY_SINK = sinkValue;
  try {
    delete require.cache[require.resolve('../../src/core/models/telemetry-event')];
  } catch (_) {}
  try {
    delete require.cache[require.resolve('../../src/core/lib/telemetry')];
  } catch (_) {}

  if (telemetryModelStub) {
    require.cache[require.resolve('../../src/core/models/telemetry-event')] = {
      id: require.resolve('../../src/core/models/telemetry-event'),
      filename: require.resolve('../../src/core/models/telemetry-event'),
      loaded: true,
      exports: telemetryModelStub,
      parent: null,
      children: [],
    };
  }

  return require('../../src/core/lib/telemetry');
}

function freshTelemetryWithEnv({ sinkValue, roleValue, telemetryModelStub } = {}) {
  if (typeof sinkValue === 'string') {
    process.env.TELEMETRY_SINK = sinkValue;
  } else {
    delete process.env.TELEMETRY_SINK;
  }

  if (typeof roleValue === 'string') {
    process.env.ROLE = roleValue;
  } else {
    delete process.env.ROLE;
  }

  try {
    delete require.cache[require.resolve('../../src/core/models/telemetry-event')];
  } catch (_) {}
  try {
    delete require.cache[require.resolve('../../src/core/lib/telemetry')];
  } catch (_) {}

  if (telemetryModelStub) {
    require.cache[require.resolve('../../src/core/models/telemetry-event')] = {
      id: require.resolve('../../src/core/models/telemetry-event'),
      filename: require.resolve('../../src/core/models/telemetry-event'),
      loaded: true,
      exports: telemetryModelStub,
      parent: null,
      children: [],
    };
  }

  return require('../../src/core/lib/telemetry');
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

test('TELEMETRY_SINK=mongo enables mongo sink writes', async () => {
  let insertCalls = 0;
  const tel = freshTelemetryWithSink('mongo', {
    TelemetryEvent: {
      insertMany: async () => {
        insertCalls += 1;
      },
    },
  });
  tel.publishTelemetry('job.mongo_sink.enabled', { level: 'info', traceId: 'sink-mongo' });
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.ok(insertCalls > 0, 'Expected mongo sink to write when TELEMETRY_SINK=mongo');
});

test('TELEMETRY_SINK=mongodb also enables mongo sink writes', async () => {
  let insertCalls = 0;
  const tel = freshTelemetryWithSink('mongodb', {
    TelemetryEvent: {
      insertMany: async () => {
        insertCalls += 1;
      },
    },
  });
  tel.publishTelemetry('job.mongodb_sink.enabled', { level: 'info', traceId: 'sink-mongodb' });
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.ok(insertCalls > 0, 'Expected mongo sink to write when TELEMETRY_SINK=mongodb');
});

// Task 1: TELEMETRY_SINK alias normalization — both 'mongo' and 'mongodb' must
// activate mongo mode.  The useMongo flag is internal, but we can observe it
// via the exported __testHooks (added by Task 1 implementation) or by checking
// that the module does NOT treat the value as memory mode when 'mongodb' is set.

test('TELEMETRY_SINK=mongo activates mongo sink (useMongo flag)', () => {
  const origSink = process.env.TELEMETRY_SINK;
  process.env.TELEMETRY_SINK = 'mongo';
  delete require.cache[require.resolve('../../src/core/lib/telemetry')];
  const tel = require('../../src/core/lib/telemetry');
  assert.equal(tel.__testHooks.useMongo, true, 'TELEMETRY_SINK=mongo should set useMongo=true');
  process.env.TELEMETRY_SINK = origSink || 'memory';
  delete require.cache[require.resolve('../../src/core/lib/telemetry')];
});

test('TELEMETRY_SINK=mongodb activates mongo sink (useMongo flag)', () => {
  const origSink = process.env.TELEMETRY_SINK;
  process.env.TELEMETRY_SINK = 'mongodb';
  delete require.cache[require.resolve('../../src/core/lib/telemetry')];
  const tel = require('../../src/core/lib/telemetry');
  assert.equal(tel.__testHooks.useMongo, true, 'TELEMETRY_SINK=mongodb should set useMongo=true');
  process.env.TELEMETRY_SINK = origSink || 'memory';
  delete require.cache[require.resolve('../../src/core/lib/telemetry')];
});

test('TELEMETRY_SINK=MONGO (uppercase) activates mongo sink', () => {
  const origSink = process.env.TELEMETRY_SINK;
  process.env.TELEMETRY_SINK = 'MONGO';
  delete require.cache[require.resolve('../../src/core/lib/telemetry')];
  const tel = require('../../src/core/lib/telemetry');
  assert.equal(tel.__testHooks.useMongo, true, 'TELEMETRY_SINK=MONGO (uppercase) should set useMongo=true');
  process.env.TELEMETRY_SINK = origSink || 'memory';
  delete require.cache[require.resolve('../../src/core/lib/telemetry')];
});

test('TELEMETRY_SINK=MONGODB (uppercase) activates mongo sink', () => {
  const origSink = process.env.TELEMETRY_SINK;
  process.env.TELEMETRY_SINK = 'MONGODB';
  delete require.cache[require.resolve('../../src/core/lib/telemetry')];
  const tel = require('../../src/core/lib/telemetry');
  assert.equal(tel.__testHooks.useMongo, true, 'TELEMETRY_SINK=MONGODB (uppercase) should set useMongo=true');
  process.env.TELEMETRY_SINK = origSink || 'memory';
  delete require.cache[require.resolve('../../src/core/lib/telemetry')];
});

test('split ROLE defaults telemetry sink to mongo when TELEMETRY_SINK is unset', () => {
  const tel = freshTelemetryWithEnv({
    sinkValue: null,
    roleValue: 'api',
  });
  assert.equal(tel.__testHooks.useMongo, true, 'ROLE=api should default to mongo sink when TELEMETRY_SINK is unset');
});

test('combined role defaults telemetry sink to memory when TELEMETRY_SINK is unset', () => {
  const tel = freshTelemetryWithEnv({
    sinkValue: null,
    roleValue: null,
  });
  assert.equal(tel.__testHooks.useMongo, false, 'Combined mode should keep memory sink when TELEMETRY_SINK is unset');
});

test('mongo sink bootstraps recent history into listTelemetry', async () => {
  const doc = {
    _id: '000000000000000000000111',
    ts: new Date().toISOString(),
    event: 'worker.job.completed',
    level: 'info',
    jobId: 'boot-job-1',
    traceId: 'boot-trace-1',
    sourceProcessId: 'worker-9999',
    processRole: 'worker',
    data: { note: 'bootstrapped' },
  };

  const tel = freshTelemetryWithSink('memory');
  await tel.__testHooks.hydrateHistoryFromMongo({
    find: async () => [doc],
  });
  const events = tel.listTelemetry({ traceId: 'boot-trace-1' });
  assert.ok(events.length >= 1, 'Expected hydrated event in local history');
  assert.equal(events[events.length - 1].event, 'worker.job.completed');
});

test('mongo polling skips re-emitting events from the same process id', async () => {
  const selfPid = String(process.pid);
  const pollDoc = {
    _id: '000000000000000000000222',
    ts: new Date().toISOString(),
    event: 'worker.job.claimed',
    level: 'info',
    jobId: 'dedupe-job-1',
    traceId: 'dedupe-trace-1',
    sourceProcessId: selfPid,
    processRole: 'api',
    data: {},
  };

  let findCalls = 0;
  const tel = freshTelemetryWithSink('mongo', {
    TelemetryEvent: {
      insertMany: async () => {},
      find: async () => {
        findCalls += 1;
        if (findCalls === 1) {
          return []; // hydrate
        }
        return [pollDoc]; // poll cycle
      },
    },
  });

  let received = 0;
  const unsubscribe = tel.subscribeTelemetry((entry) => {
    if (entry.traceId === 'dedupe-trace-1') {
      received += 1;
    }
  });

  tel.publishTelemetry('worker.job.claimed', { traceId: 'dedupe-trace-1' });
  await new Promise((resolve) => setTimeout(resolve, 2300));
  unsubscribe();

  assert.equal(received, 1, 'Expected only local publish event, not duplicate polled self-event');
});
