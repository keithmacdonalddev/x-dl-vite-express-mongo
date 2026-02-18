'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(serverRoot, '..');

// ─── Entrypoint files exist ──────────────────────────────────────────────────

test('start-api.js exists', () => {
  assert.ok(
    fs.existsSync(path.join(serverRoot, 'src/start-api.js')),
    'src/start-api.js missing — dedicated API entrypoint required'
  );
});

test('start-worker.js exists', () => {
  assert.ok(
    fs.existsSync(path.join(serverRoot, 'src/start-worker.js')),
    'src/start-worker.js missing — dedicated worker entrypoint required'
  );
});

// ─── Server package.json: split scripts present ──────────────────────────────

test('server package.json has dev:api script', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['dev:api'], 'server package.json missing dev:api script');
});

test('server package.json has dev:worker script', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['dev:worker'], 'server package.json missing dev:worker script');
});

test('server package.json has start:api script', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['start:api'], 'server package.json missing start:api script');
});

test('server package.json has start:worker script', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['start:worker'], 'server package.json missing start:worker script');
});

// ─── Server package.json: script targets correct entrypoints ─────────────────

test('server dev:api script references start-api.js', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
  assert.ok(
    pkg.scripts['dev:api'].includes('start-api.js'),
    `dev:api script should reference start-api.js, got: ${pkg.scripts['dev:api']}`
  );
});

test('server dev:worker script references start-worker.js', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
  assert.ok(
    pkg.scripts['dev:worker'].includes('start-worker.js'),
    `dev:worker script should reference start-worker.js, got: ${pkg.scripts['dev:worker']}`
  );
});

test('server start:api script references start-api.js', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
  assert.ok(
    pkg.scripts['start:api'].includes('start-api.js'),
    `start:api script should reference start-api.js, got: ${pkg.scripts['start:api']}`
  );
});

test('server start:worker script references start-worker.js', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
  assert.ok(
    pkg.scripts['start:worker'].includes('start-worker.js'),
    `start:worker script should reference start-worker.js, got: ${pkg.scripts['start:worker']}`
  );
});

// ─── Root package.json: dev:split exists and invokes API + worker + client ───

test('root package.json has dev:split script', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.ok(
    pkg.scripts['dev:split'],
    'root package.json missing dev:split script'
  );
});

test('root dev:split script invokes dev:api on server', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const script = pkg.scripts['dev:split'] || '';
  assert.ok(
    script.includes('dev:api'),
    `root dev:split must invoke dev:api, got: ${script}`
  );
});

test('root dev:split script invokes dev:worker on server', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const script = pkg.scripts['dev:split'] || '';
  assert.ok(
    script.includes('dev:worker'),
    `root dev:split must invoke dev:worker, got: ${script}`
  );
});

// ─── start-api.js: sets ROLE=api and delegates to index ─────────────────────
//
// Design: start-api.js sets process.env.ROLE = 'api' then requires ./index.
// index.js reads ROLE and dispatches to startApiRuntime. The entrypoint itself
// does not import the runtime module directly.

test('start-api.js sets ROLE to api', () => {
  const content = fs.readFileSync(path.join(serverRoot, 'src/start-api.js'), 'utf8');
  // Must contain ROLE = 'api' (single or double quotes)
  assert.ok(
    /ROLE\s*=\s*['"]api['"]/.test(content),
    "start-api.js must set ROLE = 'api'"
  );
});

test('start-api.js does not set ROLE to worker', () => {
  const content = fs.readFileSync(path.join(serverRoot, 'src/start-api.js'), 'utf8');
  assert.ok(
    !/ROLE\s*=\s*['"]worker['"]/.test(content),
    "start-api.js must NOT set ROLE = 'worker'"
  );
});

// ─── start-worker.js: sets ROLE=worker and delegates to index ────────────────

test('start-worker.js sets ROLE to worker', () => {
  const content = fs.readFileSync(path.join(serverRoot, 'src/start-worker.js'), 'utf8');
  assert.ok(
    /ROLE\s*=\s*['"]worker['"]/.test(content),
    "start-worker.js must set ROLE = 'worker'"
  );
});

test('start-worker.js does not set ROLE to api', () => {
  const content = fs.readFileSync(path.join(serverRoot, 'src/start-worker.js'), 'utf8');
  assert.ok(
    !/ROLE\s*=\s*['"]api['"]/.test(content),
    "start-worker.js must NOT set ROLE = 'api'"
  );
});
