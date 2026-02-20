# Plugin Architecture Implementation Plan

> **Superseded:** Use `docs/plans/2026-02-19-strict-folder-ownership-implementation-plan.md` as the active implementation plan.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the backend from a modular monolith into a kernel + internal plugin architecture with deterministic graceful degradation and plugin-aware job telemetry/activity visibility.

**Architecture:** Keep a small non-removable core (`runtime`, plugin manager, shared SDK, telemetry transport), then migrate business areas into vertical plugins under `server/src/plugins/*`. Use compatibility flags during migration, preserve existing endpoint contracts where possible, and enforce boundaries with automated checks.

**Tech Stack:** Node.js 20, Express 5, Mongoose 9, MongoDB, node:test, React 19 (client), Vite.

**Required supporting skills during execution:** `@using-git-worktrees`, `@test-driven-development`, `@systematic-debugging`, `@verification-before-completion`

---

### Task 0: Worktree + Baseline Verification

**Files:**
- Create: none
- Modify: none
- Test: none

**Step 1: Create dedicated worktree**

Run:
```bash
git worktree add ..\\x-dl-plugin-arch -b feat/plugin-architecture
```
Expected: new worktree directory created and branch checked out.

**Step 2: Install deps in worktree**

Run:
```bash
npm install
npm install --prefix server
npm install --prefix client
```
Expected: install completes with no missing lockfile errors.

**Step 3: Run current baseline checks**

Run:
```bash
npm run check
npm --prefix server exec node -- --test server/test/config/runtime-role.test.js
npm --prefix server exec node -- --test server/test/runtime/runtime-lifecycle.test.js
npm --prefix server exec node -- --test server/test/runtime/entrypoint-contract.test.js
npm --prefix server exec node -- --test server/test/lib/telemetry-contract.test.js
```
Expected: all pass before plugin changes begin.

**Step 4: Commit nothing**

No commit for baseline-only task.

---

### Task 1: Add Plugin Contract + Manager Core

**Files:**
- Create: `server/src/plugins/kernel/plugin-contract.js`
- Create: `server/src/plugins/kernel/plugin-manager.js`
- Create: `server/src/plugins/kernel/plugin-sdk.js`
- Create: `server/test/plugins/plugin-manager-contract.test.js`

**Step 1: Write failing contract/manager tests**

```js
test('registerPlugin rejects missing manifest.id', () => {
  assert.throws(() => registerPlugin({ manifest: {} }), /manifest\.id/);
});

test('manager loads enabled plugin and exposes health state', async () => {
  const manager = createPluginManager();
  manager.registerPlugin(makePlugin('jobs'));
  await manager.startAll();
  assert.equal(manager.getState('jobs').status, 'running');
});

test('manifest.runtimeTargets accepts only api/worker/both', () => {
  assert.throws(() => validateManifest({ id: 'bad', runtimeTargets: ['api', 'cron'] }), /runtimeTargets/);
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
npm --prefix server exec node -- --test server/test/plugins/plugin-manager-contract.test.js
```
Expected: FAIL because plugin kernel files do not exist.

**Step 3: Implement minimal plugin contract + manager**

```js
function validateManifest(manifest) {
  if (!manifest || typeof manifest.id !== 'string' || !manifest.id.trim()) {
    throw new Error('manifest.id is required');
  }
  if (manifest.runtimeTargets != null) {
    const allowed = new Set(['api', 'worker', 'both']);
    const targets = Array.isArray(manifest.runtimeTargets) ? manifest.runtimeTargets : [manifest.runtimeTargets];
    if (targets.length === 0 || targets.some((value) => !allowed.has(value))) {
      throw new Error('manifest.runtimeTargets must be api, worker, both, or a valid array of those values');
    }
  }
}

function createPluginManager() {
  const registry = new Map();
  return { registerPlugin, startAll, stopAll, getState };
}
```

**Step 4: Run tests to verify pass**

