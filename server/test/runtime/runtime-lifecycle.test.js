/**
 * Behavioural tests for the runtime lifecycle modules.
 *
 * Strategy: inject stubs into the require cache BEFORE requiring the module
 * under test, then reset the cache afterwards so tests are isolated.
 *
 * No third-party test-doubles library is used — only node:test + node:assert.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Delete all require-cache entries whose resolved path starts with `prefix`.
 * Pass the absolute server/src directory prefix to wipe all local modules.
 */
function clearModuleCache(prefix) {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(prefix)) {
      delete require.cache[key];
    }
  }
}

/**
 * Inject `stub` into the require cache under `resolvedPath`.
 * Returns a teardown function that removes the entry.
 */
function injectStub(resolvedPath, stub) {
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports: stub,
    children: [],
    paths: [],
    parent: null,
  };
  return () => {
    delete require.cache[resolvedPath];
  };
}

const path = require('node:path');
const serverSrc = path.resolve(__dirname, '../../src');

// ─── Worker: mongoose.connect called BEFORE startQueueWorker ────────────────

test('worker runtime: mongoose.connect is awaited before startQueueWorker', async () => {
  const callOrder = [];

  // --- Build stubs ---

  // mongoose stub: connect resolves immediately, tracks call order
  const mongooseStub = {
    connect: async (_uri) => {
      callOrder.push('mongoose.connect');
    },
    connection: { readyState: 1 },
    disconnect: async () => {},
  };

  // queue stub: startQueueWorker / stopQueueWorker
  const queueStub = {
    startQueueWorker: (_opts) => {
      callOrder.push('startQueueWorker');
    },
    stopQueueWorker: () => {},
  };

  // Minimal stubs for transitive deps so the module loads cleanly
  const processJobStub = { processOneCycle: async () => {} };
  const recoveryStub = { recoverStaleJobs: async () => 0 };
  const playwrightAdapterStub = { closePersistentContext: async () => {} };
  const registerShutdownStub = { registerShutdown: (_fn) => {} };
  const envStub = {
    getServerConfig: () => ({ mongoUri: 'mongodb://test', port: 4000 }),
    getRuntimeRole: () => 'worker',
    chooseRuntime: () => 'worker',
  };

  // Inject stubs into require cache
  const teardowns = [
    injectStub(require.resolve('mongoose'), mongooseStub),
    injectStub(path.join(serverSrc, 'worker/queue.js'), queueStub),
    injectStub(path.join(serverSrc, 'worker/process-job.js'), processJobStub),
    injectStub(path.join(serverSrc, 'worker/recovery.js'), recoveryStub),
    injectStub(path.join(serverSrc, 'services/playwright-adapter.js'), playwrightAdapterStub),
    injectStub(path.join(serverSrc, 'core/runtime/register-shutdown.js'), registerShutdownStub),
    injectStub(path.join(serverSrc, 'core/config/env.js'), envStub),
  ];

  try {
    // Remove any previously cached version of the module under test
    delete require.cache[path.join(serverSrc, 'core/runtime/start-worker-runtime.js')];

    const { startWorkerRuntime } = require('../../src/core/runtime/start-worker-runtime');
    await startWorkerRuntime();

    assert.deepEqual(callOrder, ['mongoose.connect', 'startQueueWorker'],
      `Expected ['mongoose.connect', 'startQueueWorker'] but got ${JSON.stringify(callOrder)}`);
  } finally {
    teardowns.forEach((td) => td());
    clearModuleCache(serverSrc);
  }
});

// ─── Worker: exits non-zero when MONGODB_URI missing ────────────────────────

test('worker runtime: process.exit(1) when MONGODB_URI is missing', async () => {
  let exitCode = null;
  const originalExit = process.exit;

  // Intercept process.exit so the test does not actually terminate
  process.exit = (code) => {
    exitCode = code;
    throw new Error(`process.exit(${code})`); // unwind execution
  };

  const registerShutdownStub = { registerShutdown: (_fn) => {} };
  const envStub = {
    getServerConfig: () => ({ mongoUri: '', port: 4000 }),
    getRuntimeRole: () => 'worker',
    chooseRuntime: () => 'worker',
  };

  // Minimal stubs — mongoose should never be reached
  const mongooseStub = {
    connect: async () => { throw new Error('should not call connect'); },
    connection: { readyState: 0 },
    disconnect: async () => {},
  };
  const queueStub = { startQueueWorker: () => {}, stopQueueWorker: () => {} };
  const processJobStub = { processOneCycle: async () => {} };
  const recoveryStub = { recoverStaleJobs: async () => 0 };
  const playwrightAdapterStub = { closePersistentContext: async () => {} };

  const teardowns = [
    injectStub(require.resolve('mongoose'), mongooseStub),
    injectStub(path.join(serverSrc, 'worker/queue.js'), queueStub),
    injectStub(path.join(serverSrc, 'worker/process-job.js'), processJobStub),
    injectStub(path.join(serverSrc, 'worker/recovery.js'), recoveryStub),
    injectStub(path.join(serverSrc, 'services/playwright-adapter.js'), playwrightAdapterStub),
    injectStub(path.join(serverSrc, 'core/runtime/register-shutdown.js'), registerShutdownStub),
    injectStub(path.join(serverSrc, 'core/config/env.js'), envStub),
  ];

  try {
    delete require.cache[path.join(serverSrc, 'core/runtime/start-worker-runtime.js')];
    const { startWorkerRuntime } = require('../../src/core/runtime/start-worker-runtime');

    await assert.rejects(
      () => startWorkerRuntime(),
      /process\.exit\(1\)/,
      'Expected startWorkerRuntime to call process.exit(1) when mongoUri is empty'
    );

    assert.equal(exitCode, 1, `Expected exit code 1, got ${exitCode}`);
  } finally {
    process.exit = originalExit;
    teardowns.forEach((td) => td());
    clearModuleCache(serverSrc);
  }
});

