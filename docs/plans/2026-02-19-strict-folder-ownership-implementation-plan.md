# Strict Folder Ownership Backend Implementation Plan (GO-Ready)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure `server/src` so each team owns one folder subtree end-to-end, with no overlapping business files and enforced import boundaries.

**Architecture:** Use a non-removable `core` area for shared infrastructure and cross-cutting services, and domain folders under `server/src/domains/*` for business ownership. Migrate incrementally with adapters + staged boundary enforcement + mixed-state job fallback so production traffic is safe during transition.

**Tech Stack:** Node.js 20, Express 5, Mongoose 9, MongoDB, node:test, PowerShell scripts.

---

## Ownership Areas (7)

1. `server/src/core/*` — Core Platform
2. `server/src/domains/jobs/*` — Jobs Lifecycle (includes retry/status routes)
3. `server/src/domains/contacts/*` — Contacts
4. `server/src/domains/platform-x/*` — Platform X
5. `server/src/domains/platform-tiktok/*` — Platform TikTok
6. `server/src/domains/capabilities/*` — Capabilities/Admin
7. `server/src/domains/worker-health/*` — Worker Health/Recovery

---

## Domain Runtime Contract (locked before code)

Use a simple domain module shape (no heavy plugin lifecycle):

```js
module.exports = {
  id: 'jobs',
  runtimeTargets: ['api', 'worker'], // allowed: api, worker, both
  mountRoutes(app, ctx) {},          // optional
  startWorker(ctx) {},               // optional
  stopWorker(ctx) {},                // optional
};
```

`ctx` shape is locked:
- `ctx.logger` (alias to existing logger)
- `ctx.telemetry.emit` (alias to `publishTelemetry` singleton)
- `ctx.config`
- `ctx.mongo`
- `ctx.core` (access to core services only; never other domains)

---

### Task 0: Baseline Verification

**Files:**
- Modify: none
- Test: existing baseline tests

**Step 1: Run baseline checks**

Run:
```bash
npm run check
npm run check:boundaries
npm --prefix server exec node -- --test server/test/config/runtime-role.test.js
npm --prefix server exec node -- --test server/test/runtime/runtime-lifecycle.test.js
npm --prefix server exec node -- --test server/test/runtime/entrypoint-contract.test.js
npm --prefix server exec node -- --test server/test/lib/telemetry-contract.test.js
```
Expected: PASS.

**Step 2: Commit nothing**

No commit.

Rollback: none.

---

### Task 1: Core Contents Inventory (Critical Blocker B1)

**Files:**
- Create: `docs/ownership/core-contents-inventory.md`
- Modify: `docs/ownership/folder-responsibility-map.md`

**Step 1: Write inventory with explicit placement**

Must include:
- `models/job.js` -> `core` ownership
- `constants/job-status.js` -> `core`
- `platforms/registry.js` -> `core` aggregator
- `utils/validation.js` + `utils/account-profile.js` -> `core`
- `middleware/request-limits.js` -> `core`
- `domain/job-transitions.js` -> `core`
- `routes/retry.js` + `routes/status.js` -> jobs domain ownership target

**Step 2: Add migration staging notes**

Define adapters and temporary aliases allowed during migration windows.

**Step 3: Commit**

```bash
git add docs/ownership/core-contents-inventory.md docs/ownership/folder-responsibility-map.md
git commit -m "docs(ownership): lock core contents inventory and domain ownership map"
```

Rollback: revert docs commit only.

---

### Task 2: Boundary Checker v2 With Transition Staging (Critical Blocker B1/B4)

**Files:**
- Modify: `scripts/check-module-boundaries.mjs`
- Modify: `scripts/test/check-module-boundaries.test.mjs`
- Modify: `docs/architecture/module-boundaries.md`

**Step 1: Write failing tests using `evaluateImports` only**

```js
test('flags domains/jobs -> domains/contacts as violation', () => {
  const violations = evaluateImports([
    { from: abs('domains/jobs/routes.js'), to: abs('domains/contacts/routes.js') },
  ]);
  assert.equal(violations.length, 1);
});
```

**Step 2: Run tests (expect fail)**

Run:
```bash
node --test scripts/test/check-module-boundaries.test.mjs
```
Expected: FAIL.

**Step 3: Implement staged enforcement**

Add:
- recognition for `core/*` and `domains/<id>/*`
- cross-domain forbid rule (`domains/a` -> `domains/b`, a!=b)
- migration allowlist file for temporary adapters (explicitly scoped and time-boxed)

**Step 4: Re-run checks**