Run:
```bash
npm --prefix server exec node -- --test server/test/plugins/plugin-manager-contract.test.js
```
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/plugins/kernel/plugin-contract.js server/src/plugins/kernel/plugin-manager.js server/src/plugins/kernel/plugin-sdk.js server/test/plugins/plugin-manager-contract.test.js
git commit -m "feat(plugins): add kernel plugin contract and manager core"
```

---

### Task 2: Integrate Plugin Manager Into Runtime Startup/Shutdown

**Files:**
- Create: `server/src/plugins/register-internal-plugins.js`
- Modify: `server/src/runtime/start-api-runtime.js`
- Modify: `server/src/runtime/start-worker-runtime.js`
- Modify: `server/src/runtime/register-shutdown.js`
- Test: `server/test/runtime/plugin-runtime-lifecycle.test.js`

**Step 1: Write failing runtime integration tests**

```js
test('api runtime initializes plugin manager before listen', async () => {
  assert.deepEqual(callOrder, ['app.listen', 'plugins.start']);
});

test('shutdown calls pluginManager.stopAll', async () => {
  assert.equal(stopAllCalled, true);
});

test('startAll filters plugins by runtime role and logs skipped plugins', async () => {
  assert.equal(skippedByRole.includes('worker-only-plugin'), true);
});
```

**Step 2: Run test to verify failure**

Run:
```bash
npm --prefix server exec node -- --test server/test/runtime/plugin-runtime-lifecycle.test.js
```
Expected: FAIL because runtime does not call plugin manager.

**Step 3: Implement minimal runtime wiring**

```js
const { createPluginManager } = require('../plugins/kernel/plugin-manager');
const { registerInternalPlugins } = require('../plugins/register-internal-plugins');
// start runtime -> app.listen() first -> registerInternalPlugins(manager, ctx) -> await manager.startAll({ role })
// shutdown -> await manager.stopAll()
// startAll({ role }) must:
//   - start only plugins whose manifest.runtimeTargets match role (or both)
//   - log warning when plugin is skipped due to role mismatch
//   - default to best-effort startup unless STRICT_PLUGINS=true
```

**Step 4: Re-run runtime tests**

Run:
```bash
npm --prefix server exec node -- --test server/test/runtime/plugin-runtime-lifecycle.test.js
npm --prefix server exec node -- --test server/test/runtime/runtime-lifecycle.test.js
npm --prefix server exec node -- --test server/test/config/runtime-role.test.js
```
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/plugins/register-internal-plugins.js server/src/runtime/start-api-runtime.js server/src/runtime/start-worker-runtime.js server/src/runtime/register-shutdown.js server/test/runtime/plugin-runtime-lifecycle.test.js
git commit -m "feat(runtime): bootstrap plugin manager in api and worker runtimes"
```

---

### Task 3: Add Deterministic FEATURE_DISABLED Behavior

**Files:**
- Create: `server/src/plugins/kernel/feature-disabled.js`
- Modify: `server/src/lib/error-codes.js`
- Modify: `server/src/app.js`
- Test: `server/test/routes/plugin-feature-disabled.test.js`

**Step 1: Write failing route behavior tests**

```js
test('disabled plugin route returns 503 FEATURE_DISABLED', async () => {
  assert.equal(res.statusCode, 503);
  assert.equal(body.code, 'FEATURE_DISABLED');
});
```

**Step 2: Run test to verify failure**

Run:
```bash
npm --prefix server exec node -- --test server/test/routes/plugin-feature-disabled.test.js
```
Expected: FAIL because no shared feature-disabled helper/contract exists.

**Step 3: Implement centralized disabled response helper**

```js
function sendFeatureDisabled(res, feature, detail = '') {
  return res.status(503).json({ ok: false, code: 'FEATURE_DISABLED', error: `${feature} is currently disabled.`, detail });
}
```

**Step 4: Re-run tests**