// ─── API: does NOT call startQueueWorker ────────────────────────────────────

test('api runtime: startQueueWorker is never called', async () => {
  let queueStarted = false;

  const queueStub = {
    startQueueWorker: () => {
      queueStarted = true;
    },
    stopQueueWorker: () => {},
  };

  // Minimal net.Server stub so app.listen() completes without binding a real port
  const mockServer = {
    close: (cb) => { if (cb) cb(); },
  };

  const appStub = {
    app: {
      listen: (_port, cb) => {
        if (cb) cb();
        return mockServer;
      },
    },
  };

  const mongooseStub = {
    connect: async () => {},
    connection: { readyState: 1 },
    disconnect: async () => {},
  };

  const registerShutdownStub = { registerShutdown: (_fn) => {} };
  const envStub = {
    getServerConfig: () => ({ mongoUri: 'mongodb://test', port: 14000 }),
    getRuntimeRole: () => 'api',
    chooseRuntime: () => 'api',
  };

  const teardowns = [
    injectStub(require.resolve('mongoose'), mongooseStub),
    injectStub(path.join(serverSrc, 'worker/queue.js'), queueStub),
    injectStub(path.join(serverSrc, 'core/runtime/entrypoints/app.js'), appStub),
    injectStub(path.join(serverSrc, 'core/runtime/register-shutdown.js'), registerShutdownStub),
    injectStub(path.join(serverSrc, 'core/config/env.js'), envStub),
  ];

  try {
    delete require.cache[path.join(serverSrc, 'core/runtime/start-api-runtime.js')];
    const { startApiRuntime } = require('../../src/core/runtime/start-api-runtime');
    await startApiRuntime();

    assert.equal(queueStarted, false, 'startQueueWorker must NOT be called by API runtime');
  } finally {
    teardowns.forEach((td) => td());
    clearModuleCache(serverSrc);
  }
});

// ─── Worker: startQueueWorker IS called ─────────────────────────────────────

test('worker runtime: startQueueWorker is called', async () => {
  let queueStarted = false;

  const mongooseStub = {
    connect: async () => {},
    connection: { readyState: 1 },
    disconnect: async () => {},
  };

  const queueStub = {
    startQueueWorker: () => { queueStarted = true; },
    stopQueueWorker: () => {},
  };

  const processJobStub = { processOneCycle: async () => {} };
  const recoveryStub = { recoverStaleJobs: async () => 0 };
  const playwrightAdapterStub = { closePersistentContext: async () => {} };
  const registerShutdownStub = { registerShutdown: (_fn) => {} };
  const envStub = {
    getServerConfig: () => ({ mongoUri: 'mongodb://test', port: 4000 }),
    getRuntimeRole: () => 'worker',
    chooseRuntime: () => 'worker',
  };

  const teardowns = [
    injectStub(require.resolve('mongoose'), mongooseStub),
    injectStub(path.join(serverSrc, 'worker/queue.js'), queueStub),
    injectStub(path.join(serverSrc, 'worker/process-job.js'), processJobStub),
    injectStub(path.join(serverSrc, 'worker/recovery.js'), recoveryStub),
    injectStub(path.join(serverSrc, 'services/playwright-adapter.js'), playwrightAdapterStub),
    injectStub(path.join(serverSrc, 'core/runtime/register-shutdown.js'), registerShutdownStub),
    injectStub(path.join(serverSrc, 'core/config/env.js'), envStub),
  ];

  try {
    delete require.cache[path.join(serverSrc, 'core/runtime/start-worker-runtime.js')];
    const { startWorkerRuntime } = require('../../src/core/runtime/start-worker-runtime');
    await startWorkerRuntime();

    assert.equal(queueStarted, true, 'startQueueWorker must be called by worker runtime');
  } finally {
    teardowns.forEach((td) => td());
    clearModuleCache(serverSrc);
  }
});