Run:
```bash
node --test scripts/test/check-module-boundaries.test.mjs
npm run check:boundaries
```
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/check-module-boundaries.mjs scripts/test/check-module-boundaries.test.mjs docs/architecture/module-boundaries.md
git commit -m "chore(boundaries): add core/domain rules with staged migration allowlist"
```

Rollback: restore previous checker and docs.

---

### Task 3: Domain Runtime Loader + Ordered Shutdown (H1/M5)

**Files:**
- Create: `server/src/core/runtime/load-domains.js`
- Create: `server/src/core/runtime/domain-context.js`
- Modify: `server/src/config/env.js`
- Modify: `server/src/runtime/start-api-runtime.js`
- Modify: `server/src/runtime/start-worker-runtime.js`
- Modify: `server/src/runtime/register-shutdown.js`
- Test: `server/test/runtime/domain-runtime-wiring.test.js`

**Step 1: Write failing runtime tests**

```js
test('ENABLE_DOMAIN_KERNEL=false uses legacy startup path', () => {});
test('start-time role filtering skips non-matching domains with warning log', () => {});
test('shutdown order is domains.stopWorker -> http.close -> mongoose.disconnect', () => {});
```

**Step 2: Run tests (expect fail)**

Run:
```bash
npm --prefix server exec node -- --test server/test/runtime/domain-runtime-wiring.test.js
```
Expected: FAIL.

**Step 3: Implement runtime behavior**

Add:
- `ENABLE_DOMAIN_KERNEL` (default `false`)
- start-time filtering by `runtimeTargets`
- best-effort start unless `STRICT_PLUGINS=true`
- single shutdown pipeline (no listener stacking)

**Step 4: Re-run tests**

Run:
```bash
npm --prefix server exec node -- --test server/test/runtime/domain-runtime-wiring.test.js
npm --prefix server exec node -- --test server/test/runtime/runtime-lifecycle.test.js
```
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/core/runtime/load-domains.js server/src/core/runtime/domain-context.js server/src/config/env.js server/src/runtime/start-api-runtime.js server/src/runtime/start-worker-runtime.js server/src/runtime/register-shutdown.js server/test/runtime/domain-runtime-wiring.test.js
git commit -m "feat(runtime): add domain loader, role filtering, and ordered shutdown pipeline"
```

Rollback: set `ENABLE_DOMAIN_KERNEL=false`; revert runtime loader commit if needed.

---

### Task 4: Core Aggregator + Shared Core Moves (Critical Blocker B2)

**Files:**
- Create: `server/src/core/platforms/registry.js`
- Create: `server/src/core/data/job-model.js`
- Create: `server/src/core/data/job-status.js`
- Create: `server/src/core/domain/job-transitions.js`
- Create: `server/src/core/http/request-limits.js`
- Modify: current legacy files as re-export adapters
- Test: `server/test/core/core-adapter-compat.test.js`

**Step 1: Write failing adapter-compat tests**

```js
test('legacy model path re-exports core job model', () => {});
test('legacy platform registry path re-exports core registry', () => {});
```

**Step 2: Run tests (expect fail)**

Run:
```bash
npm --prefix server exec node -- --test server/test/core/core-adapter-compat.test.js
```
Expected: FAIL.

**Step 3: Move core files and add adapters**

Rules:
- keep old paths alive as thin re-exports during migration
- all new imports must use `core/*` paths

**Step 4: Re-run tests**