Run:
```bash
npm --prefix server exec node -- --test server/test/routes/plugin-feature-disabled.test.js
```
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/plugins/kernel/feature-disabled.js server/src/lib/error-codes.js server/src/app.js server/test/routes/plugin-feature-disabled.test.js
git commit -m "feat(plugins): add deterministic feature-disabled response contract"
```

---

### Task 4: Introduce Plugin-Aware Telemetry Envelope In Core

**Files:**
- Modify: `server/src/lib/telemetry.js`
- Modify: `server/src/lib/logger.js`
- Test: `server/test/lib/telemetry-plugin-envelope.test.js`

**Step 1: Write failing telemetry schema tests**

```js
test('telemetry event includes pluginId and area fields', () => {
  const e = publishTelemetry('worker.job.claimed', { pluginId: 'jobs', area: 'queue' });
  assert.equal(e.pluginId, 'jobs');
  assert.equal(e.area, 'queue');
});
```

**Step 2: Run test and confirm failure**

Run:
```bash
npm --prefix server exec node -- --test server/test/lib/telemetry-plugin-envelope.test.js
```
Expected: FAIL because envelope fields are not normalized/tested.

**Step 3: Implement field normalization and defaults**

```js
const payload = {
  pluginId: typeof meta.pluginId === 'string' ? meta.pluginId : 'core',
  area: typeof meta.area === 'string' ? meta.area : 'system',
  // existing fields...
};
```

**Step 4: Re-run telemetry tests**

Run:
```bash
npm --prefix server exec node -- --test server/test/lib/telemetry-plugin-envelope.test.js
npm --prefix server exec node -- --test server/test/lib/telemetry-contract.test.js
```
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/lib/telemetry.js server/src/lib/logger.js server/test/lib/telemetry-plugin-envelope.test.js
git commit -m "feat(telemetry): add plugin-aware envelope fields in core pipeline"
```

---

### Task 5: Extract Platform X Into Internal Plugin

**Files:**
- Create: `server/src/plugins/platform-x/manifest.js`
- Create: `server/src/plugins/platform-x/index.js`
- Create: `server/src/plugins/platform-x/platform-definition.js`
- Modify: `server/src/plugins/register-internal-plugins.js`
- Modify: `server/src/platforms/registry.js`
- Test: `server/test/plugins/platform-x-plugin.test.js`

**Step 1: Write failing plugin contract tests for X**

```js
test('platform-x plugin exports valid manifest and register()', () => {
  assert.equal(plugin.manifest.id, 'platform-x');
  assert.equal(typeof plugin.register, 'function');
});
```

**Step 2: Run test and confirm failure**

Run:
```bash
npm --prefix server exec node -- --test server/test/plugins/platform-x-plugin.test.js
```
Expected: FAIL because plugin does not exist.

**Step 3: Implement plugin wrapper and registry bridge**

```js
module.exports = {
  manifest: { id: 'platform-x', version: '1.0.0', capabilities: ['platform-definition'] },
  register(ctx) { ctx.platforms.register(require('./platform-definition')); },
  async start() {},
  async stop() {},
};
```

**Step 4: Re-run plugin tests**

Run:
```bash
npm --prefix server exec node -- --test server/test/plugins/platform-x-plugin.test.js
```
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/plugins/platform-x/manifest.js server/src/plugins/platform-x/index.js server/src/plugins/platform-x/platform-definition.js server/src/plugins/register-internal-plugins.js server/src/platforms/registry.js server/test/plugins/platform-x-plugin.test.js
git commit -m "refactor(platform-x): wrap X platform definition as internal plugin"
```

---

### Task 6: Extract TikTok Into Internal Plugin

**Files:**
- Create: `server/src/plugins/platform-tiktok/manifest.js`
- Create: `server/src/plugins/platform-tiktok/index.js`
- Create: `server/src/plugins/platform-tiktok/platform-definition.js`
- Modify: `server/src/plugins/register-internal-plugins.js`
- Modify: `server/src/platforms/registry.js`
- Test: `server/test/plugins/platform-tiktok-plugin.test.js`

**Step 1: Write failing plugin tests**

```js
test('platform-tiktok plugin registers tiktok definition', async () => {
  assert.ok(registered.some((p) => p.id === 'tiktok'));
});
```

**Step 2: Run tests and confirm fail**

Run:
```bash
npm --prefix server exec node -- --test server/test/plugins/platform-tiktok-plugin.test.js
```
Expected: FAIL because plugin does not exist.

**Step 3: Implement TikTok plugin**

```js
module.exports = {
  manifest: { id: 'platform-tiktok', version: '1.0.0', capabilities: ['platform-definition'] },
  register(ctx) { ctx.platforms.register(require('./platform-definition')); },
  async start() {},
  async stop() {},
};
```

**Step 4: Re-run tests**

Run:
```bash
npm --prefix server exec node -- --test server/test/plugins/platform-tiktok-plugin.test.js
```
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/plugins/platform-tiktok/manifest.js server/src/plugins/platform-tiktok/index.js server/src/plugins/platform-tiktok/platform-definition.js server/src/plugins/register-internal-plugins.js server/src/platforms/registry.js server/test/plugins/platform-tiktok-plugin.test.js
git commit -m "refactor(platform-tiktok): wrap TikTok platform definition as internal plugin"
```

