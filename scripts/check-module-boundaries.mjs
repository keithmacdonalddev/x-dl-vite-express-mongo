#!/usr/bin/env node
/**
 * Module boundary checker for server/src/
 *
 * Scans all .js files and validates require() calls against forbidden edges.
 * Run: node scripts/check-module-boundaries.mjs
 * Or:  npm run check:boundaries
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const SERVER_SRC = resolve(__dirname, '..', 'server', 'src');
const BOUNDARY_ALLOWLIST_FILE = resolve(__dirname, 'module-boundary-allowlist.json');

/**
 * Domain definitions: map a domain name to its path prefix (relative to server/src/).
 */
const DOMAINS = [
  { name: 'routes',     prefix: 'routes/' },
  { name: 'worker',     prefix: 'worker/' },
  { name: 'services',   prefix: 'services/' },
  { name: 'models',     prefix: 'models/' },
  { name: 'lib',        prefix: 'lib/' },
  { name: 'config',     prefix: 'config/' },
  { name: 'constants',  prefix: 'constants/' },
  { name: 'platforms',  prefix: 'platforms/' },
  { name: 'utils',      prefix: 'utils/' },
  { name: 'middleware',  prefix: 'middleware/' },
  { name: 'domain',     prefix: 'domain/' },
];

/**
 * Forbidden dependency edges.
 * Any require() that crosses these domain boundaries is a violation.
 */
const FORBIDDEN_EDGES = [
  { from: 'routes',  to: 'services', reason: 'Routes must not call services directly; use models/utils' },
  { from: 'routes',  to: 'worker',   reason: 'Routes must not interact with worker internals' },
  { from: 'models',  to: 'routes',   reason: 'Models must not import route logic' },
  { from: 'lib',     to: 'routes',   reason: 'Shared lib must not depend on route layer' },
];

const DOMAIN_TO_DOMAIN_FORBIDDEN_REASON =
  'Domain modules must not import other domain internals; use core contracts.';

const CORE_TO_DOMAIN_FORBIDDEN_REASON =
  'Core must only reference domains through explicit registration seams.';

function normalizePath(pathValue) {
  return String(pathValue || '').replace(/\\/g, '/');
}

function toServerRelative(absPath) {
  return normalizePath(relative(SERVER_SRC, absPath));
}

function readBoundaryAllowlist(filePath = BOUNDARY_ALLOWLIST_FILE) {
  if (!existsSync(filePath)) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }

  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  return entries
    .map((entry) => ({
      from: normalizePath(entry?.from),
      to: normalizePath(entry?.to),
    }))
    .filter((entry) => entry.from && entry.to);
}

const BOUNDARY_ALLOWLIST_ENTRIES = readBoundaryAllowlist();

function isAllowlisted(edge, allowlistEntries) {
  const fromRel = toServerRelative(edge.from);
  const toRel = toServerRelative(edge.to);
  return allowlistEntries.some((entry) => entry.from === fromRel && entry.to === toRel);
}

/**
 * Resolve a file path to its domain name, or null if unrecognized.
 * @param {string} absPath - absolute path to the file
 * @returns {string|null}
 */
function getDomain(absPath) {
  const rel = toServerRelative(absPath);

  if (rel.startsWith('core/')) {
    return 'core';
  }

  if (rel.startsWith('domains/')) {
    const parts = rel.split('/');
    const domainId = parts[1] || '';
    if (domainId) {
      return `domains:${domainId}`;
    }
  }

  for (const domain of DOMAINS) {
    if (rel.startsWith(domain.prefix)) return domain.name;
  }
  return null;
}

/**
 * Collect all .js files recursively under a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function collectJsFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectJsFiles(full));
    } else if (entry.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Extract require() target strings from file source.
 * Only captures relative requires (starting with ./ or ../).
 * @param {string} source
 * @returns {string[]}
 */