Run:
```bash
npm --prefix server exec node -- --test server/test/core/core-adapter-compat.test.js
npm run check:boundaries
```
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/core/platforms/registry.js server/src/core/data/job-model.js server/src/core/data/job-status.js server/src/core/domain/job-transitions.js server/src/core/http/request-limits.js server/src/models/job.js server/src/platforms/registry.js server/src/constants/job-status.js server/src/domain/job-transitions.js server/src/middleware/request-limits.js server/test/core/core-adapter-compat.test.js
git commit -m "refactor(core): move shared primitives into core with compatibility adapters"
```

Rollback: revert commit; legacy paths still exist.

---

### Task 5: `domainId` Schema + Create/Retry Assignment + Mixed-State Fallback (Critical Blocker B4)

**Files:**
- Modify: `server/src/core/data/job-model.js`
- Modify: `server/src/routes/jobs.js`
- Modify: `server/src/routes/retry.js`
- Create: `server/src/core/dispatch/resolve-domain-id.js`
- Create: `server/src/core/dispatch/route-job-by-domain.js`
- Modify: `server/src/worker/process-job.js`
- Test: `server/test/worker/domain-dispatch-mixed-state.test.js`
- Test: `server/test/routes/domain-id-assignment.test.js`

**Step 1: Write failing tests**

```js
test('new POST /api/jobs assigns domainId from platform map', () => {});
test('retry path preserves or reassigns domainId deterministically', () => {});
test('empty domainId falls back to legacy processing path', () => {});
```

**Step 2: Run tests (expect fail)**

Run:
```bash
npm --prefix server exec node -- --test server/test/routes/domain-id-assignment.test.js
npm --prefix server exec node -- --test server/test/worker/domain-dispatch-mixed-state.test.js
```
Expected: FAIL.

**Step 3: Implement safe routing**

Rules:
- `domainId` default: empty string (compat)
- creation assigns `domainId = platform-${platformId}`
- retry/status mutations preserve/repair missing `domainId`
- worker: empty `domainId` uses legacy fallback, never hard-fail

**Step 4: Re-run tests**

Run:
```bash
npm --prefix server exec node -- --test server/test/routes/domain-id-assignment.test.js
npm --prefix server exec node -- --test server/test/worker/domain-dispatch-mixed-state.test.js
```
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/core/data/job-model.js server/src/routes/jobs.js server/src/routes/retry.js server/src/core/dispatch/resolve-domain-id.js server/src/core/dispatch/route-job-by-domain.js server/src/worker/process-job.js server/test/routes/domain-id-assignment.test.js server/test/worker/domain-dispatch-mixed-state.test.js
git commit -m "feat(dispatch): add domainId assignment and mixed-state safe fallback routing"
```

Rollback: keep legacy fallback active; revert routing helpers if regressions.

---

### Task 6: Queue Drain + Backfill Procedure + Deployment-Skew Tests (Critical RISK-01)

**Files:**
- Create: `server/scripts/backfill-job-domain-id.js`
- Modify: `docs/ops/api-worker-deploy-runbook.md`
- Test: `server/test/worker/domain-backfill-safe-order.test.js`

**Step 1: Write failing backfill/deploy-order tests**

```js
test('worker on new code + api on old code does not poison queue', () => {});
test('backfill updates queued and running jobs safely', () => {});
```

**Step 2: Run tests (expect fail)**

Run:
```bash
npm --prefix server exec node -- --test server/test/worker/domain-backfill-safe-order.test.js
```
Expected: FAIL.

**Step 3: Implement script + runbook sequence**

Runbook must include:
1. pause new job intake
2. drain/observe queue
3. run backfill dry-run
4. run backfill apply
5. resume intake

**Step 4: Re-run tests + dry-run**

Run:
```bash
npm --prefix server exec node -- --test server/test/worker/domain-backfill-safe-order.test.js
node server/scripts/backfill-job-domain-id.js --dry-run
```
Expected: PASS + dry-run report.

**Step 5: Commit**

```bash
git add server/scripts/backfill-job-domain-id.js docs/ops/api-worker-deploy-runbook.md server/test/worker/domain-backfill-safe-order.test.js
git commit -m "ops(migration): add safe queue-drain and domainId backfill procedure"
```

Rollback: rerun with `ENABLE_DOMAIN_KERNEL=false`; no destructive backfill without explicit apply.

---

### Task 7: Platform Behavior Matrix + Worker Strategy Contract (Critical Blockers B2/B3)

**Files:**
- Create: `docs/architecture/platform-behavior-matrix.md`
- Create: `server/src/core/worker/strategy-contract.js`
- Create: `server/test/worker/strategy-contract.test.js`

**Step 1: Write matrix from current behavior**

Must classify:
- X-specific: `403-refresh` branch
- shared: auth fallback, browser-nav fallback, re-extract chain

**Step 2: Define strategy interface contract**

```js
// Strategy returns a delta object; caller applies + saves.
async function executeStrategy(input, ctx) {
  return {
    nextMediaUrl,
    metadataDelta,
    candidateUrlsDelta,
    events: [],
  };
}
```

**Step 3: Write failing contract tests**

```js
test('strategy contract returns serializable delta, not Job mutation', () => {});
```

**Step 4: Run tests (expect fail), then implement contract helper**

Run:
```bash
npm --prefix server exec node -- --test server/test/worker/strategy-contract.test.js
```
Expected: FAIL then PASS after implementation.

**Step 5: Commit**

```bash
git add docs/architecture/platform-behavior-matrix.md server/src/core/worker/strategy-contract.js server/test/worker/strategy-contract.test.js
git commit -m "docs(worker): lock platform behavior matrix and worker strategy interface contract"
```

Rollback: none (docs/contract only).

---

### Task 8: Extract Domain Worker Strategies From `process-job.js` (Real Decoupling)