---

### Task 7: Add Plugin Ownership Field To Jobs + Worker Dispatch

**Files:**
- Modify: `server/src/models/job.js`
- Modify: `server/src/routes/jobs.js`
- Modify: `server/src/worker/process-job.js`
- Create: `server/src/plugins/kernel/worker-dispatch.js`
- Test: `server/test/routes/jobs-plugin-assignment.test.js`
- Test: `server/test/worker/plugin-dispatch.test.js`

**Step 1: Write failing route and worker tests**

```js
test('POST /api/jobs stores pluginId derived from URL platform', async () => {
  assert.equal(created.pluginId, 'platform-x');
});

test('worker dispatch routes job to owning plugin handler', async () => {
  assert.equal(handlerCalledWith.pluginId, 'platform-x');
});
```

**Step 2: Run tests and confirm fail**

Run:
```bash
npm --prefix server exec node -- --test server/test/routes/jobs-plugin-assignment.test.js
npm --prefix server exec node -- --test server/test/worker/plugin-dispatch.test.js
```
Expected: FAIL because `pluginId` and dispatch table do not exist.

**Step 3: Implement plugin assignment + dispatch**

```js
// model
pluginId: { type: String, default: '', trim: true, index: true }

// route create
const pluginId = postInfo.platform === 'x' ? 'platform-x' : 'platform-tiktok';

// worker
await dispatchJobToPlugin({ pluginId: job.pluginId, job, telemetryContext: { jobId, traceId } });
```

**Step 4: Re-run tests**

Run:
```bash
npm --prefix server exec node -- --test server/test/routes/jobs-plugin-assignment.test.js
npm --prefix server exec node -- --test server/test/worker/plugin-dispatch.test.js
```
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/models/job.js server/src/routes/jobs.js server/src/worker/process-job.js server/src/plugins/kernel/worker-dispatch.js server/test/routes/jobs-plugin-assignment.test.js server/test/worker/plugin-dispatch.test.js
git commit -m "feat(jobs): add plugin ownership field and worker plugin dispatch"
```

---

### Task 8: Activity UI Plugin Visibility + Raw Stream Mode

**Files:**
- Modify: `client/src/features/activity/ActivityPanel.jsx`
- Modify: `client/src/features/activity/eventTranslator.js`
- Modify: `client/src/features/activity/activity.css`
- Modify: `client/src/components/JobsPage.jsx`
- Create: `client/src/features/activity/eventTranslator.test.js`
- Modify: `client/package.json` (enable runnable test command)

**Step 1: Write failing translator/UI-focused tests**

```js
test('translateEvent includes plugin badge label fallback', () => {
  const out = translateEvent({ event: 'worker.job.claimed', pluginId: 'platform-x' });
  assert.equal(out.pluginLabel, 'platform-x');
});
```

**Step 2: Run tests and confirm fail**

Run:
```bash
npm --prefix client run test
```
Expected: FAIL (or no test runner configured yet).

**Step 3: Implement plugin visibility and raw stream mode**

```jsx
// ActivityPanel
const [viewMode, setViewMode] = useState('overview'); // overview | raw
// render plugin badge with entry.pluginId and area
```

**Step 4: Re-run client tests and lint**

Run:
```bash
npm --prefix client run test
npm --prefix client run lint
```
Expected: PASS.

**Step 5: Commit**

```bash
git add client/src/features/activity/ActivityPanel.jsx client/src/features/activity/eventTranslator.js client/src/features/activity/activity.css client/src/components/JobsPage.jsx client/src/features/activity/eventTranslator.test.js client/package.json
git commit -m "feat(activity): add plugin-aware visibility and raw stream mode"
```

---

### Task 9: Enforce Plugin Boundary Rules In Static Checker

**Files:**
- Modify: `scripts/check-module-boundaries.mjs`
- Modify: `scripts/test/check-module-boundaries.test.mjs`
- Modify: `docs/architecture/module-boundaries.md`

**Step 1: Write failing boundary tests for plugins/runtime domain**

```js
test('flags forbidden edge: plugins/platform-x -> plugins/platform-tiktok internals', () => {
  assert.equal(violations.length, 1);
});