function extractRequires(source) {
  const pattern = /require\(\s*['"`](\.[^'"`]+)['"`]\s*\)/g;
  const targets = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    targets.push(match[1]);
  }
  return targets;
}

/**
 * Resolve a require() specifier to an absolute path (approximate — no node_modules resolution).
 * @param {string} fromFile - absolute path to the requiring file
 * @param {string} requireSpec - the string passed to require()
 * @returns {string}
 */
function resolveRequire(fromFile, requireSpec) {
  const dir = resolve(fromFile, '..');
  let resolved = resolve(dir, requireSpec);
  // If no extension, assume .js
  if (!resolved.endsWith('.js')) resolved += '.js';
  return resolved;
}

/**
 * Evaluate an array of import edges against forbidden rules.
 *
 * This function is exported for testing. The main scanner builds edges from
 * the filesystem; tests can pass synthetic edges directly.
 *
 * @param {{ from: string, to: string }[]} edges - each edge is { from: absPath, to: absPath }
 * @param {{ from: string, to: string }[]} [options.allowlistEntries] - optional allowlist override
 * @returns {{ from: string, to: string, fromDomain: string, toDomain: string, reason: string }[]}
 */
export function evaluateImports(edges, options = {}) {
  const allowlistEntries = Array.isArray(options.allowlistEntries)
    ? options.allowlistEntries
    : BOUNDARY_ALLOWLIST_ENTRIES;

  const violations = [];
  for (const edge of edges) {
    const fromDomain = getDomain(edge.from);
    const toDomain = getDomain(edge.to);
    if (!fromDomain || !toDomain) continue;
    if (fromDomain === toDomain) continue;

    if (fromDomain.startsWith('domains:') && toDomain.startsWith('domains:')) {
      if (!isAllowlisted(edge, allowlistEntries)) {
        violations.push({
          from: edge.from,
          to: edge.to,
          fromDomain,
          toDomain,
          reason: DOMAIN_TO_DOMAIN_FORBIDDEN_REASON,
        });
      }
      continue;
    }

    if (fromDomain === 'core' && toDomain.startsWith('domains:')) {
      if (!isAllowlisted(edge, allowlistEntries)) {
        violations.push({
          from: edge.from,
          to: edge.to,
          fromDomain,
          toDomain,
          reason: CORE_TO_DOMAIN_FORBIDDEN_REASON,
        });
      }
      continue;
    }

    for (const forbidden of FORBIDDEN_EDGES) {
      if (forbidden.from === fromDomain && forbidden.to === toDomain) {
        if (!isAllowlisted(edge, allowlistEntries)) {
          violations.push({
            from: edge.from,
            to: edge.to,
            fromDomain,
            toDomain,
            reason: forbidden.reason,
          });
        }
        break;
      }
    }
  }
  return violations;
}

/**
 * Scan server/src/ and build import edges from require() calls.
 * @returns {{ from: string, to: string }[]}
 */
function buildEdges() {
  const files = collectJsFiles(SERVER_SRC);
  const edges = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const requires = extractRequires(source);
    for (const spec of requires) {
      const resolved = resolveRequire(file, spec);
      edges.push({ from: file, to: resolved });
    }
  }
  return edges;
}

// Only run as main script
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const edges = buildEdges();
  const violations = evaluateImports(edges);

  if (violations.length === 0) {
    console.log('check-module-boundaries: no violations found.');
    process.exit(0);
  } else {
    console.error(`check-module-boundaries: ${violations.length} violation(s) found:\n`);
    for (const v of violations) {
      const fromRel = relative(resolve(__dirname, '..'), v.from).replace(/\\/g, '/');
      const toRel = relative(resolve(__dirname, '..'), v.to).replace(/\\/g, '/');
      console.error(`  FORBIDDEN [${v.fromDomain} → ${v.toDomain}]`);
      console.error(`    from: ${fromRel}`);
      console.error(`    to:   ${toRel}`);
      console.error(`    why:  ${v.reason}\n`);
    }
    process.exit(1);
  }
}
