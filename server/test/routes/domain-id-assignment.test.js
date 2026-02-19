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

test('new POST /api/jobs assigns domainId from platform map', async () => {
  const createdPayloads = [];

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
      create: async (doc) => {
        createdPayloads.push(doc);
        return {
          _id: 'job-new-1',
          createdAt: new Date('2026-02-19T00:00:00.000Z'),
          ...doc,
        };
      },
    },
  };

  const loggerStub = {
    logger: {
      info: () => {},
      error: () => {},
    },
  };

  const teardowns = [
    injectStub(require.resolve('mongoose'), mongooseStub),
    injectStub(path.join(serverSrc, 'models/job.js'), jobStub),
    injectStub(path.join(serverSrc, 'lib/logger.js'), loggerStub),
  ];

  try {
    delete require.cache[path.join(serverSrc, 'routes/jobs.js')];
    const { jobsRouter } = require('../../src/routes/jobs');

    const app = express();
    app.use(express.json());
    app.use('/api/jobs', jobsRouter);

    const response = await requestJson(app, 'POST', '/api/jobs', {
      tweetUrl: 'https://x.com/example/status/1234567890',
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.job.domainId, 'platform-x');
    assert.equal(createdPayloads[0].domainId, 'platform-x');
  } finally {
    teardowns.forEach((teardown) => teardown());
    clearModuleCache(serverSrc);
  }
});

test('retry path preserves or deterministically reassigns domainId', async () => {
  const createdPayloads = [];
  const originals = {
    preserve: {
      _id: 'preserve',
      tweetUrl: 'https://www.tiktok.com/@creator/video/1234567890123456789',
      domainId: 'platform-tiktok',
      metadata: { a: 1 },
      imageUrls: [],
    },
    reassign: {
      _id: 'reassign',
      tweetUrl: 'https://x.com/creator/status/987654321',
      domainId: '',
      metadata: {},
      imageUrls: [],
    },
  };

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
      findById: (id) => ({
        lean: async () => originals[id] || null,
      }),
      create: async (doc) => {
        createdPayloads.push(doc);
        return {
          _id: `retry-${createdPayloads.length}`,
          createdAt: new Date('2026-02-19T00:00:00.000Z'),
          ...doc,
        };
      },
    },
  };

  const loggerStub = {
    logger: {
      info: () => {},
      error: () => {},
    },
  };

  const teardowns = [
    injectStub(require.resolve('mongoose'), mongooseStub),
    injectStub(path.join(serverSrc, 'models/job.js'), jobStub),
    injectStub(path.join(serverSrc, 'lib/logger.js'), loggerStub),
  ];

  try {
    delete require.cache[path.join(serverSrc, 'routes/retry.js')];
    const { retryRouter } = require('../../src/routes/retry');

    const app = express();
    app.use(express.json());
    app.use('/api/jobs', retryRouter);

    const mediaUrl = 'https://cdn.example.com/video.mp4';

    const preserveResponse = await requestJson(
      app,
      'POST',
      '/api/jobs/preserve/manual-retry',
      { mediaUrl }
    );
    assert.equal(preserveResponse.status, 201);

    const reassignResponse = await requestJson(
      app,
      'POST',
      '/api/jobs/reassign/manual-retry',
      { mediaUrl }
    );
    assert.equal(reassignResponse.status, 201);

    assert.equal(createdPayloads[0].domainId, 'platform-tiktok');
    assert.equal(createdPayloads[1].domainId, 'platform-x');
  } finally {
    teardowns.forEach((teardown) => teardown());
    clearModuleCache(serverSrc);
  }
});

test('status mutation repairs missing domainId deterministically', async () => {
  const mutableJob = {
    _id: 'status-repair',
    tweetUrl: 'https://x.com/example/status/1234567890',
    status: 'queued',
    domainId: '',
    save: async () => {},
    toObject() {
      return {
        _id: this._id,
        tweetUrl: this.tweetUrl,
        status: this.status,
        domainId: this.domainId,
      };
    },
  };

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
      findById: async () => mutableJob,
    },
  };

  const loggerStub = {
    logger: {
      info: () => {},
      error: () => {},
    },
  };

  const teardowns = [
    injectStub(require.resolve('mongoose'), mongooseStub),
    injectStub(path.join(serverSrc, 'models/job.js'), jobStub),
    injectStub(path.join(serverSrc, 'lib/logger.js'), loggerStub),
  ];

  try {
    delete require.cache[path.join(serverSrc, 'routes/status.js')];
    const { statusRouter } = require('../../src/routes/status');

    const app = express();
    app.use(express.json());
    app.use('/api/jobs', statusRouter);

    const response = await requestJson(app, 'PATCH', '/api/jobs/status-repair/status', {
      status: 'running',
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.job.domainId, 'platform-x');
    assert.equal(mutableJob.domainId, 'platform-x');
  } finally {
    teardowns.forEach((teardown) => teardown());
    clearModuleCache(serverSrc);
  }
});
