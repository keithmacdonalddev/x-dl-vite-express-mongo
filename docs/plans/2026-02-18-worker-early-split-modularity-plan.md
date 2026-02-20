# Worker-First Service Split and Modularity Guardrails Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split API and worker into separate deployable processes while keeping the client job log stream working and reducing cross-team coupling risk.

**Architecture:** Keep one repo and one MongoDB. Run two server roles: `api` and `worker`. Preserve current telemetry module contract (`publishTelemetry`, `subscribeTelemetry`, `listTelemetry`) so callers do not break, then add shared persistence/bridging behind that contract for cross-process visibility.

**Tech Stack:** Node.js 20, Express 5, Mongoose, MongoDB, Playwright, node:test, PowerShell scripts.

---

## Scope and Non-Goals

- In scope: process split, explicit runtime lifecycle, telemetry continuity for UI log stream, worker health checks, module boundary checks, ops docs.
- Not in scope: multi-repo decomposition, full microservices architecture, queue technology migration.

## Design Decisions (Locked Before Implementation)

1. Worker runtime will **await MongoDB connect** before starting queue/recovery. If DB is unavailable, worker fails fast.
2. API runtime will keep non-blocking startup behavior for HTTP, with async DB connect.
3. Telemetry module stays a singleton API surface; storage strategy changes are internal.
4. Worker heartbeat persistence interval is **30s**; stale threshold is **120s**.
5. `scripts/dev.ps1` remains a simple wrapper around `npm run dev`; orchestration lives in root `package.json`.

---

### Task 0: Baseline Verification Preflight (Unblock Existing Checks)

**Files:**
- Create: `docs/testing-matrix.md`
- Modify: `scripts/check.ps1` (only if restoring file is not desired)

**Step 1: Confirm current failure mode**

Run: `npm run check`  
Expected: FAIL because `docs/testing-matrix.md` is missing.

**Step 2: Write minimal fix**

Create `docs/testing-matrix.md` with current testing status and commands.

**Step 3: Re-run check**

Run: `npm run check`  
Expected: PASS for baseline checklist file existence.

**Step 4: Commit**

```bash
git add docs/testing-matrix.md
git commit -m "docs: restore testing matrix required by check script"
```

---

### Task 1: Runtime Role Contract in Config Module

**Files:**
- Modify: `server/src/config/env.js`
- Test: `server/test/config/runtime-role.test.js`

**Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { getRuntimeRole, chooseRuntime } = require('../../src/config/env');

test('defaults to api role when ROLE is missing', () => {
  assert.equal(getRuntimeRole({}), 'api');
});

test('accepts worker role when ROLE=worker', () => {
  assert.equal(getRuntimeRole({ ROLE: 'worker' }), 'worker');
});

