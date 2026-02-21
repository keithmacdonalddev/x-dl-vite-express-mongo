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

test('POST /api/jobs blocks active duplicate URL before create', async () => {
  let createCalls = 0;

  const mongooseStub = {
    connection: { readyState: 1 },
    Types: {
      ObjectId: {
        isValid: () => true,
      },
    },
  };

  const existingJob = {
    _id: 'existing-active-job-1',
    status: 'running',
  };

  const jobStub = {
    Job: {
      findOne: () => ({
        sort: () => ({
          lean: async () => existingJob,
        }),
      }),
      create: async () => {
        createCalls += 1;
        return {
          _id: 'new-job-should-not-exist',
          status: 'queued',
          createdAt: new Date(),
        };
      },
    },
  };

  const loggerStub = {
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
    },
  };

  const teardowns = [
    injectStub(require.resolve('mongoose'), mongooseStub),
    injectStub(path.join(serverSrc, 'core/models/job.js'), jobStub),
    injectStub(path.join(serverSrc, 'core/lib/logger.js'), loggerStub),
  ];

  try {
    delete require.cache[path.join(serverSrc, 'api/routes/jobs.js')];
    const { jobsRouter } = require('../../src/api/routes/jobs');

    const app = express();
    app.use(express.json());
    app.use('/api/jobs', jobsRouter);

    const response = await requestJson(app, 'POST', '/api/jobs', {
      tweetUrl: 'https://www.tiktok.com/@creator/video/7601673687430991122',
    });

    assert.equal(response.status, 409);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.code, 'DUPLICATE_ACTIVE_JOB');
    assert.equal(response.body.existingJobId, 'existing-active-job-1');
    assert.equal(response.body.existingJobStatus, 'running');
    assert.equal(createCalls, 0);
  } finally {
    teardowns.forEach((teardown) => teardown());
    clearModuleCache(serverSrc);
  }
});

test('POST /api/jobs blocks completed duplicate URL before create', async () => {
  let createCalls = 0;

  const mongooseStub = {
    connection: { readyState: 1 },
    Types: {
      ObjectId: {
        isValid: () => true,
      },
    },
  };

  const existingJob = {
    _id: 'existing-completed-job-1',
    status: 'completed',
  };

  const jobStub = {
    Job: {
      findOne: () => ({
        sort: () => ({
          lean: async () => existingJob,
        }),
      }),
      create: async () => {
        createCalls += 1;
        return {
          _id: 'new-job-should-not-exist',
          status: 'queued',
          createdAt: new Date(),
        };
      },
    },
  };

  const loggerStub = {
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
    },
  };

  const teardowns = [
    injectStub(require.resolve('mongoose'), mongooseStub),
    injectStub(path.join(serverSrc, 'core/models/job.js'), jobStub),
    injectStub(path.join(serverSrc, 'core/lib/logger.js'), loggerStub),
  ];

  try {
    delete require.cache[path.join(serverSrc, 'api/routes/jobs.js')];
    const { jobsRouter } = require('../../src/api/routes/jobs');

    const app = express();
    app.use(express.json());
    app.use('/api/jobs', jobsRouter);

    const response = await requestJson(app, 'POST', '/api/jobs', {
      tweetUrl: 'https://www.tiktok.com/@creator/video/7601673687430991122',
    });

    assert.equal(response.status, 409);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.code, 'DUPLICATE_COMPLETED_JOB');
    assert.equal(response.body.existingJobId, 'existing-completed-job-1');
    assert.equal(response.body.existingJobStatus, 'completed');
    assert.equal(createCalls, 0);
  } finally {
    teardowns.forEach((teardown) => teardown());
    clearModuleCache(serverSrc);
  }
});

test('POST /api/jobs resolves E11000 race with deterministic duplicate response', async () => {
  let createCalls = 0;
  let findOneCalls = 0;

  const mongooseStub = {
    connection: { readyState: 1 },
    Types: {
      ObjectId: {
        isValid: () => true,
      },
    },
  };

  const racedJob = {
    _id: 'job-raced-completed-1',
    status: 'completed',
  };

  const jobStub = {
    Job: {
      findOne: () => ({
        sort: () => ({
          lean: async () => {
            findOneCalls += 1;
            if (findOneCalls === 1) return null;
            return racedJob;
          },
        }),
      }),
      create: async () => {
        createCalls += 1;
        const err = new Error('duplicate key');
        err.code = 11000;
        throw err;
      },
    },
  };

  const loggerStub = {
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
    },
  };

  const teardowns = [
    injectStub(require.resolve('mongoose'), mongooseStub),
    injectStub(path.join(serverSrc, 'core/models/job.js'), jobStub),
    injectStub(path.join(serverSrc, 'core/lib/logger.js'), loggerStub),
  ];

  try {
    delete require.cache[path.join(serverSrc, 'api/routes/jobs.js')];
    const { jobsRouter } = require('../../src/api/routes/jobs');

    const app = express();
    app.use(express.json());
    app.use('/api/jobs', jobsRouter);

    const response = await requestJson(app, 'POST', '/api/jobs', {
      tweetUrl: 'https://www.tiktok.com/@creator/video/7601673687430991122',
    });

    assert.equal(response.status, 409);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.code, 'DUPLICATE_COMPLETED_JOB');
    assert.equal(response.body.existingJobId, 'job-raced-completed-1');
    assert.equal(response.body.existingJobStatus, 'completed');
    assert.equal(createCalls, 1);
  } finally {
    teardowns.forEach((teardown) => teardown());
    clearModuleCache(serverSrc);
  }
});
