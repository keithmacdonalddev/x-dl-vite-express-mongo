# Adversarial Review: Worker-First Service Split and Modularity Guardrails

**Reviewer:** Claude Opus 4.6
**Date:** 2026-02-18
**Plan:** `docs/plans/2026-02-18-worker-early-split-modularity-plan.md`

---

## 1. Executive Summary

The plan proposes splitting the current monolithic `index.js` process into two deployable roles (`api` and `worker`) while adding telemetry persistence, worker heartbeats, and module boundary enforcement. The plan is structurally sound and the task decomposition is logical, but contains several critical assumptions that contradict the actual codebase: the MongoDB connection sequence is inverted (current code starts HTTP before MongoDB connects, but the worker needs MongoDB first), the telemetry MongoDB sink introduces significant write amplification without performance analysis, and the `check.ps1` script is already broken in the working tree (deleted `testing-matrix.md`). **Assessment: CONDITIONAL GO** -- fixable issues, but three critical findings must be addressed before implementation begins.

---

## 2. Intent Adherence Matrix

| Task | Stated Goal | Codebase Reality | Gap? | Risk |
|------|-------------|------------------|------|------|
| 1. Runtime Role Contract | Add `getRuntimeRole()` to `env.js` | `env.js` currently exports only `getServerConfig()`. Adding a function is straightforward. No conflicts. | None | Low |
| 2. Extract Startup Wiring | Split `index.js` into `start-api-runtime.js` and `start-worker-runtime.js`, export `chooseRuntime` from `index.js` | `index.js` is an entry point with side effects (dotenv.config, SIGINT/SIGTERM handlers, DNS override). It requires `./app`, `./worker/queue`, `./worker/process-job`, `./worker/recovery`, and `./services/playwright-adapter`. Exporting from it is an anti-pattern. | YES -- exporting from entry point | Medium |
| 3. Separate Entrypoints | Create `start-api.js`, `start-worker.js`, update scripts | Root `package.json` uses `concurrently` for dev. `scripts/dev.ps1` just calls `npm run dev`. Plan adds a 3-process dev orchestration. | Partial -- plan says modify `dev.ps1` but current dev.ps1 just delegates to root npm. The real change is in root `package.json` scripts. | Low |
| 4. Cross-Process Telemetry | Add MongoDB sink for telemetry, keep SSE working | Telemetry uses in-memory `EventEmitter` + array ring buffer. `subscribeTelemetry()` uses `emitter.on('event')`. SSE endpoint in `app.js` calls `listTelemetry` and `subscribeTelemetry`. Plan proposes `createTelemetryStore()` factory -- this is a breaking API change. | YES -- all existing callers must be updated | High |
| 5. Worker Heartbeat | Write heartbeat on each tick, expose health endpoint | `queue.js` `startQueueWorker` uses `setInterval` at 1s. Adding a MongoDB write on every tick = 86,400 writes/day minimum. | YES -- performance concern | Medium |
| 6. Boundary Checks | Forbid `routes -> services` imports | `routes/jobs.js` does NOT import from `services/`. However, `routes/helpers/route-utils.js` imports file-system utilities. The forbidden edge in the test (`routes/jobs.js -> services/downloader-service.js`) does not currently exist -- this is a valid guard rail. | None -- correctly identifies a boundary that should not be crossed | Low |
| 7. CODEOWNERS + Runbook | Add ownership map and deploy docs | This is a single-developer project. CODEOWNERS requires GitHub branch protection to enforce. | Marginal value | Low |

---

## 3. Critical Findings (MUST FIX before implementation)

### CRIT-1: MongoDB Connection Order is Inverted for Worker Role

**File:** `server/src/index.js` (lines 37-69)

The current `start()` function does NOT block on MongoDB connection before starting the worker:

```js
// Line 44-58: MongoDB connect is fire-and-forget
mongoose.connect(config.mongoUri).then(async () => { ... }).catch(...);

// Line 63-68: Worker starts IMMEDIATELY, before MongoDB is connected
startQueueWorker({ intervalMs: 1000, onTick: async () => { await processOneCycle(); } });
```

