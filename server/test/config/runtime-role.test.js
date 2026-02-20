const test = require('node:test');
const assert = require('node:assert/strict');
const { getRuntimeRole, chooseRuntime } = require('../../src/core/config/env');

test('defaults to api role when ROLE is missing', () => {
  assert.equal(getRuntimeRole({}), 'api');
});

test('accepts worker role when ROLE=worker', () => {
  assert.equal(getRuntimeRole({ ROLE: 'worker' }), 'worker');
});

test('chooseRuntime maps to runtime id', () => {
  assert.equal(chooseRuntime({ ROLE: 'worker' }), 'worker');
  assert.equal(chooseRuntime({}), 'api');
  assert.equal(chooseRuntime({ ROLE: 'combined' }), 'combined');
});
