const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.resolve(__dirname, '../..');

test('start-api.js exists', () => {
  assert.ok(fs.existsSync(path.join(serverRoot, 'src/start-api.js')), 'start-api.js missing');
});

test('start-worker.js exists', () => {
  assert.ok(fs.existsSync(path.join(serverRoot, 'src/start-worker.js')), 'start-worker.js missing');
});

test('server package.json has split scripts', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['dev:api'], 'missing dev:api');
  assert.ok(pkg.scripts['dev:worker'], 'missing dev:worker');
  assert.ok(pkg.scripts['start:api'], 'missing start:api');
  assert.ok(pkg.scripts['start:worker'], 'missing start:worker');
});