The worker survives because `claimNextQueuedJob()` in `queue.js` (line 10) checks `mongoose.connection.readyState !== 1` and bails early. But `recoverStaleJobs()` runs inside the `.then()` callback, meaning recovery only happens after MongoDB connects.

**Risk for the plan:** The `start-worker-runtime.js` module must preserve this exact sequence. If the plan assumes MongoDB is connected before the worker starts, `recoverStaleJobs()` could be called before `mongoose.connect()` resolves, silently returning 0 (the `readyState !== 1` guard in `recovery.js` line 8).

**Fix:** The plan must explicitly document that `start-worker-runtime.js` should either: (a) await `mongoose.connect()` before starting the worker (breaking from current behavior but safer), or (b) preserve the current fire-and-forget pattern with the `readyState` guard. Either choice has implications. Option (a) means the worker process blocks until MongoDB is reachable. Option (b) means recovery runs lazily. The plan does not address this.

### CRIT-2: Telemetry Refactoring Breaks All Existing Callers

**Files:** `server/src/lib/telemetry.js`, `server/src/lib/logger.js`, `server/src/app.js`

The plan proposes changing telemetry from module-level singletons to a factory function (`createTelemetryStore`). Current API:

```js
// telemetry.js exports:
module.exports = { publishTelemetry, subscribeTelemetry, listTelemetry };

// logger.js consumes:
const { publishTelemetry } = require('./telemetry');

// app.js consumes:
const { listTelemetry, subscribeTelemetry } = require('./lib/telemetry');
```

If `createTelemetryStore()` replaces the direct exports, every consumer must change. The plan mentions modifying `logger.js` and `app.js` but does not mention:
- `server/src/worker/queue.js` -- imports `logger` which imports `publishTelemetry`
- `server/src/worker/process-job.js` -- imports `logger`
- `server/src/services/extractor-service.js` -- imports `logger`
- `server/src/routes/jobs.js` -- imports `logger`
- Every other file that uses `logger` (all of them indirectly depend on `publishTelemetry`)

**Fix:** Either (a) keep the module-level singleton API and add a MongoDB sink behind it (non-breaking), or (b) explicitly list every file that needs updating. Option (a) is strongly recommended -- the factory pattern is unnecessary complexity for a module that should remain a singleton.

### CRIT-3: `check.ps1` Already Fails in Working Tree

**File:** `scripts/check.ps1` (line 20)

`check.ps1` requires `docs/testing-matrix.md` to exist. Git status shows this file is deleted (`D docs/testing-matrix.md`). This means:
- `npm run check` currently fails
- `npm run verify` currently fails (it runs `check`)
- Task 7 says "Run `npm run check` -- Expected: FAIL until required runbook references are added." But it's already failing for a different reason.

**Fix:** Either restore `testing-matrix.md` before this plan begins, or update `check.ps1` to remove the stale reference. The plan should not assume `check.ps1` is currently passing.

---

## 4. High Findings (SHOULD FIX)

### HIGH-1: Exporting `chooseRuntime` from Entry Point is an Anti-Pattern

**File:** Task 2 test -- `require('../../src/index')`

`index.js` is the process entry point. It calls `dotenv.config()`, registers SIGINT/SIGTERM handlers, and calls `start()` -- all as side effects on `require()`. The test `require('../../src/index')` will:
1. Load dotenv (reading `.env` file)
2. Call `getServerConfig()` (reading `PORT` and `MONGODB_URI`)
3. Call `start()` which calls `app.listen()`, `mongoose.connect()`, and `startQueueWorker()`
4. Register process signal handlers

This makes the test non-deterministic, potentially starts a real server, and connects to a real database.

**Fix:** Extract `chooseRuntime` into `server/src/config/env.js` alongside `getRuntimeRole` (they are logically related). Do not export from `index.js`. The test should `require('../../src/config/env')` instead.

### HIGH-2: Worker Heartbeat Write Volume

**File:** Task 5 modifies `server/src/worker/queue.js`

Writing `lastHeartbeatAt` to MongoDB on every 1s tick = 86,400 writes/day at minimum. For a free-tier Atlas instance (M0), this consumes a meaningful portion of the 100 ops/sec limit. Even on paid tiers, this is wasteful for a heartbeat.

