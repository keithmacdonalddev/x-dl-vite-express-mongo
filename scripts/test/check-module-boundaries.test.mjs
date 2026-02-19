/**
 * Tests for check-module-boundaries.mjs
 *
 * Run: node --test scripts/test/check-module-boundaries.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateImports } from '../check-module-boundaries.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(__filename, '..', '..', '..');
const SRC = resolve(ROOT, 'server', 'src');

function abs(rel) {
  return resolve(SRC, rel);
}

// --- Forbidden edges ---

test('flags forbidden edge: routes -> services', () => {
  const edges = [
    { from: abs('routes/jobs.js'), to: abs('services/downloader-service.js') },
  ];
  const violations = evaluateImports(edges);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].fromDomain, 'routes');
  assert.equal(violations[0].toDomain, 'services');
});

test('flags forbidden edge: routes -> worker', () => {
  const edges = [
    { from: abs('routes/retry.js'), to: abs('worker/queue.js') },
  ];
  const violations = evaluateImports(edges);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].fromDomain, 'routes');
  assert.equal(violations[0].toDomain, 'worker');
});

test('flags forbidden edge: models -> routes', () => {
  const edges = [
    { from: abs('models/job.js'), to: abs('routes/helpers/route-utils.js') },
  ];
  const violations = evaluateImports(edges);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].fromDomain, 'models');
  assert.equal(violations[0].toDomain, 'routes');
});

test('flags forbidden edge: lib -> routes', () => {
  const edges = [
    { from: abs('lib/logger.js'), to: abs('routes/jobs.js') },
  ];
  const violations = evaluateImports(edges);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].fromDomain, 'lib');
  assert.equal(violations[0].toDomain, 'routes');
});

// --- Allowed edges ---

test('allows valid edge: worker -> services', () => {
  const edges = [
    { from: abs('worker/process-job.js'), to: abs('services/extractor-service.js') },
  ];
  const violations = evaluateImports(edges);
  assert.equal(violations.length, 0);
});

test('allows valid edge: worker -> models', () => {
  const edges = [
    { from: abs('worker/queue.js'), to: abs('models/job.js') },
  ];
  const violations = evaluateImports(edges);
  assert.equal(violations.length, 0);
});

test('allows valid edge: routes -> models', () => {
  const edges = [
    { from: abs('routes/jobs.js'), to: abs('models/job.js') },
  ];
  const violations = evaluateImports(edges);
  assert.equal(violations.length, 0);
});

test('allows valid edge: routes -> utils', () => {
  const edges = [
    { from: abs('routes/jobs.js'), to: abs('utils/validation.js') },
  ];
  const violations = evaluateImports(edges);
  assert.equal(violations.length, 0);
});

test('allows valid edge: routes -> lib', () => {
  const edges = [
    { from: abs('routes/jobs.js'), to: abs('lib/logger.js') },
  ];
  const violations = evaluateImports(edges);
  assert.equal(violations.length, 0);
});

test('allows same-domain imports (routes helpers)', () => {
  const edges = [
    { from: abs('routes/jobs.js'), to: abs('routes/helpers/route-utils.js') },
  ];
  const violations = evaluateImports(edges);
  assert.equal(violations.length, 0);
});

test('returns multiple violations for multiple forbidden edges', () => {
  const edges = [
    { from: abs('routes/jobs.js'), to: abs('services/downloader-service.js') },
    { from: abs('routes/retry.js'), to: abs('worker/queue.js') },
  ];
  const violations = evaluateImports(edges);
  assert.equal(violations.length, 2);
});

test('ignores edges with unrecognized domains (e.g. node_modules paths)', () => {
  const edges = [
    { from: abs('routes/jobs.js'), to: resolve(ROOT, 'node_modules/express/index.js') },
  ];
  const violations = evaluateImports(edges);
  assert.equal(violations.length, 0);
});

// --- Strict folder ownership staged rules ---

test('flags cross-domain import: domains/jobs -> domains/contacts', () => {
  const edges = [
    { from: abs('domains/jobs/routes.js'), to: abs('domains/contacts/routes.js') },
  ];
  const violations = evaluateImports(edges);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].fromDomain, 'domains:jobs');
  assert.equal(violations[0].toDomain, 'domains:contacts');
});

test('flags core -> domain import when not allowlisted', () => {
  const edges = [
    { from: abs('core/runtime/load-domains.js'), to: abs('domains/jobs/index.js') },
  ];
  const violations = evaluateImports(edges);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].fromDomain, 'core');
  assert.equal(violations[0].toDomain, 'domains:jobs');
});

test('allowlist entry suppresses a violation for staged adapter edges', () => {
  const edges = [
    { from: abs('core/runtime/load-domains.js'), to: abs('domains/jobs/index.js') },
  ];
  const allowlistEntries = [
    { from: 'core/runtime/load-domains.js', to: 'domains/jobs/index.js' },
  ];
  const violations = evaluateImports(edges, { allowlistEntries });
  assert.equal(violations.length, 0);
});
