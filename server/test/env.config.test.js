const test = require('node:test');
const assert = require('node:assert/strict');

test('getServerConfig returns defaults when optional vars are missing', () => {
  const { getServerConfig } = require('../src/config/env');
  const cfg = getServerConfig({ PORT: '', MONGODB_URI: '' });
  assert.equal(cfg.port, 4000);
  assert.equal(cfg.mongoUri, '');
});

test('getServerConfig accepts MONGO_URI fallback variable', () => {
  const { getServerConfig } = require('../src/config/env');
  const cfg = getServerConfig({ PORT: '5000', MONGO_URI: 'mongodb://localhost:27017/testdb' });
  assert.equal(cfg.port, 5000);
  assert.equal(cfg.mongoUri, 'mongodb://localhost:27017/testdb');
});
