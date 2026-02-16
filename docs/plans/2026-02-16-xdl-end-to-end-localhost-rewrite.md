# x-dl Localhost Rewrite (Vite + Express + Mongo, JS) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-ready localhost app that accepts X/Twitter URLs, runs extraction/download jobs, tracks status in MongoDB, and exposes a clean UI for creating and monitoring jobs.

**Architecture:** Keep a split architecture with `client/` (Vite + React) and `server/` (Express + Mongoose). The server owns job state, validation, queue orchestration, extraction/downloading services, and persistence. The client stays thin: it submits jobs, polls/streams status, and renders progress/errors.

**Tech Stack:** JavaScript, Node.js, Express, Mongoose, MongoDB Atlas, Playwright, ffmpeg (child_process), Vite, React, node:test, supertest, mongodb-memory-server, Vitest + Testing Library.

---

## Current Baseline (Already Present)

- `POST /api/jobs` exists and persists a queued job.
- Basic health endpoint and Vite proxy are in place.
- One backend route test suite exists.

This plan continues from that baseline and finishes the end-to-end product.

## Tiered Delivery Map

- **Tier 1 (Foundation):** Tasks 1-4
- **Tier 2 (Core Pipeline):** Tasks 5-8
- **Tier 3 (Reliability + Security):** Tasks 9-11
- **Tier 4 (Productization):** Tasks 12-14

---

### Task 1: Server Runtime and Config Contract

**Files:**
- Create: `server/src/config/env.js`
- Modify: `server/src/index.js`
- Test: `server/test/env.config.test.js`

**Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

