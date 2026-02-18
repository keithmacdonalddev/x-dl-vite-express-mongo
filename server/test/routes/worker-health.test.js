'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Stub mongoose model to avoid real DB connections in unit tests.
// We inject a fake WorkerHeartbeat via require cache manipulation.
function makeAppWithHeartbeat(heartbeatDoc) {
  // Clear all relevant caches so we can inject fresh stubs.
  const modulesToClear = [
    '../../src/models/worker-heartbeat',
    '../../src/routes/worker-health',
    '../../src/lib/telemetry',
    '../../src/lib/logger',
    '../../src/app',
  ];
  for (const m of modulesToClear) {
    try {
      delete require.cache[require.resolve(m)];
    } catch (_) {}
  }

  // Inject stub for worker-heartbeat model.
  const stub = {
    WorkerHeartbeat: {
      findOne: (_filter) => ({
        lean: () => Promise.resolve(heartbeatDoc),
      }),
      findOneAndUpdate: () => Promise.resolve(heartbeatDoc),
    },
  };
  require.cache[require.resolve('../../src/models/worker-heartbeat')] = {
    id: require.resolve('../../src/models/worker-heartbeat'),
    filename: require.resolve('../../src/models/worker-heartbeat'),
    loaded: true,
    exports: stub,
    parent: null,
    children: [],
  };

  return require('../../src/app').app;
}

function httpGet(app, path) {
  const http = require('node:http');
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const req = http.get(`http://localhost:${port}${path}`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          server.close();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch (err) {
            reject(err);
          }
        });
      });
      req.on('error', (err) => server.close(() => reject(err)));
    });
    server.on('error', reject);
  });
}

test('returns ok:false with null fields when no heartbeat exists', async () => {
  const app = makeAppWithHeartbeat(null);
  const { body } = await httpGet(app, '/api/worker/health');
  assert.equal(body.ok, false);
  assert.equal(body.lastHeartbeatAt, null);
  assert.equal(body.ageMs, null);
  assert.equal(typeof body.staleAfterMs, 'number');
  assert.ok(body.error);
});

test('returns ok:true when heartbeat age is within threshold (< 120s)', async () => {
  const recentDate = new Date(Date.now() - 5000); // 5 seconds ago
  const app = makeAppWithHeartbeat({ workerId: 'default', lastHeartbeatAt: recentDate });
  const { body } = await httpGet(app, '/api/worker/health');
  assert.equal(body.ok, true);
  assert.ok(body.ageMs <= 120000, `Expected ageMs <= 120000, got ${body.ageMs}`);
  assert.equal(body.staleAfterMs, 120000);
});

test('returns ok:false when heartbeat age exceeds threshold (> 120s)', async () => {
  const staleDate = new Date(Date.now() - 200000); // 200 seconds ago (> 120s threshold)
  const app = makeAppWithHeartbeat({ workerId: 'default', lastHeartbeatAt: staleDate });
  const { body } = await httpGet(app, '/api/worker/health');
  assert.equal(body.ok, false);
  assert.ok(body.ageMs > 120000, `Expected ageMs > 120000, got ${body.ageMs}`);
});

test('returns exact staleAfterMs of 120000', async () => {
  const app = makeAppWithHeartbeat(null);
  const { body } = await httpGet(app, '/api/worker/health');
  assert.equal(body.staleAfterMs, 120000);
});

test('response includes lastHeartbeatAt timestamp when heartbeat exists', async () => {
  const heartbeatDate = new Date(Date.now() - 10000);
  const app = makeAppWithHeartbeat({ workerId: 'default', lastHeartbeatAt: heartbeatDate });
  const { body } = await httpGet(app, '/api/worker/health');
  assert.ok(body.lastHeartbeatAt, 'lastHeartbeatAt should be present');
  // The returned value should be parseable as a date.
  const parsed = new Date(body.lastHeartbeatAt);
  assert.ok(!isNaN(parsed.getTime()), 'lastHeartbeatAt should be a valid date');
});