test('recognizes runtime domain', () => {
  assert.equal(getDomain(abs('runtime/start-api-runtime.js')), 'runtime');
});
```

**Step 2: Run test and confirm fail**

Run:
```bash
node --test scripts/test/check-module-boundaries.test.mjs
```
Expected: FAIL because `runtime`/`plugins` domains are not encoded yet.

**Step 3: Implement domain table and forbidden edges updates**

```js
{ name: 'runtime', prefix: 'runtime/' },
{ name: 'plugins', prefix: 'plugins/' },
// forbid plugins -> plugins (except same plugin subtree)
```

**Step 4: Re-run checker tests and boundary script**

Run:
```bash
node --test scripts/test/check-module-boundaries.test.mjs
npm run check:boundaries
```
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/check-module-boundaries.mjs scripts/test/check-module-boundaries.test.mjs docs/architecture/module-boundaries.md
git commit -m "chore(boundaries): enforce runtime and plugin isolation rules"
```

---

### Task 10: Documentation, Ops, and Verification Matrix Updates

**Files:**
- Modify: `README.md`
- Modify: `docs/ops/api-worker-deploy-runbook.md`
- Modify: `docs/testing-matrix.md`
- Modify: `docs/issues.md`
- Create: `docs/ownership/plugin-responsibility-map.md`

**Step 1: Write/expand docs tests checklist entries**

Add explicit coverage for:
- plugin boot matrix
- feature-disabled behavior
- plugin telemetry fields in stream
- activity plugin badge/raw stream checks

**Step 2: Run documentation gate checks**

Run:
```bash
npm run check
```
Expected: PASS.

**Step 3: Full verification sweep**

Run:
```bash
npm --prefix server exec node -- --test server/test/plugins/plugin-manager-contract.test.js
npm --prefix server exec node -- --test server/test/runtime/plugin-runtime-lifecycle.test.js
npm --prefix server exec node -- --test server/test/lib/telemetry-plugin-envelope.test.js
npm --prefix server exec node -- --test server/test/routes/jobs-plugin-assignment.test.js
npm --prefix server exec node -- --test server/test/worker/plugin-dispatch.test.js
node --test scripts/test/check-module-boundaries.test.mjs
npm run check:boundaries
npm run check
```
Expected: all pass.

**Step 4: Commit docs + final verification state**

```bash
git add README.md docs/ops/api-worker-deploy-runbook.md docs/testing-matrix.md docs/issues.md docs/ownership/plugin-responsibility-map.md
git commit -m "docs(plugins): publish ownership map, rollout runbook, and verification matrix"
```

---

## Final Merge Gate

Run and record output:

1. `npm run check`
2. `npm run check:boundaries`
3. `npm --prefix server exec node -- --test server/test/config/runtime-role.test.js`
4. `npm --prefix server exec node -- --test server/test/runtime/runtime-lifecycle.test.js`
5. `npm --prefix server exec node -- --test server/test/runtime/entrypoint-contract.test.js`
6. `npm --prefix server exec node -- --test server/test/lib/telemetry-contract.test.js`
7. `npm --prefix server exec node -- --test server/test/plugins/plugin-manager-contract.test.js`
8. `npm --prefix server exec node -- --test server/test/routes/jobs-plugin-assignment.test.js`
9. `npm --prefix server exec node -- --test server/test/worker/plugin-dispatch.test.js`
10. `npm --prefix client run lint`

All must pass before requesting code review.

## Rollback Plan

If runtime regressions appear after plugin bootstrap:

1. Set `STRICT_PLUGINS=false`.
2. Disable plugin kernel path with temporary env flag (introduce `ENABLE_PLUGIN_KERNEL=false` during Task 2).
3. Restart API and worker in legacy mode.
4. Re-enable per phase after fixing failing gate.
