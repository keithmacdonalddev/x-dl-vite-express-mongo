'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('legacy model path re-exports core job model', () => {
  const legacy = require('../../src/models/job');
  const core = require('../../src/core/data/job-model');

  assert.equal(legacy.Job, core.Job);
  assert.deepEqual(legacy.JOB_STATUSES, core.JOB_STATUSES);
});

test('legacy constants path re-exports core job-status constants', () => {
  const legacy = require('../../src/constants/job-status');
  const core = require('../../src/core/data/job-status');

  assert.deepEqual(legacy.JOB_STATUSES, core.JOB_STATUSES);
  assert.deepEqual(legacy.SOURCE_TYPES, core.SOURCE_TYPES);
});

test('legacy domain transitions path re-exports core transitions', () => {
  const legacy = require('../../src/domain/job-transitions');
  const core = require('../../src/core/domain/job-transitions');

  assert.equal(legacy.canTransition, core.canTransition);
});

test('legacy middleware request-limits path re-exports core implementation', () => {
  const legacy = require('../../src/middleware/request-limits');
  const core = require('../../src/core/http/request-limits');

  assert.equal(legacy.createCorsOptions, core.createCorsOptions);
  assert.equal(legacy.enforceTweetUrlLength, core.enforceTweetUrlLength);
});

test('legacy platform registry path re-exports core registry', () => {
  const legacy = require('../../src/platforms/registry');
  const core = require('../../src/core/platforms/registry');

  assert.equal(legacy.resolvePlatform, core.resolvePlatform);
  assert.equal(legacy.platformNeeds403Refresh, core.platformNeeds403Refresh);
});