**Fix:** Reduce heartbeat frequency to every 30s or 60s. The health endpoint can define "stale" as > 2 minutes instead of checking per-second freshness. Alternatively, use an in-memory timestamp and only persist on significant state changes.

### HIGH-3: Smoke Test Will Not Work Reliably on Windows

**File:** Task 3 test -- `spawnSync('node', ['src/start-api.js'], { cwd: 'server', env: { ...process.env, MONGODB_URI: '' } })`

Issues:
1. `cwd: 'server'` is relative. The test runner's CWD may not be the repo root. The plan runs tests via `npm --prefix server exec node --test server/test/...` which sets CWD to `server/`, making `cwd: 'server'` resolve to `server/server/` (nonexistent).
2. The assertion `assert.notEqual(api.status, 1)` -- if the file doesn't exist, `spawnSync` returns status 1. If the file exists but MongoDB fails, it might also return status 1. The test logic is inverted and unclear.
3. Spawning a Node.js process that calls `dotenv.config()` and `mongoose.connect()` in a test is fragile.

**Fix:** Use `fs.existsSync` to verify entry files exist, or use `spawnSync('node', ['-e', 'require("./src/start-api.js")'], { cwd: path.resolve(__dirname, '../../'), timeout: 3000 })` with proper path resolution and a timeout.

### HIGH-4: Graceful Shutdown Must Be Duplicated in Both Runtimes

**File:** `server/src/index.js` (lines 77-129)

The current shutdown handler stops the worker, closes the HTTP server, closes Playwright, and disconnects MongoDB. In a split model:
- `start-api-runtime.js` needs: close HTTP server, disconnect MongoDB
- `start-worker-runtime.js` needs: stop worker, close Playwright, disconnect MongoDB

The plan does not mention shutdown handling at all. If SIGINT/SIGTERM handlers are not duplicated into both runtime modules, the worker process will have no graceful shutdown and the API process will try to stop a worker that was never started.

**Fix:** Add explicit shutdown handler design to Tasks 2 and 3. Each runtime module must register its own SIGINT/SIGTERM handlers with role-appropriate cleanup.

---

## 5. Medium Findings (CONSIDER)

### MED-1: CODEOWNERS Has Marginal Value for Single-Developer Project

Task 7 creates a `CODEOWNERS` file. This file only has effect when:
- GitHub branch protection is enabled with "Require review from Code Owners"
- Multiple developers exist to assign reviews

For a single-developer project, CODEOWNERS is documentation-as-code at best. Consider replacing with a comment in `CLAUDE.md` (which already has a file ownership section) rather than creating a new file.

### MED-2: `scripts/dev.ps1` Conflict with Root `package.json` `dev` Script

The current `scripts/dev.ps1` just calls `npm run dev`. The root `dev` script uses `concurrently` to run client + server. If the plan modifies `dev.ps1` to do 3-process orchestration directly in PowerShell AND also modifies the root `package.json` `dev` script, there will be two competing orchestration mechanisms. The plan should pick one.

### MED-3: Test Infrastructure Assumption

The plan assumes `node:test` works. While `node:test` is built into Node.js 20+, the current `server/package.json` has `"test": "echo \"Tests disabled\""`. The test commands in the plan use `npm --prefix server exec node --test <path>` which bypasses the npm test script and calls Node directly. This works, but:
- Running `npm test` will still echo "Tests disabled"
- The new tests won't be discoverable via the standard test command
- Consider updating `server/package.json` test script to `node --test server/test/**/*.test.js` or keeping it disabled but documenting the direct invocation pattern

### MED-4: `createTelemetryStore` Memory Sink Test Doesn't Validate SSE Continuity

Task 4's test creates a memory-backed store and tests `publish`/`list`. It does not test that the SSE endpoint in `app.js` still works after the refactoring. The SSE endpoint uses `subscribeTelemetry` which relies on the `EventEmitter` pattern. If the store abstraction replaces this with a MongoDB change stream or polling mechanism, SSE real-time delivery could break silently.

### MED-5: Plan References `docs/architecture/module-boundaries.md` -- New Directory

