'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');

const serverSrc = path.resolve(__dirname, '../../src');

function clearModuleCache(prefix) {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(prefix)) {
      delete require.cache[key];
    }
  }
}

function injectStub(resolvedPath, stub) {
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports: stub,
    parent: null,
    children: [],
  };
  return () => {
    delete require.cache[resolvedPath];
  };
}

function makeAppWithHeartbeat(heartbeatDoc, options = {}) {
  const readyState = Number.isInteger(options.readyState) ? options.readyState : 1;
  clearModuleCache(serverSrc);

  const mongooseStub = {
    connection: { readyState },
    Types: {
      ObjectId: {
        isValid: () => true,
      },
    },
  };

  const heartbeatStub = {
    WorkerHeartbeat: {
      findOne: () => ({
        lean: () => Promise.resolve(heartbeatDoc),
      }),
      findOneAndUpdate: () => Promise.resolve(heartbeatDoc),
    },
  };

  const teardowns = [
    injectStub(require.resolve('mongoose'), mongooseStub),
    injectStub(path.join(serverSrc, 'core/models/worker-heartbeat.js'), heartbeatStub),
  ];

  const { workerHealthRouter } = require('../../src/api/routes/worker-health');
  const app = express();
  app.use(workerHealthRouter);

  return {
    app,
    teardown: () => {
      teardowns.forEach((teardown) => teardown());
      clearModuleCache(serverSrc);
    },
  };
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
  const harness = makeAppWithHeartbeat(null);
  try {
    const { body } = await httpGet(harness.app, '/api/worker/health');
    assert.equal(body.ok, false);
    assert.equal(body.lastHeartbeatAt, null);
    assert.equal(body.ageMs, null);
    assert.equal(typeof body.staleAfterMs, 'number');
    assert.ok(body.error);
  } finally {
    harness.teardown();
  }
});

test('returns 503 when database is disconnected', async () => {
  const harness = makeAppWithHeartbeat(null, { readyState: 0 });
  try {
    const { status, body } = await httpGet(harness.app, '/api/worker/health');
    assert.equal(status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.code, 'DB_NOT_CONNECTED');
  } finally {
    harness.teardown();
  }
});

test('returns ok:true when heartbeat age is within threshold (< 120s)', async () => {
  const recentDate = new Date(Date.now() - 5000); // 5 seconds ago
  const harness = makeAppWithHeartbeat({ workerId: 'default', lastHeartbeatAt: recentDate });
  try {
    const { body } = await httpGet(harness.app, '/api/worker/health');
    assert.equal(body.ok, true);
    assert.ok(body.ageMs <= 120000, `Expected ageMs <= 120000, got ${body.ageMs}`);
    assert.equal(body.staleAfterMs, 120000);
  } finally {
    harness.teardown();
  }
});

test('returns ok:false when heartbeat age exceeds threshold (> 120s)', async () => {
  const staleDate = new Date(Date.now() - 200000); // 200 seconds ago (> 120s threshold)
  const harness = makeAppWithHeartbeat({ workerId: 'default', lastHeartbeatAt: staleDate });
  try {
    const { body } = await httpGet(harness.app, '/api/worker/health');
    assert.equal(body.ok, false);
    assert.ok(body.ageMs > 120000, `Expected ageMs > 120000, got ${body.ageMs}`);
  } finally {
    harness.teardown();
  }
});

test('returns exact staleAfterMs of 120000', async () => {
  const harness = makeAppWithHeartbeat(null);
  try {
    const { body } = await httpGet(harness.app, '/api/worker/health');
    assert.equal(body.staleAfterMs, 120000);
  } finally {
    harness.teardown();
  }
});

test('response includes lastHeartbeatAt timestamp when heartbeat exists', async () => {
  const heartbeatDate = new Date(Date.now() - 10000);
  const harness = makeAppWithHeartbeat({ workerId: 'default', lastHeartbeatAt: heartbeatDate });
  try {
    const { body } = await httpGet(harness.app, '/api/worker/health');
    assert.ok(body.lastHeartbeatAt, 'lastHeartbeatAt should be present');
    // The returned value should be parseable as a date.
    const parsed = new Date(body.lastHeartbeatAt);
    assert.ok(!isNaN(parsed.getTime()), 'lastHeartbeatAt should be a valid date');
  } finally {
    harness.teardown();
  }
});
