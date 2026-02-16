const test = require('node:test');
const assert = require('node:assert/strict');

test('queued job can transition to running but not completed directly', () => {
  const { canTransition } = require('../src/domain/job-transitions');

  assert.equal(canTransition('queued', 'running'), true);
  assert.equal(canTransition('queued', 'completed'), false);
});