**Files:**
- Create: `server/src/domains/platform-x/worker-strategy.js`
- Create: `server/src/domains/platform-tiktok/worker-strategy.js`
- Modify: `server/src/worker/process-job.js`
- Modify: `server/src/core/dispatch/route-job-by-domain.js`
- Test: `server/test/worker/platform-strategy-routing.test.js`
- Test: `server/test/services/downloader-fallback.test.js`

**Step 1: Write failing routing/negative tests**

```js
test('x domain executes x strategy for x-specific refresh step', () => {});
test('shared fallbacks remain in core shared flow', () => {});
```

**Step 2: Run tests (expect fail)**

Run:
```bash
npm --prefix server exec node -- --test server/test/worker/platform-strategy-routing.test.js
```
Expected: FAIL.

**Step 3: Extract with contract**

Constraints:
- strategy functions return deltas
- shared fallback chain stays core
- remove direct platform registry coupling from extracted domain logic

**Step 4: Re-run worker tests**

Run:
```bash
npm --prefix server exec node -- --test server/test/worker/platform-strategy-routing.test.js
npm --prefix server exec node -- --test server/test/services/downloader-fallback.test.js
```
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/domains/platform-x/worker-strategy.js server/src/domains/platform-tiktok/worker-strategy.js server/src/worker/process-job.js server/src/core/dispatch/route-job-by-domain.js server/test/worker/platform-strategy-routing.test.js
git commit -m "refactor(worker): extract platform domain strategies via return-delta contract"
```

Rollback: keep `ENABLE_DOMAIN_KERNEL=false`; revert extraction commit.

---

### Task 9: Move API Route Ownership Into Domain Folders (Includes Retry/Status)

**Files:**
- Create: `server/src/domains/jobs/routes.js`
- Create: `server/src/domains/contacts/routes.js`
- Create: `server/src/domains/capabilities/routes.js`
- Create: `server/src/domains/worker-health/routes.js`
- Modify: `server/src/app.js`
- Modify: `server/src/routes/jobs.js`
- Modify: `server/src/routes/retry.js`
- Modify: `server/src/routes/status.js`
- Modify: `server/src/routes/contacts.js`
- Modify: `server/src/routes/worker-health.js`
- Test: `server/test/routes/domain-route-equivalence.test.js`

**Step 1: Write failing equivalence tests**

```js
test('legacy route and domain route response contracts are equivalent', () => {});
```

**Step 2: Run tests (expect fail)**

Run:
```bash
npm --prefix server exec node -- --test server/test/routes/domain-route-equivalence.test.js
```
Expected: FAIL.

**Step 3: Migrate with thin adapters**

Rules:
- domain files own business logic
- legacy route files become adapters only
- retry/status move under jobs domain ownership

**Step 4: Re-run tests**

Run:
```bash
npm --prefix server exec node -- --test server/test/routes/domain-route-equivalence.test.js
npm --prefix server exec node -- --test server/test/routes/telemetry-stream.test.js
npm --prefix server exec node -- --test server/test/routes/worker-health.test.js
```
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/domains/jobs/routes.js server/src/domains/contacts/routes.js server/src/domains/capabilities/routes.js server/src/domains/worker-health/routes.js server/src/app.js server/src/routes/jobs.js server/src/routes/retry.js server/src/routes/status.js server/src/routes/contacts.js server/src/routes/worker-health.js server/test/routes/domain-route-equivalence.test.js
git commit -m "refactor(routes): move jobs/contacts/capabilities/worker-health route ownership to domains"
```

Rollback: adapters keep old entrypoints intact during migration.

---

### Task 10A: Feature Gate Unification + Server Telemetry Ownership

**Files:**
- Create: `server/src/core/state/domain-runtime-state.js`
- Modify: `server/src/routes/helpers/route-utils.js`
- Modify: `server/src/config/platform-capabilities.js`
- Modify: `server/src/lib/telemetry.js`
- Modify: `server/src/lib/logger.js`
- Test: `server/test/routes/domain-gate-unification.test.js`

**Step 1: Write failing server gate tests**

```js
test('degraded domain returns 503 FEATURE_DISABLED at route layer', () => {});
```

**Step 2: Run tests (expect fail)**

Run:
```bash
npm --prefix server exec node -- --test server/test/routes/domain-gate-unification.test.js
```
Expected: FAIL.

**Step 3: Implement and re-run**

Run:
```bash
npm --prefix server exec node -- --test server/test/routes/domain-gate-unification.test.js
npm --prefix server exec node -- --test server/test/lib/telemetry-contract.test.js
```
Expected: PASS.

**Step 4: Commit**