test('chooseRuntime maps to runtime id without loading entrypoint', () => {
  assert.equal(chooseRuntime({ ROLE: 'worker' }), 'worker');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix server exec node --test server/test/config/runtime-role.test.js`  
Expected: FAIL before functions are added.

**Step 3: Write minimal implementation**

```js
function getRuntimeRole(input = process.env) {
  const raw = String(input.ROLE || input.PROCESS_ROLE || 'api').trim().toLowerCase();
  return raw === 'worker' ? 'worker' : 'api';
}

function chooseRuntime(input = process.env) {
  return getRuntimeRole(input) === 'worker' ? 'worker' : 'api';
}
```

**Step 4: Run test to verify pass**

Run: `npm --prefix server exec node --test server/test/config/runtime-role.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/config/env.js server/test/config/runtime-role.test.js
git commit -m "feat(server): add runtime role selection helpers in config module"
```

---

### Task 2: Split Runtime Modules With Role-Specific Shutdown

**Files:**
- Create: `server/src/runtime/start-api-runtime.js`
- Create: `server/src/runtime/start-worker-runtime.js`
- Create: `server/src/runtime/register-shutdown.js`
- Modify: `server/src/index.js`
- Test: `server/test/runtime/runtime-lifecycle.test.js`

**Step 1: Write failing lifecycle tests**

Test cases:
- API runtime starts HTTP and registers shutdown.
- Worker runtime requires MongoDB and registers shutdown.
- Worker runtime starts queue only after successful Mongo connect.
- Worker runtime shutdown stops queue and closes Playwright.

**Step 2: Run tests to confirm failure**

Run: `npm --prefix server exec node --test server/test/runtime/runtime-lifecycle.test.js`  
Expected: FAIL before runtime modules exist.

**Step 3: Implement minimal runtime split**

- `start-api-runtime.js`:
  - starts HTTP server
  - runs Mongo connect asynchronously (non-blocking)
  - no queue startup
- `start-worker-runtime.js`:
  - awaits `mongoose.connect()`
  - then runs `recoverStaleJobs()`
  - then starts queue poller
  - exits non-zero if DB connect fails
- `register-shutdown.js`:
  - shared helper to attach SIGINT/SIGTERM handlers per role cleanup

**Step 4: Re-run lifecycle tests**

Run: `npm --prefix server exec node --test server/test/runtime/runtime-lifecycle.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/runtime/start-api-runtime.js server/src/runtime/start-worker-runtime.js server/src/runtime/register-shutdown.js server/src/index.js server/test/runtime/runtime-lifecycle.test.js
git commit -m "refactor(runtime): split api and worker lifecycle with explicit shutdown handlers"
```

---

### Task 3: Add Dedicated Entrypoints and Scripts (Stable Cross-Platform Tests)

**Files:**
- Create: `server/src/start-api.js`
- Create: `server/src/start-worker.js`
- Modify: `server/package.json`
- Modify: `package.json`
- Test: `server/test/runtime/entrypoint-contract.test.js`

**Step 1: Write failing contract test**

Use `fs.existsSync` and JSON script checks (no `spawnSync` boot of full runtime):
- `server/src/start-api.js` exists
- `server/src/start-worker.js` exists
- `server/package.json` has `dev:api`, `dev:worker`, `start:api`, `start:worker`
- root `package.json` `dev` includes API + worker + client orchestration

**Step 2: Run test to verify failure**

Run: `npm --prefix server exec node --test server/test/runtime/entrypoint-contract.test.js`  
Expected: FAIL before files/scripts exist.

**Step 3: Implement minimal scripts**

- `server/package.json`:
  - `dev:api`, `dev:worker`, `start:api`, `start:worker`
- root `package.json`:
  - `dev` runs `dev:api`, `dev:worker`, `dev:client`
  - keep `scripts/dev.ps1` as wrapper only

**Step 4: Verify**

Run: `npm --prefix server exec node --test server/test/runtime/entrypoint-contract.test.js`  
Run: `npm run dev`  
Expected: tests pass and all three processes start.

**Step 5: Commit**

```bash
git add server/src/start-api.js server/src/start-worker.js server/package.json package.json server/test/runtime/entrypoint-contract.test.js
git commit -m "feat(runtime): add explicit api and worker entrypoints and scripts"
```

---

### Task 4: Preserve Telemetry Contract and Restore Cross-Process Job Log Stream

**Files:**
- Create: `server/src/models/telemetry-event.js`
- Modify: `server/src/lib/telemetry.js`
- Modify: `server/src/lib/logger.js`
- Modify: `server/src/app.js`
- Test: `server/test/lib/telemetry-contract.test.js`
- Test: `server/test/routes/telemetry-stream.test.js`

**Step 1: Write failing contract tests**

Test A (module contract):
- `telemetry.js` still exports `publishTelemetry`, `subscribeTelemetry`, `listTelemetry`.

Test B (cross-process visibility):
- event persisted by worker-role logger appears in API telemetry query/stream path.

**Step 2: Run tests to verify failure**

Run: `npm --prefix server exec node --test server/test/lib/telemetry-contract.test.js`  
Run: `npm --prefix server exec node --test server/test/routes/telemetry-stream.test.js`  
Expected: FAIL before persistence/bridge exists.

**Step 3: Implement minimal non-breaking telemetry changes**

- Keep existing function exports unchanged.
- Add optional sink mode in module internals:
  - `TELEMETRY_SINK=memory|mongo` (default `memory`)
- Worker and API both call `publishTelemetry` as before.
- In API process with mongo sink enabled:
  - `listTelemetry` reads from shared store.
  - `subscribeTelemetry` keeps EventEmitter for local events and includes bridge logic to forward newly persisted external events to stream subscribers.
- Keep API response schema unchanged for `GET /api/telemetry` and `/api/telemetry/stream`.

**Step 4: Run telemetry tests**

Run: `npm --prefix server exec node --test server/test/lib/telemetry-contract.test.js`  
Run: `npm --prefix server exec node --test server/test/routes/telemetry-stream.test.js`  
Expected: PASS with unchanged client-facing contract.

**Step 5: Commit**

```bash
git add server/src/models/telemetry-event.js server/src/lib/telemetry.js server/src/lib/logger.js server/src/app.js server/test/lib/telemetry-contract.test.js server/test/routes/telemetry-stream.test.js
git commit -m "feat(telemetry): keep singleton contract and add cross-process stream visibility"
```

---

### Task 5: Worker Liveness Endpoint With 30s Heartbeat

**Files:**
- Create: `server/src/models/worker-heartbeat.js`
- Modify: `server/src/worker/queue.js`
- Create: `server/src/routes/worker-health.js`
- Modify: `server/src/app.js`
- Test: `server/test/routes/worker-health.test.js`

**Step 1: Write failing tests**

Cases:
- healthy when heartbeat age <= 120000 ms
- unhealthy when heartbeat age > 120000 ms
- heartbeat write occurs on 30s cadence, not every queue tick

**Step 2: Run tests to verify failure**

Run: `npm --prefix server exec node --test server/test/routes/worker-health.test.js`  
Expected: FAIL before route/model/timing logic exists.

**Step 3: Implement minimal solution**

- Update heartbeat only every 30s.
- Add `GET /api/worker/health` payload:
  - `ok`
  - `lastHeartbeatAt`
  - `ageMs`
  - `staleAfterMs`

**Step 4: Re-run tests**

Run: `npm --prefix server exec node --test server/test/routes/worker-health.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/models/worker-heartbeat.js server/src/worker/queue.js server/src/routes/worker-health.js server/src/app.js server/test/routes/worker-health.test.js
git commit -m "feat(monitoring): add worker heartbeat health endpoint with low-write cadence"
```

---

### Task 6: Enforce Module Boundaries (New `docs/architecture/`)

**Files:**
- Create: `docs/architecture/module-boundaries.md`
- Create: `scripts/check-module-boundaries.mjs`
- Create: `scripts/test/check-module-boundaries.test.mjs`
- Modify: `scripts/check.ps1`
- Modify: `package.json`

**Step 1: Write failing checker test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateImports } from '../check-module-boundaries.mjs';

test('flags forbidden edge: routes -> services', () => {
  const violations = evaluateImports([{ from: 'server/src/routes/jobs.js', to: 'server/src/services/downloader-service.js' }]);
  assert.equal(violations.length, 1);
});
```

**Step 2: Run test to verify failure**

Run: `node --test scripts/test/check-module-boundaries.test.mjs`  
Expected: FAIL because checker is missing.

**Step 3: Implement checker + doc**

- Define allowed and forbidden edges in `docs/architecture/module-boundaries.md`.
- Add root script: `check:boundaries`.
- Wire `scripts/check.ps1` to call boundary checks.

**Step 4: Re-run checks**

Run: `node --test scripts/test/check-module-boundaries.test.mjs`  
Run: `npm run check:boundaries`  
Expected: PASS.

**Step 5: Commit**

```bash
git add docs/architecture/module-boundaries.md scripts/check-module-boundaries.mjs scripts/test/check-module-boundaries.test.mjs scripts/check.ps1 package.json
git commit -m "chore(architecture): enforce server module dependency boundaries"
```

---

### Task 7: Ownership + Ops Runbook (Team Responsibility Focus)

**Files:**
- Create: `docs/ops/api-worker-deploy-runbook.md`
- Create: `docs/ownership/team-responsibilities.md`
- Modify: `README.md`
- Modify: `docs/issues.md`
- Optional: `CODEOWNERS` (if branch protections will enforce it)

**Step 1: Add ownership docs**

- Define the 6 server responsibility areas:
  - Server Shell
  - Data Model
  - Routes
  - Platforms
  - Worker/Queue
  - Services
- Define allowed interfaces and escalation paths.

**Step 2: Add deploy runbook**

- startup commands for API and worker
- health checks and telemetry checks
- rollback steps

**Step 3: Verify docs/check**

Run: `npm run check`  
Expected: PASS.

**Step 4: Commit**

```bash
git add docs/ops/api-worker-deploy-runbook.md docs/ownership/team-responsibilities.md README.md docs/issues.md
git commit -m "docs(ops): add split-runtime runbook and team responsibility map"
```

---

## Verification Gate (Before Merge)

Run and capture output:

1. `npm run check`
2. `npm --prefix server exec node --test server/test/config/runtime-role.test.js`
3. `npm --prefix server exec node --test server/test/runtime/runtime-lifecycle.test.js`
4. `npm --prefix server exec node --test server/test/runtime/entrypoint-contract.test.js`
5. `npm --prefix server exec node --test server/test/lib/telemetry-contract.test.js`
6. `npm --prefix server exec node --test server/test/routes/telemetry-stream.test.js`
7. `npm --prefix server exec node --test server/test/routes/worker-health.test.js`
8. `node --test scripts/test/check-module-boundaries.test.mjs`
9. `npm run check:boundaries`
10. `npm run dev` (manual smoke: API + worker + client all start; client log stream shows worker events)

## Rollout Sequence

1. Ship runtime split with `ROLE=api` default and worker disabled in API process.
2. Deploy worker service in staging with `ROLE=worker`.
3. Enable telemetry shared sink in staging and verify client log stream includes worker events.
4. Validate worker health endpoint and stale alerting.
5. Cut production over to split runtime and keep combined-mode rollback release available.
