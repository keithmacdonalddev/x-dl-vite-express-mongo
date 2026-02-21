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

function makeMongooseStub() {
  return {
    connection: { readyState: 1 },
    Types: {
      ObjectId: {
        isValid: () => true,
      },
    },
  };
}

function makeLoggerStub() {
  return {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
}

test('POST /api/discovery/:id/download reuses existing active job by canonicalUrl', async () => {
  const postDoc = {
    _id: 'post-1',
    postUrl: 'https://www.tiktok.com/@creator/video/123',
    canonicalUrl: 'https://www.tiktok.com/@creator/video/123',
    accountPlatform: 'tiktok',
    accountHandle: '@creator',
    accountSlug: 'creator',
    downloadedJobId: null,
  };
  const existingJob = {
    _id: 'job-existing-1',
    tweetUrl: postDoc.postUrl,
    canonicalUrl: postDoc.canonicalUrl,
    status: 'running',
  };

  const linkedJobIds = [];
  let createCalls = 0;

  const discoveredPostStub = {
    DiscoveredPost: {
      findById: () => ({
        lean: async () => postDoc,
      }),
      findByIdAndUpdate: async (_id, update) => {
        linkedJobIds.push(String(update.downloadedJobId));
        return { ...postDoc, downloadedJobId: update.downloadedJobId };
      },
    },
  };

  const jobStub = {
    Job: {
      findById: () => ({
        lean: async () => null,
      }),
      findOne: () => ({
        lean: async () => existingJob,
      }),
      create: async () => {
        createCalls += 1;
        return null;
      },
    },
  };

  const teardowns = [
    injectStub(require.resolve('mongoose'), makeMongooseStub()),
    injectStub(path.join(serverSrc, 'core/models/job.js'), jobStub),
    injectStub(path.join(serverSrc, 'core/data/discovered-post-model.js'), discoveredPostStub),
    injectStub(path.join(serverSrc, 'core/lib/logger.js'), makeLoggerStub()),
    injectStub(path.join(serverSrc, 'services/profile-discovery-service.js'), { triggerProfileDiscovery: async () => {} }),
  ];

  try {
    delete require.cache[path.join(serverSrc, 'api/routes/discovery.js')];
    const { discoveryRouter } = require('../../src/api/routes/discovery');

    const app = express();
    app.use(express.json());
    app.use('/api/discovery', discoveryRouter);

    const response = await requestJson(app, 'POST', '/api/discovery/post-1/download');
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.alreadyExists, true);
    assert.equal(response.body.job._id, 'job-existing-1');
    assert.deepEqual(linkedJobIds, ['job-existing-1']);
    assert.equal(createCalls, 0);
  } finally {
    teardowns.forEach((teardown) => teardown());
    clearModuleCache(serverSrc);
  }
});

test('POST /api/discovery/:id/download resolves concurrent create race via E11000 path', async () => {
  const postDoc = {
    _id: 'post-2',
    postUrl: 'https://www.tiktok.com/@creator/video/456',
    canonicalUrl: 'https://www.tiktok.com/@creator/video/456',
    accountPlatform: 'tiktok',
    accountHandle: '@creator',
    accountSlug: 'creator',
    downloadedJobId: null,
  };
  const racedJob = {
    _id: 'job-race-1',
    tweetUrl: postDoc.postUrl,
    canonicalUrl: postDoc.canonicalUrl,
    status: 'queued',
  };

  const linkedJobIds = [];
  let createCalls = 0;
  let findOneCalls = 0;
  let firstCreateStarted = false;

  const discoveredPostStub = {
    DiscoveredPost: {
      findById: () => ({
        lean: async () => postDoc,
      }),
      findByIdAndUpdate: async (_id, update) => {
        linkedJobIds.push(String(update.downloadedJobId));
        return { ...postDoc, downloadedJobId: update.downloadedJobId };
      },
    },
  };

  const jobStub = {
    Job: {
      findById: () => ({
        lean: async () => null,
      }),
      findOne: () => ({
        lean: async () => {
          findOneCalls += 1;
          if (findOneCalls <= 2) return null;
          return firstCreateStarted ? racedJob : null;
        },
      }),
      create: async () => {
        createCalls += 1;
        if (createCalls === 1) {
          firstCreateStarted = true;
          await new Promise((resolve) => setTimeout(resolve, 25));
          return racedJob;
        }
        const err = new Error('duplicate key');
        err.code = 11000;
        throw err;
      },
    },
  };

  const teardowns = [
    injectStub(require.resolve('mongoose'), makeMongooseStub()),
    injectStub(path.join(serverSrc, 'core/models/job.js'), jobStub),
    injectStub(path.join(serverSrc, 'core/data/discovered-post-model.js'), discoveredPostStub),
    injectStub(path.join(serverSrc, 'core/lib/logger.js'), makeLoggerStub()),
    injectStub(path.join(serverSrc, 'services/profile-discovery-service.js'), { triggerProfileDiscovery: async () => {} }),
  ];

  try {
    delete require.cache[path.join(serverSrc, 'api/routes/discovery.js')];
    const { discoveryRouter } = require('../../src/api/routes/discovery');

    const app = express();
    app.use(express.json());
    app.use('/api/discovery', discoveryRouter);

    const [first, second] = await Promise.all([
      requestJson(app, 'POST', '/api/discovery/post-2/download'),
      requestJson(app, 'POST', '/api/discovery/post-2/download'),
    ]);

    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [200, 201]);

    const winner = first.status === 201 ? first : second;
    const deduped = first.status === 200 ? first : second;

    assert.equal(winner.body.ok, true);
    assert.equal(winner.body.job._id, 'job-race-1');
    assert.equal(deduped.body.ok, true);
    assert.equal(deduped.body.alreadyExists, true);
    assert.equal(deduped.body.job._id, 'job-race-1');
    assert.equal(createCalls, 2);
    assert.ok(linkedJobIds.every((id) => id === 'job-race-1'));
  } finally {
    teardowns.forEach((teardown) => teardown());
    clearModuleCache(serverSrc);
  }
});
