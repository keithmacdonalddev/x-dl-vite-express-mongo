const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runtimeDir = path.resolve(__dirname, '../../src/runtime');

test('runtime modules exist', () => {
  assert.ok(fs.existsSync(path.join(runtimeDir, 'start-api-runtime.js')), 'start-api-runtime.js missing');
  assert.ok(fs.existsSync(path.join(runtimeDir, 'start-worker-runtime.js')), 'start-worker-runtime.js missing');
  assert.ok(fs.existsSync(path.join(runtimeDir, 'register-shutdown.js')), 'register-shutdown.js missing');
});

test('runtime modules export functions', () => {
  const apiRuntime = require('../../src/runtime/start-api-runtime');
  const workerRuntime = require('../../src/runtime/start-worker-runtime');
  const registerShutdown = require('../../src/runtime/register-shutdown');
  assert.equal(typeof apiRuntime.startApiRuntime, 'function');
  assert.equal(typeof workerRuntime.startWorkerRuntime, 'function');
  assert.equal(typeof registerShutdown.registerShutdown, 'function');
});