```bash
git add server/src/core/state/domain-runtime-state.js server/src/routes/helpers/route-utils.js server/src/config/platform-capabilities.js server/src/lib/telemetry.js server/src/lib/logger.js server/test/routes/domain-gate-unification.test.js
git commit -m "feat(gating): unify domain health gates with server telemetry ownership tags"
```

Rollback: disable domain kernel flag; revert server gating/telemetry commit.

---

### Task 10B: Activity UI Ownership Visibility + Explicit Client Test Harness

**Files:**
- Modify: `client/package.json`
- Create: `client/vitest.config.js`
- Modify: `client/src/test/setup.js`
- Modify: `client/src/features/activity/ActivityPanel.jsx`
- Modify: `client/src/features/activity/eventTranslator.js`
- Modify: `client/src/features/activity/activity.css`
- Create: `client/src/features/activity/eventTranslator.test.js`

**Step 1: Add explicit test harness setup**

Update `client/package.json` scripts:
- `"test": "vitest run"`
- `"test:watch": "vitest"`

Add dev dependencies:
- `vitest`
- `jsdom`
- `@testing-library/react`
- `@testing-library/jest-dom`

Create `client/vitest.config.js` with jsdom environment and setup file wiring.
Ensure `client/src/test/setup.js` imports `@testing-library/jest-dom`.

**Step 2: Write failing client tests**

```js
test('activity translator shows domain badge label fallback', () => {});
```

**Step 3: Run tests (expect fail)**

Run:
```bash
npm --prefix client run test
```
Expected: FAIL.

**Step 4: Implement and re-run**

Run:
```bash
npm --prefix client run test
npm --prefix client run lint
```
Expected: PASS.

**Step 5: Commit**

```bash
git add client/package.json client/vitest.config.js client/src/test/setup.js client/src/features/activity/ActivityPanel.jsx client/src/features/activity/eventTranslator.js client/src/features/activity/activity.css client/src/features/activity/eventTranslator.test.js
git commit -m "feat(activity): add ownership visibility UI with explicit vitest test harness"
```

Rollback: revert client-only commit without touching server ownership flow.

---

### Task 11: Final Cutover, Remove Adapters, Enforce Ownership

**Files:**
- Modify: `server/src/app.js`
- Modify: `server/src/index.js`
- Delete: legacy adapters no longer needed under `server/src/routes/*`, `server/src/models/*`, etc.
- Modify/Create: `.github/CODEOWNERS`
- Modify: `docs/testing-matrix.md`
- Modify: `docs/ops/api-worker-deploy-runbook.md`

**Step 1: Write failing cutover test**

```js
test('no business logic remains in legacy adapter files', () => {});
```

**Step 2: Run tests (expect fail)**

Run:
```bash
npm --prefix server exec node -- --test server/test/runtime/entrypoint-contract.test.js
```
Expected: FAIL until cutover done.

**Step 3: Cutover**

- set `ENABLE_DOMAIN_KERNEL=true` default
- remove migration allowlist from boundary checker
- remove adapters that overlap ownership
- apply CODEOWNERS by folder

**Step 4: Full verification**

Run:
```bash
npm run check
npm run check:boundaries
npm --prefix server exec node -- --test server/test/config/runtime-role.test.js
npm --prefix server exec node -- --test server/test/runtime/runtime-lifecycle.test.js
npm --prefix server exec node -- --test server/test/runtime/entrypoint-contract.test.js
npm --prefix server exec node -- --test server/test/lib/telemetry-contract.test.js
npm --prefix server exec node -- --test server/test/routes/telemetry-stream.test.js
npm --prefix server exec node -- --test server/test/routes/worker-health.test.js
npm --prefix client run test
npm --prefix client run lint
```
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/app.js server/src/index.js .github/CODEOWNERS docs/testing-matrix.md docs/ops/api-worker-deploy-runbook.md
git commit -m "refactor(ownership): complete strict folder ownership cutover and remove overlap"
```

Rollback: set `ENABLE_DOMAIN_KERNEL=false` and restart; if needed revert cutover commit.

---

## Non-Negotiable Deployment Safeguards

1. Never enable strict domain routing without legacy fallback active.
2. Run queue-drain + backfill procedure before cutover.
3. Keep API/worker deploy order documented and tested for skew.
4. Do not remove adapters until equivalence tests pass.

## Definition Of Done

1. Every business file is owned under one domain folder, no overlap.
2. Core-only files are explicitly inventoried and documented.
3. Boundary checker blocks cross-domain imports.
4. Mixed-state jobs (`domainId` present/missing) process safely during migration.
5. Activity and telemetry clearly identify owning domain per event.
