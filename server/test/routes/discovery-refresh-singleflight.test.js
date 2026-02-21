'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
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
    children: [],
    paths: [],
    parent: null,
  };
  return () => {
    delete require.cache[resolvedPath];
  };
}

function requestJson(app, method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const payload = body ? JSON.stringify(body) : '';
      const req = http.request(
        {
          hostname: 'localhost',
          port,
          path: requestPath,
          method,
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => {
            server.close(() => {
              let parsed = {};
              try {
                parsed = raw ? JSON.parse(raw) : {};
              } catch (error) {
                return reject(error);
              }
              return resolve({ status: res.statusCode, body: parsed });
            });
          });
        }
      );
      req.on('error', (error) => server.close(() => reject(error)));
      if (payload) {
        req.write(payload);
      }
      req.end();
    });
    server.on('error', reject);
  });
}

test('POST /api/discovery/:accountSlug/refresh enforces single-flight per slug', async () => {
  let resolveDiscovery = null;
  const discoveryPromise = new Promise((resolve) => {
    resolveDiscovery = resolve;
  });

  const mongooseStub = {
    connection: { readyState: 1 },
    Types: {
      ObjectId: {
        isValid: () => true,
      },
    },
  };

  const jobStub = {
    Job: {
      findOne: () => ({
        sort: () => ({
          lean: async () => ({
            _id: 'sample-job-1',
            tweetUrl: 'https://www.tiktok.com/@creator/video/123',
            accountHandle: '@creator',
            accountDisplayName: 'Creator',
            accountSlug: 'creator',
          }),
        }),
      }),
    },
  };

  const loggerStub = {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };

  const teardowns = [
    injectStub(require.resolve('mongoose'), mongooseStub),
    injectStub(path.join(serverSrc, 'core/models/job.js'), jobStub),
    injectStub(path.join(serverSrc, 'core/data/discovered-post-model.js'), { DiscoveredPost: {} }),
    injectStub(path.join(serverSrc, 'core/lib/logger.js'), loggerStub),
    injectStub(path.join(serverSrc, 'services/profile-discovery-service.js'), {
      triggerProfileDiscovery: () => discoveryPromise,
    }),
  ];

  try {
    delete require.cache[path.join(serverSrc, 'api/routes/discovery.js')];
    const { discoveryRouter } = require('../../src/api/routes/discovery');

    const app = express();
    app.use(express.json());
    app.use('/api/discovery', discoveryRouter);

    const first = await requestJson(app, 'POST', '/api/discovery/creator/refresh');
    assert.equal(first.status, 200);
    assert.equal(first.body.ok, true);

    const second = await requestJson(app, 'POST', '/api/discovery/creator/refresh');
    assert.equal(second.status, 202);
    assert.equal(second.body.ok, true);
    assert.equal(second.body.alreadyRunning, true);

    resolveDiscovery();
    await new Promise((resolve) => setImmediate(resolve));

    const third = await requestJson(app, 'POST', '/api/discovery/creator/refresh');
    assert.equal(third.status, 200);
    assert.equal(third.body.ok, true);
  } finally {
    teardowns.forEach((teardown) => teardown());
    clearModuleCache(serverSrc);
  }
});
