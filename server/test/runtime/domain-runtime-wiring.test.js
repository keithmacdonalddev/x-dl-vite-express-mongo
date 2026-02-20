'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

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
    children: [],
    paths: [],
    parent: null,
  };
  return () => {
    delete require.cache[resolvedPath];
  };
}

test('api runtime: ENABLE_DOMAIN_KERNEL=false keeps legacy startup path', async () => {
  let domainLoaderCalled = false;

  const mongooseStub = {
    connect: async () => {},
    connection: { readyState: 1 },
    disconnect: async () => {},
  };

  const appStub = {
    app: {
      listen: (_port, cb) => {
        if (cb) cb();
        return { close: (closeCb) => { if (closeCb) closeCb(); } };
      },
    },
  };

  const envStub = {
    getServerConfig: () => ({ mongoUri: 'mongodb://test', port: 14011 }),
    isDomainKernelEnabled: () => false,
    isStrictPluginStartup: () => false,
  };

  const loadDomainsStub = {
    loadDomainsForRuntime: async () => {
      domainLoaderCalled = true;
      return { stopAll: async () => {} };
    },
  };

  const registerShutdownStub = {
    registerShutdown: () => {},
  };

  const domainContextStub = {
    createDomainContext: () => ({}),
  };

  const teardowns = [
    injectStub(require.resolve('mongoose'), mongooseStub),
    injectStub(path.join(serverSrc, 'core/runtime/entrypoints/app.js'), appStub),
    injectStub(path.join(serverSrc, 'core/config/env.js'), envStub),
    injectStub(path.join(serverSrc, 'core/runtime/load-domains.js'), loadDomainsStub),
    injectStub(path.join(serverSrc, 'core/runtime/domain-context.js'), domainContextStub),
    injectStub(path.join(serverSrc, 'core/runtime/register-shutdown.js'), registerShutdownStub),
  ];

  try {
    delete require.cache[path.join(serverSrc, 'core/runtime/start-api-runtime.js')];
    const { startApiRuntime } = require('../../src/core/runtime/start-api-runtime');
    await startApiRuntime();

    assert.equal(domainLoaderCalled, false);
  } finally {
    teardowns.forEach((teardown) => teardown());
    clearModuleCache(serverSrc);
  }
});

test('domain loader: start-time role filtering skips non-matching domains with warning log', async () => {
  const calls = [];
  const warnings = [];
  const log = {
    warn: (message) => warnings.push(String(message)),
    info: () => {},
  };

  const { loadDomainsForRuntime } = require('../../src/core/runtime/load-domains');

  const domainModules = [
    {
      id: 'jobs',
      runtimeTargets: ['api'],
      mountRoutes: () => calls.push('jobs.mountRoutes'),
      stopWorker: async () => calls.push('jobs.stopWorker'),
    },
    {
      id: 'worker-health',
      runtimeTargets: ['worker'],
      mountRoutes: () => calls.push('worker-health.mountRoutes'),
      stopWorker: async () => calls.push('worker-health.stopWorker'),
    },
    {
      id: 'capabilities',
      runtimeTargets: ['both'],
      mountRoutes: () => calls.push('capabilities.mountRoutes'),
      stopWorker: async () => calls.push('capabilities.stopWorker'),
    },
  ];

  const runtime = await loadDomainsForRuntime({
    role: 'api',
    ctx: {},
    strict: false,
    domainModules,
    log,
  });

  assert.deepEqual(calls, ['jobs.mountRoutes', 'capabilities.mountRoutes']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /worker-health/);

  await runtime.stopAll();
  assert.deepEqual(calls, [
    'jobs.mountRoutes',
    'capabilities.mountRoutes',
    'jobs.stopWorker',
    'capabilities.stopWorker',
  ]);
});

test('api runtime cleanup order is domains -> http -> mongo', async () => {
  const callOrder = [];
  let cleanupFn = null;

  const mongooseStub = {
    connect: async () => {},
    connection: { readyState: 1 },
    disconnect: async () => { callOrder.push('mongo.disconnect'); },
  };

  const appStub = {
    app: {
      listen: (_port, cb) => {
        if (cb) cb();
        return {
          close: (closeCb) => {
            callOrder.push('http.close');
            if (closeCb) closeCb();
          },
        };
      },
    },
  };

  const envStub = {
    getServerConfig: () => ({ mongoUri: 'mongodb://test', port: 14012 }),
    isDomainKernelEnabled: () => true,
    isStrictPluginStartup: () => false,
  };

  const loadDomainsStub = {
    loadDomainsForRuntime: async () => ({
      stopAll: async () => {
        callOrder.push('domains.stopAll');
      },
    }),
  };

  const domainContextStub = {
    createDomainContext: () => ({}),
  };

  const registerShutdownStub = {
    registerShutdown: (cleanup) => {
      cleanupFn = cleanup;
    },
  };

  const teardowns = [
    injectStub(require.resolve('mongoose'), mongooseStub),
    injectStub(path.join(serverSrc, 'core/runtime/entrypoints/app.js'), appStub),
    injectStub(path.join(serverSrc, 'core/config/env.js'), envStub),
    injectStub(path.join(serverSrc, 'core/runtime/load-domains.js'), loadDomainsStub),
    injectStub(path.join(serverSrc, 'core/runtime/domain-context.js'), domainContextStub),
    injectStub(path.join(serverSrc, 'core/runtime/register-shutdown.js'), registerShutdownStub),
  ];

  try {
    delete require.cache[path.join(serverSrc, 'core/runtime/start-api-runtime.js')];
    const { startApiRuntime } = require('../../src/core/runtime/start-api-runtime');
    await startApiRuntime();

    assert.equal(typeof cleanupFn, 'function');
    await cleanupFn();

    assert.deepEqual(callOrder, ['domains.stopAll', 'http.close', 'mongo.disconnect']);
  } finally {
    teardowns.forEach((teardown) => teardown());
    clearModuleCache(serverSrc);
  }
});