Task 6 creates `docs/architecture/module-boundaries.md`. The `docs/` directory exists but `docs/architecture/` does not. This is fine (mkdir is trivial), but the plan should note this is a new directory structure.

---

## 6. Positive Findings

1. **Task decomposition is logical.** Each task builds on the previous one, and the dependencies are correctly ordered (role contract before runtime split, runtime split before entrypoints, entrypoints before telemetry, etc.).

2. **The `routes -> services` boundary check is correct.** Verified: `server/src/routes/jobs.js` does NOT import from `server/src/services/`. The import chain is `routes -> models, routes -> utils, routes -> lib, routes -> config, routes -> platforms, routes -> helpers`. Services are only imported by `server/src/worker/process-job.js`. This is a clean boundary worth enforcing.

3. **The `getRuntimeRole()` function design is sensible.** Defaulting to `'api'` is backwards-compatible. Accepting an env object parameter makes it testable without mutating `process.env`.

4. **The rollout sequence is safe.** Defaulting to `ROLE=api` means existing deployments continue working unchanged. The worker role must be explicitly opted into.

5. **TDD approach is commendable.** Each task starts with a failing test. While some test designs need adjustment (see HIGH-1, HIGH-3), the discipline of test-first is correct for infrastructure changes.

6. **The plan correctly identifies that SSE telemetry must survive the split.** Task 4 addresses the hardest problem (cross-process telemetry visibility) head-on rather than deferring it.

---

## 7. Go/No-Go Recommendation

**CONDITIONAL GO** with the following mandatory fixes before implementation:

### Must Fix (Blockers)

| ID | Fix | Effort |
|----|-----|--------|
| CRIT-1 | Document MongoDB connection order for worker runtime. Decide await vs. fire-and-forget explicitly. | 15 min (design decision + plan update) |
| CRIT-2 | Change Task 4 approach: keep singleton telemetry API, add MongoDB sink internally. Do not introduce factory pattern. | 30 min (plan rewrite for Task 4) |
| CRIT-3 | Fix or remove `testing-matrix.md` reference in `check.ps1` before starting this plan. | 5 min |
| HIGH-1 | Move `chooseRuntime` to `config/env.js`, not `index.js`. Fix Task 2 test to not require the entry point. | 15 min (plan update) |
| HIGH-4 | Add explicit shutdown handler design to Tasks 2 and 3. | 20 min (plan update) |

### Should Fix (Non-Blockers)

| ID | Fix | Effort |
|----|-----|--------|
| HIGH-2 | Reduce heartbeat frequency to 30-60s | 5 min (plan update) |
| HIGH-3 | Fix smoke test CWD and assertion logic | 15 min (plan update) |
| MED-3 | Update server test script or document direct invocation pattern | 5 min |

### Answers to Adversarial Questions

1. **What happens if you start the worker without MongoDB?** The current code handles this: `claimNextQueuedJob()` checks `mongoose.connection.readyState` and skips. The plan must preserve this guard. The worker will spin idle until MongoDB connects.

2. **Does the split preserve MongoDB-before-worker order?** No. Current code starts both concurrently (MongoDB connect is not awaited). The plan does not address this. See CRIT-1.

3. **Performance impact of MongoDB telemetry sink?** Every `logger.info()` and `logger.error()` call will write to MongoDB. The extractor service alone emits 6-8 telemetry events per job. With worker heartbeats, this is potentially hundreds of writes per minute. For Atlas free tier, this could hit rate limits. The plan should add a batching/buffering strategy or make the MongoDB sink opt-in.

4. **86,400 heartbeat writes/day -- acceptable?** Marginal for free tier, fine for paid. But unnecessary at 1s granularity. See HIGH-2.

5. **`scripts/dev.ps1` conflict?** Yes, potentially. Current `dev.ps1` delegates to `npm run dev`. If both are modified, there are two orchestration paths. See MED-2.

6. **Exporting from entry point?** Anti-pattern. See HIGH-1.

7. **Smoke test on Windows?** Will fail due to CWD resolution. See HIGH-3. `spawnSync` itself works fine on Windows, but the relative `cwd: 'server'` will resolve incorrectly when tests run from `server/` directory.
