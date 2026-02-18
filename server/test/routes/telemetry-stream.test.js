'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Ensure memory sink for all tests.
process.env.TELEMETRY_SINK = 'memory';

test('GET /api/telemetry returns ok:true with events array', async () => {
  // Clear module caches to get fresh state.
  const modulesToClear = [
    '../../src/lib/telemetry',
    '../../src/lib/logger',
    '../../src/app',
  ];
  for (const m of modulesToClear) {
    try {
      delete require.cache[require.resolve(m)];
    } catch (_) {}
  }

  const { app } = require('../../src/app');

  // Publish a test event directly via telemetry module.
  const { publishTelemetry } = require('../../src/lib/telemetry');
  publishTelemetry('stream.test.event', { level: 'info', jobId: 'stream-test-job' });

  // Make a simple in-process request using node's http module.
  const http = require('node:http');
  const server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.listen(0, () => {
      const port = server.address().port;
      const req = http.get(`http://localhost:${port}/api/telemetry?jobId=stream-test-job`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            assert.equal(parsed.ok, true);
            assert.ok(Array.isArray(parsed.events));
            assert.ok(parsed.events.length >= 1);
            assert.equal(parsed.events[parsed.events.length - 1].jobId, 'stream-test-job');
            server.close(resolve);
          } catch (err) {
            server.close(() => reject(err));
          }
        });
      });
      req.on('error', (err) => server.close(() => reject(err)));
    });
    server.on('error', reject);
  });
});

test('GET /api/telemetry?excludeNoise=true excludes http.request.* events', async () => {
  const modulesToClear = [
    '../../src/lib/telemetry',
    '../../src/lib/logger',
    '../../src/app',
  ];
  for (const m of modulesToClear) {
    try {
      delete require.cache[require.resolve(m)];
    } catch (_) {}
  }

  const { app } = require('../../src/app');
  const { publishTelemetry } = require('../../src/lib/telemetry');
  publishTelemetry('http.request.started', { level: 'info', traceId: 'noise-trace-2' });
  publishTelemetry('job.completed', { level: 'info', traceId: 'noise-trace-2' });

  const http = require('node:http');
  const server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.listen(0, () => {
      const port = server.address().port;
      const req = http.get(`http://localhost:${port}/api/telemetry?traceId=noise-trace-2&excludeNoise=true`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            assert.equal(parsed.ok, true);
            // Noise events should never appear in history (they're filtered at write time).
            assert.ok(
              parsed.events.every((e) => !e.event.startsWith('http.request.')),
              'No http.request.* events should be returned'
            );
            server.close(resolve);
          } catch (err) {
            server.close(() => reject(err));
          }
        });
      });
      req.on('error', (err) => server.close(() => reject(err)));
    });
    server.on('error', reject);
  });
});

test('GET /api/telemetry/stream responds with SSE headers', async () => {
  const modulesToClear = [
    '../../src/lib/telemetry',
    '../../src/lib/logger',
    '../../src/app',
  ];
  for (const m of modulesToClear) {
    try {
      delete require.cache[require.resolve(m)];
    } catch (_) {}
  }

  const { app } = require('../../src/app');
  const http = require('node:http');
  const server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.listen(0, () => {
      const port = server.address().port;
      const req = http.get(`http://localhost:${port}/api/telemetry/stream`, (res) => {
        try {
          assert.equal(res.headers['content-type'], 'text/event-stream');
          assert.ok(res.headers['cache-control'].includes('no-cache'));
          // Destroy the response — we only needed headers.
          res.destroy();
          server.close(resolve);
        } catch (err) {
          res.destroy();
          server.close(() => reject(err));
        }
      });
      req.on('error', () => {}); // Suppress ECONNRESET from destroy.
    });
    server.on('error', reject);
  });
});