test('getServerConfig returns defaults when optional vars are missing', () => {
  const { getServerConfig } = require('../src/config/env');
  const cfg = getServerConfig({ PORT: '', MONGODB_URI: '' });
  assert.equal(cfg.port, 4000);
  assert.equal(cfg.mongoUri, '');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix server exec node --test server/test/env.config.test.js`  
Expected: FAIL with module/function not found.

**Step 3: Write minimal implementation**

```js
function getServerConfig(input = process.env) {
  return {
    port: Number(input.PORT || 4000),
    mongoUri: input.MONGODB_URI || '',
  };
}
module.exports = { getServerConfig };
```

**Step 4: Run tests to verify pass**

Run: `npm --prefix server exec node --test server/test/env.config.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/config/env.js server/src/index.js server/test/env.config.test.js
git commit -m "feat(server): add explicit runtime config contract"
```

---

### Task 2: Job Domain Model (Full Metadata)

**Files:**
- Modify: `server/src/models/job.js`
- Create: `server/src/constants/job-status.js`
- Test: `server/test/job.model.test.js`

**Step 1: Write the failing test**

```js
test('new job defaults to queued status and zero progress', async () => {
  const { Job } = require('../src/models/job');
  const doc = await Job.create({ tweetUrl: 'https://x.com/u/status/1' });
  assert.equal(doc.status, 'queued');
  assert.equal(doc.progressPct, 0);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix server exec node --test server/test/job.model.test.js`  
Expected: FAIL because `progressPct` or fields are missing.

**Step 3: Write minimal implementation**

Add fields to schema:
- `progressPct` (0-100 default 0)
- `attemptCount` (default 0)
- `sourceType` (`direct|hls|unknown`)
- `startedAt`, `completedAt`, `failedAt`
- indexes for `{ status: 1, createdAt: 1 }`

**Step 4: Run tests to verify pass**

Run: `npm --prefix server exec node --test server/test/job.model.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/models/job.js server/src/constants/job-status.js server/test/job.model.test.js
git commit -m "feat(server): expand job schema for lifecycle metadata"
```

---

### Task 3: Read APIs for Jobs (List + Detail)

**Files:**
- Modify: `server/src/routes/jobs.js`
- Test: `server/test/jobs.read-routes.test.js`

**Step 1: Write the failing test**

```js
test('GET /api/jobs returns newest-first job list', async () => {
  const response = await request(app).get('/api/jobs');
  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.body.jobs), true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix server exec node --test server/test/jobs.read-routes.test.js`  
Expected: FAIL with 404.

**Step 3: Write minimal implementation**

Add routes:
- `GET /api/jobs?status=&limit=`
- `GET /api/jobs/:id`

Return shape:

```json
{ "ok": true, "jobs": [] }
```

**Step 4: Run tests to verify pass**

Run: `npm --prefix server exec node --test server/test/jobs.read-routes.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/routes/jobs.js server/test/jobs.read-routes.test.js
git commit -m "feat(api): add jobs list and detail read routes"
```

---

### Task 4: Status Transition Rules (Start, Fail, Complete, Cancel)

**Files:**
- Create: `server/src/domain/job-transitions.js`
- Modify: `server/src/routes/jobs.js`
- Test: `server/test/job-transitions.test.js`

**Step 1: Write the failing test**

```js
test('queued job can transition to running but not completed directly', () => {
  const { canTransition } = require('../src/domain/job-transitions');
  assert.equal(canTransition('queued', 'running'), true);
  assert.equal(canTransition('queued', 'completed'), false);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix server exec node --test server/test/job-transitions.test.js`  
Expected: FAIL (module/function missing).

**Step 3: Write minimal implementation**

Implement transition matrix and apply it in API/service mutation points.

**Step 4: Run tests to verify pass**

Run: `npm --prefix server exec node --test server/test/job-transitions.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/domain/job-transitions.js server/src/routes/jobs.js server/test/job-transitions.test.js
git commit -m "feat(domain): enforce deterministic job status transitions"
```

---

### Task 5: Worker Queue Skeleton (Poller + Claim)

**Files:**
- Create: `server/src/worker/queue.js`
- Modify: `server/src/index.js`
- Test: `server/test/queue.claim.test.js`

**Step 1: Write the failing test**

```js
test('claimNextQueuedJob marks one queued record as running', async () => {
  const claimed = await claimNextQueuedJob();
  assert.equal(claimed.status, 'running');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix server exec node --test server/test/queue.claim.test.js`  
Expected: FAIL because queue module does not exist.

**Step 3: Write minimal implementation**

Use `findOneAndUpdate` with atomic filter `{ status: 'queued' }` -> set `running`.

**Step 4: Run tests to verify pass**

Run: `npm --prefix server exec node --test server/test/queue.claim.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/worker/queue.js server/src/index.js server/test/queue.claim.test.js
git commit -m "feat(worker): add atomic queued-job claiming"
```

---

### Task 6: Extractor Service Contract (Playwright Boundary)

**Files:**
- Create: `server/src/services/extractor-service.js`
- Test: `server/test/extractor-service.test.js`

**Step 1: Write the failing test**

```js
test('extractFromTweet returns direct media URL payload shape', async () => {
  const data = await extractFromTweet('https://x.com/u/status/1', { pageFactory: fakeFactory });
  assert.equal(typeof data.mediaUrl, 'string');
  assert.match(data.mediaUrl, /^https?:\/\//);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix server exec node --test server/test/extractor-service.test.js`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement service with dependency injection (`pageFactory`) so tests do not open real browsers.

**Step 4: Run tests to verify pass**

Run: `npm --prefix server exec node --test server/test/extractor-service.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/services/extractor-service.js server/test/extractor-service.test.js
git commit -m "feat(services): add extractor service contract with DI boundary"
```

---

### Task 7: Downloader Service Contract (Direct + HLS)

**Files:**
- Create: `server/src/services/downloader-service.js`
- Test: `server/test/downloader-service.test.js`

**Step 1: Write the failing test**

```js
test('chooseDownloadMode selects hls mode for m3u8 URLs', () => {
  const mode = chooseDownloadMode('https://video.twimg.com/.../playlist.m3u8');
  assert.equal(mode, 'hls');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix server exec node --test server/test/downloader-service.test.js`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement:
- `chooseDownloadMode(url)`
- `downloadDirect(...)`
- `downloadHlsWithFfmpeg(...)`
- unified `downloadMedia(...)`

**Step 4: Run tests to verify pass**

Run: `npm --prefix server exec node --test server/test/downloader-service.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/services/downloader-service.js server/test/downloader-service.test.js
git commit -m "feat(services): add direct and hls download strategy layer"
```

---

### Task 8: End-to-End Job Processing Flow (Server Integration)

**Files:**
- Create: `server/src/worker/process-job.js`
- Modify: `server/src/worker/queue.js`
- Test: `server/test/job-processing.integration.test.js`

**Step 1: Write the failing test**

```js
test('processing a queued job sets completed status and outputPath', async () => {
  const result = await processOneCycle(fakeExtractor, fakeDownloader);
  assert.equal(result.status, 'completed');
  assert.ok(result.outputPath);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix server exec node --test server/test/job-processing.integration.test.js`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Pipeline:
1. claim queued job
2. extract media URL
3. download media
4. mark completed or failed

**Step 4: Run tests to verify pass**

Run: `npm --prefix server exec node --test server/test/job-processing.integration.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/worker/process-job.js server/src/worker/queue.js server/test/job-processing.integration.test.js
git commit -m "feat(worker): wire extraction and download processing flow"
```

---

### Task 9: API Security and Input Hardening

**Files:**
- Create: `server/src/middleware/request-limits.js`
- Modify: `server/src/app.js`
- Test: `server/test/security.validation.test.js`

**Step 1: Write the failing test**

```js
test('rejects oversize payloads for jobs endpoint', async () => {
  const response = await request(app).post('/api/jobs').send({ tweetUrl: 'x'.repeat(20000) });
  assert.equal(response.status, 413);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix server exec node --test server/test/security.validation.test.js`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Add:
- strict JSON body limit
- URL length guard
- localhost-only CORS policy for dev

**Step 4: Run tests to verify pass**

Run: `npm --prefix server exec node --test server/test/security.validation.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/middleware/request-limits.js server/src/app.js server/test/security.validation.test.js
git commit -m "feat(security): enforce request and input hardening"
```

---

### Task 10: Structured Logging and Error Catalog

**Files:**
- Create: `server/src/lib/logger.js`
- Create: `server/src/lib/error-codes.js`
- Modify: `server/src/routes/jobs.js`
- Test: `server/test/error-responses.test.js`

**Step 1: Write the failing test**

```js
test('invalid tweet url returns standardized error payload', async () => {
  const response = await request(app).post('/api/jobs').send({ tweetUrl: 'bad' });
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, 'INVALID_TWEET_URL');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix server exec node --test server/test/error-responses.test.js`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Return standardized errors:

```json
{ "ok": false, "code": "INVALID_TWEET_URL", "error": "..." }
```

**Step 4: Run tests to verify pass**

Run: `npm --prefix server exec node --test server/test/error-responses.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/lib/logger.js server/src/lib/error-codes.js server/src/routes/jobs.js server/test/error-responses.test.js
git commit -m "feat(api): standardize error payloads and logging hooks"
```

---

### Task 11: Recovery on Restart (Orphaned Running Jobs)

**Files:**
- Create: `server/src/worker/recovery.js`
- Modify: `server/src/index.js`
- Test: `server/test/recovery.test.js`

**Step 1: Write the failing test**

```js
test('startup recovery converts stale running jobs to failed', async () => {
  const count = await recoverStaleJobs({ maxAgeMs: 1000 });
  assert.equal(count, 1);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix server exec node --test server/test/recovery.test.js`  
Expected: FAIL.

**Step 3: Write minimal implementation**

At startup:
- find `running` jobs older than threshold
- mark `failed` with reason `RECOVERED_FROM_RESTART`

**Step 4: Run tests to verify pass**

Run: `npm --prefix server exec node --test server/test/recovery.test.js`  
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/worker/recovery.js server/src/index.js server/test/recovery.test.js
git commit -m "feat(worker): add restart recovery for stale running jobs"
```

---

### Task 12: Client API Layer and Jobs Dashboard

**Files:**
- Create: `client/src/api/jobsApi.js`
- Create: `client/src/components/JobsPage.jsx`
- Modify: `client/src/App.jsx`
- Test: `client/src/components/JobsPage.test.jsx`

**Step 1: Write the failing test**

```jsx
it('renders jobs returned by the API client', async () => {
  render(<JobsPage />);
  expect(await screen.findByText(/queued/i)).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix client exec vitest run client/src/components/JobsPage.test.jsx`  
Expected: FAIL (test setup/component missing).

**Step 3: Write minimal implementation**

Create API helpers:
- `createJob(tweetUrl)`
- `listJobs()`
- `getJob(id)`

Render:
- URL submit form
- jobs list with status and timestamps

**Step 4: Run tests to verify pass**

Run: `npm --prefix client exec vitest run client/src/components/JobsPage.test.jsx`  
Expected: PASS.

**Step 5: Commit**

```bash
git add client/src/api/jobsApi.js client/src/components/JobsPage.jsx client/src/App.jsx client/src/components/JobsPage.test.jsx
git commit -m "feat(client): add jobs dashboard and API integration"
```

---

### Task 13: Progress Updates (Polling or SSE)

**Files:**
- Create: `client/src/hooks/useJobsPolling.js`
- Modify: `client/src/components/JobsPage.jsx`
- Test: `client/src/hooks/useJobsPolling.test.jsx`

**Step 1: Write the failing test**

```jsx
it('refreshes jobs list on interval', async () => {
  const { result } = renderHook(() => useJobsPolling({ intervalMs: 1000 }));
  expect(result.current.jobs.length).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix client exec vitest run client/src/hooks/useJobsPolling.test.jsx`  
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement polling hook with cleanup:
- `setInterval` + refetch
- cancel on unmount

**Step 4: Run tests to verify pass**

Run: `npm --prefix client exec vitest run client/src/hooks/useJobsPolling.test.jsx`  
Expected: PASS.

**Step 5: Commit**

```bash
git add client/src/hooks/useJobsPolling.js client/src/components/JobsPage.jsx client/src/hooks/useJobsPolling.test.jsx
git commit -m "feat(client): add live job progress polling"
```

---

### Task 14: Final Verification Matrix, Docs, and Release Scripts

**Files:**
- Modify: `README.md`
- Create: `docs/testing-matrix.md`
- Create: `scripts/dev.ps1`
- Create: `scripts/check.ps1`
- Modify: `package.json`

**Step 1: Write the failing verification checklist test**

Create a script check that fails if required commands are missing from `package.json` (`dev`, `build`, `test`).

**Step 2: Run check to verify it fails**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`  
Expected: FAIL until commands/docs are complete.

**Step 3: Write minimal implementation**

Add:
- consolidated verification commands
- README runbook
- testing matrix (unit/integration/manual)

**Step 4: Run full verification**

Run:
- `npm --prefix server run test`
- `npm --prefix client run build`
- `npm --prefix client run lint`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`

Expected: all PASS.

**Step 5: Commit**

```bash
git add README.md docs/testing-matrix.md scripts/dev.ps1 scripts/check.ps1 package.json
git commit -m "docs(release): add verification matrix and local run scripts"
```

---

## Global Execution Rules

- Keep tasks in order. Do not skip tiers.
- One failing test first for every behavior change.
- Minimal implementation only (YAGNI).
- Run verification before every commit.
- Use small commits exactly per task.

## Definition of Done

- User can submit a tweet URL from UI.
- Server creates, processes, and persists job lifecycle.
- Media extraction + direct/HLS download strategies are wired.
- UI shows live progress and final file path/error.
- Restart recovery and input hardening are active.
- Test suite and build/lint pass from clean checkout.

