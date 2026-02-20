'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.resolve(__dirname, '..', '..');

const legacyShimFiles = [
  'src/config/platform-capabilities.js',
  'src/config/env.js',
  'src/constants/job-status.js',
  'src/domain/job-transitions.js',
  'src/lib/error-codes.js',
  'src/lib/logger.js',
  'src/lib/telemetry.js',
  'src/middleware/request-limits.js',
  'src/models/job.js',
  'src/models/telemetry-event.js',
  'src/models/worker-heartbeat.js',
  'src/platforms/registry.js',
  'src/routes/contacts.js',
  'src/routes/jobs.js',
  'src/routes/retry.js',
  'src/routes/status.js',
  'src/routes/worker-health.js',
  'src/routes/helpers/route-utils.js',
  'src/runtime/register-shutdown.js',
  'src/runtime/start-api-runtime.js',
  'src/runtime/start-worker-runtime.js',
  'src/utils/account-profile.js',
  'src/utils/validation.js',
];

function walkFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, name);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (name === 'node_modules') continue;
      walkFiles(fullPath, out);
      continue;
    }
    if (stat.isFile() && /\.(js|cjs|mjs)$/.test(name)) {
      out.push(fullPath);
    }
  }
  return out;
}

test('no legacy shim files remain in server/src', () => {
  const existing = legacyShimFiles
    .map((relPath) => path.join(serverRoot, relPath))
    .filter((absPath) => fs.existsSync(absPath))
    .map((absPath) => path.relative(serverRoot, absPath));

  assert.deepEqual(existing, [], `Legacy shim files must be removed:\n${existing.join('\n')}`);
});

test('server code does not import legacy shim folders', () => {
  const sourceDirs = [path.join(serverRoot, 'src'), path.join(serverRoot, 'test')];
  const files = sourceDirs.flatMap((dir) => walkFiles(dir));
  const requirePattern = /require\((['"])([^'"\n]+)\1\)/g;
  const shimAbsolutePaths = new Set(
    legacyShimFiles.map((relPath) => path.resolve(serverRoot, relPath))
  );

  const violations = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = requirePattern.exec(content)) !== null) {
      const specifier = match[2];
      if (!specifier.startsWith('.')) continue;

      const resolvedBase = path.resolve(path.dirname(file), specifier);
      const candidates = [
        resolvedBase,
        `${resolvedBase}.js`,
        `${resolvedBase}.cjs`,
        `${resolvedBase}.mjs`,
        path.join(resolvedBase, 'index.js'),
      ];
      const resolved = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (!resolved) continue;
      if (shimAbsolutePaths.has(resolved)) {
        violations.push(
          `${path.relative(serverRoot, file)} imports ${specifier} -> ${path.relative(serverRoot, resolved)}`
        );
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Legacy shim imports detected:\n${violations.join('\n')}`
  );
});
