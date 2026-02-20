# Worker Split Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the remaining correctness gaps in the worker/API split so telemetry, runtime behavior, and docs match intended production operation.

**Architecture:** Keep the current split architecture and singleton telemetry API, then harden it with sink normalization, cross-process dedupe/bootstrap, stricter runtime tests, and accurate ops documentation.

**Tech Stack:** Node.js 20, Express 5, Mongoose, MongoDB, node:test, PowerShell scripts.

---

### Task 1: Normalize Telemetry Sink Values (`mongo` and `mongodb`)

**Files:**
- Modify: `server/src/lib/telemetry.js`
- Test: `server/test/lib/telemetry-contract.test.js`

**Step 1: Write failing tests**

Add tests that verify:
- `TELEMETRY_SINK=mongo` enables mongo mode
- `TELEMETRY_SINK=mongodb` also enables mongo mode

**Step 2: Run tests to verify failure**

Run: `npm --prefix server exec node -- --test server/test/lib/telemetry-contract.test.js`
Expected: FAIL for `mongodb` mode.

**Step 3: Implement minimal fix**

In `telemetry.js`, normalize sink as:
- `mongo` and `mongodb` -> mongo mode
- anything else -> memory mode

**Step 4: Re-run tests**

Run: `npm --prefix server exec node -- --test server/test/lib/telemetry-contract.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/lib/telemetry.js server/test/lib/telemetry-contract.test.js
git commit -m "fix(telemetry): accept mongo and mongodb sink aliases"
```

---

### Task 2: Prevent Duplicate Telemetry Events in Mongo Mode

**Files:**
- Modify: `server/src/lib/telemetry.js`
- Modify: `server/src/lib/logger.js`
- Test: `server/test/lib/telemetry-contract.test.js`

**Step 1: Write failing test**

Add a test that simulates local publish + polled persisted event and asserts only one delivered event for the same logical event id.

**Step 2: Run test to verify failure**

Run: `npm --prefix server exec node -- --test server/test/lib/telemetry-contract.test.js`
Expected: FAIL showing duplicate delivery.

**Step 3: Implement minimal dedupe**

- Add `sourceProcessId` metadata to logger payloads.
- In `telemetry.js`, keep a bounded `seenEventKeys` set/map and skip re-emit if key already seen.
- Keep API contract unchanged.

**Step 4: Re-run tests**

Run: `npm --prefix server exec node -- --test server/test/lib/telemetry-contract.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/lib/telemetry.js server/src/lib/logger.js server/test/lib/telemetry-contract.test.js
git commit -m "fix(telemetry): dedupe mongo-polled events"
```

---

### Task 3: Bootstrap Mongo Telemetry History for API Process

**Files:**
- Modify: `server/src/lib/telemetry.js`
- Test: `server/test/routes/telemetry-stream.test.js`

**Step 1: Write failing test**

Add a test that verifies API process can serve recent persisted events after startup (without requiring a new event publish first).

**Step 2: Run test to verify failure**

Run: `npm --prefix server exec node -- --test server/test/routes/telemetry-stream.test.js`
Expected: FAIL in mongo-mode startup scenario.

**Step 3: Implement minimal bootstrap**

In mongo mode:
- load last N persisted events at startup into ring buffer
- initialize poll watermark from latest loaded event timestamp

**Step 4: Re-run tests**

Run: `npm --prefix server exec node -- --test server/test/routes/telemetry-stream.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/lib/telemetry.js server/test/routes/telemetry-stream.test.js
git commit -m "fix(telemetry): bootstrap API history from mongo sink"
```

---

### Task 4: Correct Runtime/Runbook Contract (`ROLE=combined`, health payload, sink guidance)

**Files:**
- Modify: `docs/ops/api-worker-deploy-runbook.md`
- Modify: `README.md`
- Modify: `docs/issues.md`

**Step 1: Apply doc fixes**

- Remove `ROLE=combined` as a valid runtime value unless code explicitly supports it.
- Document combined mode as `ROLE` unset.
- Fix `/api/health` response example to match actual payload.
- Document `TELEMETRY_SINK` value as `mongo` (or note both aliases if Task 1 implemented).
- Clarify that API process must also run mongo sink for cross-process visibility.

**Step 2: Verify docs vs code**

Run: `rg -n "ROLE=combined|TELEMETRY_SINK|api/health" docs/ops/api-worker-deploy-runbook.md README.md`
Expected: no stale mismatches.

**Step 3: Commit**

```bash
git add docs/ops/api-worker-deploy-runbook.md README.md docs/issues.md
git commit -m "docs(ops): align runbook with actual runtime and telemetry behavior"
```

---

### Task 5: Strengthen Runtime Tests to Validate Behavior, Not File Presence

**Files:**
- Modify: `server/test/runtime/runtime-lifecycle.test.js`
- Modify: `server/test/runtime/entrypoint-contract.test.js`
- Optional: Create `server/test/runtime/start-worker-runtime.behavior.test.js`

**Step 1: Write failing behavior tests**

Cover:
- worker runtime calls `mongoose.connect` before `startQueueWorker`
- worker runtime exits non-zero when `MONGODB_URI` missing
- API runtime does not start queue worker
- root scripts expose split workflow (`dev:split`) and split server scripts

**Step 2: Run tests to verify failure**

Run: `npm --prefix server exec node -- --test server/test/runtime/runtime-lifecycle.test.js`
Expected: FAIL before behavior assertions are added.

**Step 3: Implement/adjust minimal test doubles**

Use require-cache stubs for mongoose/worker modules and assert call order.

**Step 4: Re-run tests**

Run: `npm --prefix server exec node -- --test server/test/runtime/runtime-lifecycle.test.js`
Run: `npm --prefix server exec node -- --test server/test/runtime/entrypoint-contract.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/test/runtime/runtime-lifecycle.test.js server/test/runtime/entrypoint-contract.test.js
git commit -m "test(runtime): verify split startup behavior and call ordering"
```

---

### Task 6: Verification Gate and Split-Mode Smoke Test

**Files:**
- Modify: `docs/testing-matrix.md`

**Step 1: Run automated checks**

1. `npm run check`
2. `npm run check:boundaries`
3. `node --test scripts/test/check-module-boundaries.test.mjs`
4. `npm --prefix server exec node -- --test server/test/config/runtime-role.test.js`
5. `npm --prefix server exec node -- --test server/test/runtime/runtime-lifecycle.test.js`
6. `npm --prefix server exec node -- --test server/test/runtime/entrypoint-contract.test.js`
7. `npm --prefix server exec node -- --test server/test/lib/telemetry-contract.test.js`
8. `npm --prefix server exec node -- --test server/test/routes/telemetry-stream.test.js`
9. `npm --prefix server exec node -- --test server/test/routes/worker-health.test.js`

**Step 2: Run manual split smoke**

- Terminal A: `set ROLE=api && set TELEMETRY_SINK=mongo && npm run dev:api --prefix server`
- Terminal B: `set ROLE=worker && set TELEMETRY_SINK=mongo && npm run dev:worker --prefix server`
- Terminal C: `npm run dev:client`
- Submit one job and confirm:
  - `/api/worker/health` shows recent heartbeat
  - `/api/telemetry/stream` shows worker events once (no duplicates)

**Step 3: Update matrix and commit**

```bash
git add docs/testing-matrix.md
git commit -m "test: record split-mode verification evidence"
```
