---
name: worker-work
description: "Gate access to the Worker domain. All changes to server/src/worker/ must go through this skill."
user-invocable: true
argument-hint: "<task-description>"
model: sonnet
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash(node *)
  - Bash(npm *)
  - Bash(git *)
  - Bash(netstat *)
---

# Worker Domain Work

> **Boundary**: `server/src/worker/**`
> **Steward Agent**: `.claude/agents/worker-steward.md`
> **Domain Docs**: `server/src/worker/CLAUDE.md`

## Pre-Work Checks (MANDATORY)

Before ANY change to this domain:

1. **Read the domain CLAUDE.md**: `server/src/worker/CLAUDE.md` -- understand current state, file inventory, dependency map, consumer map
2. **Verify boundary**: Confirm all files you plan to modify are within `server/src/worker/`
3. **Check dependencies**: If your change affects exports (processOneCycle, startQueueWorker, etc.), identify all consumers from the CLAUDE.md consumer map
4. **Read affected files**: Read every file you plan to modify BEFORE making changes

## Domain Identity

The background processing engine. Claims queued jobs via atomic `findOneAndUpdate`, orchestrates extraction and download through Services, manages the poll loop lifecycle, and handles job recovery after crashes. The Worker is the only domain that calls Services functions.

## Domain Rules

### Atomic Job Claim Pattern

Jobs are claimed atomically to prevent double-processing. The claim sets status from `queued` to `running` in a single `findOneAndUpdate` operation -- never read-then-write:

```javascript
const claimed = await Job.findOneAndUpdate(
  { status: JOB_STATUSES.QUEUED },
  {
    $set: { status: JOB_STATUSES.RUNNING, startedAt: now },
    $inc: { attemptCount: 1 },
  },
  { returnDocument: 'after', sort: { createdAt: 1 } }
);
```

This is FIFO ordering by `createdAt` with atomic status transition. Never separate the read and write steps.

### setInterval for Queue Polling (NOT setTimeout)

The queue worker uses `setInterval` with a guard flag (`isTickRunning`) to prevent overlapping ticks. If a previous tick is still running, the current tick is skipped:

```javascript
pollHandle = setInterval(async () => {
  if (isTickRunning) return; // Skip if previous job still processing
  isTickRunning = true;
  try {
    await onTick();
  } finally {
    isTickRunning = false;
  }
}, intervalMs);
```

Never change this to `setTimeout` -- the current pattern is intentional.

### Job Processing Pipeline Stages

The processing pipeline in `processOneCycle` follows a strict sequence:

1. **Claim** -- atomic claim from queue (queue.js)
2. **Route** -- dispatch through `routeJobByDomain()` (currently falls through to legacy fallback)
3. **Extract** -- call extractor via Services (`extractFromTweet`)
4. **Pick media** -- select best URL from candidates (handled by extractor service)
5. **Save progress** -- persist extraction results at 50% progress
6. **Download** -- call downloader via Services (`downloadMedia`)
7. **Validate** -- verify downloaded file is a real video (content-type + size checks)
8. **Retry strategies** -- on validation failure: auth download, browser navigation, re-extract
9. **Thumbnail** -- download thumbnail image if available
10. **Complete** -- set status to `completed` with output paths, or `failed` with error

### Error Recovery Patterns

**Download validation failure retry chain:**

1. Strategy 1: Authenticated download with Playwright session cookies (`downloadDirectWithPlaywrightSession`)
2. Strategy 2: Full browser navigation download (`downloadDirectWithBrowserNavigation`)
3. Strategy 3: Re-extract fresh URL + authenticated download, then plain fetch

**403 refresh on TikTok:** When `platformNeeds403Refresh(job.tweetUrl)` is true and download returns 403, re-extract a fresh media URL and retry.

**Stale job recovery:** On server restart, `recoverStaleJobs()` marks jobs stuck in `running` (older than `maxAgeMs`) as `failed` with the `RECOVERED_FROM_RESTART` error string.

### Job State Management

Worker MUST update job state through the job document directly (not through API routes):

```javascript
// Save extraction progress
job.extractedUrl = mediaUrl;
job.progressPct = 50;
await job.save();

// Mark completed
job.status = JOB_STATUSES.COMPLETED;
job.progressPct = 100;
job.outputPath = normalizePathForApi(outputPath);
job.completedAt = new Date();
await job.save();

// Mark failed
job.status = JOB_STATUSES.FAILED;
job.failedAt = new Date();
job.error = message;
await job.save();
```

### Extraction Timeout

All extraction calls MUST be wrapped in `withTimeout()`:

```javascript
const extracted = await withTimeout(
  extractor(job.tweetUrl, { telemetryContext }),
  extractionTimeoutMs,
  `Extraction timed out after ${extractionTimeoutMs}ms`
);
```

Default timeout is `EXTRACTION_TIMEOUT_MS` (180000ms / 3 minutes).

### Structured Logging

All worker operations log through `logger` with structured context:

```javascript
logger.info('worker.job.processing_started', {
  jobId, traceId, tweetUrl: job.tweetUrl, attemptCount: job.attemptCount,
});
```

Always include `jobId` and `traceId` in every log call within job processing.

### Heartbeat

The queue worker writes a heartbeat to MongoDB every 30 seconds (fire-and-forget, non-blocking) via `WorkerHeartbeat.findOneAndUpdate`. This is used by the `/api/worker/health` endpoint.

## File Inventory

| File | Purpose | Key Exports |
|------|---------|-------------|
| `process-job.js` | Job processing orchestrator: extract -> pick -> download -> save | `{ processOneCycle, buildTargetPath, productionExtractor }` |
| `queue.js` | Queue worker: poll interval, atomic claim, heartbeat | `{ claimNextQueuedJob, startQueueWorker, stopQueueWorker }` |
| `recovery.js` | Recover stale running jobs after restart | `{ RECOVERED_FROM_RESTART, recoverStaleJobs }` |

## Dependency Map (I Import From)

| Source | What | Used In |
|--------|------|---------|
| `core/constants/job-status` | `JOB_STATUSES`, `SOURCE_TYPES` | process-job, queue, recovery |
| `core/models/job` | `Job` | queue, recovery |
| `core/models/worker-heartbeat` | `WorkerHeartbeat` | queue |
| `core/lib/logger` | `logger` | process-job, queue |
| `core/utils/account-profile` | `deriveAccountProfile`, `inferExtensionFromUrl`, `normalizePathForApi`, `sanitizeAccountSlug` | process-job |
| `core/utils/validation` | `isHttpUrl` | process-job |
| `core/platforms/registry` | `platformNeeds403Refresh` | process-job |
| `core/dispatch/route-job-by-domain` | `routeJobByDomain` | process-job |
| `services/extractor-service` | `extractFromTweet` | process-job |
| `services/downloader-service` | `downloadMedia`, `downloadDirect`, `downloadDirectWithPlaywrightSession`, `downloadDirectWithBrowserNavigation`, `isSignedUrlExpired` | process-job |
| `services/playwright-adapter` | `createPlaywrightPageFactory` | process-job |

## Consumer Map (Who Imports From Me)

| Consumer | What |
|----------|------|
| `core/runtime/start-worker-runtime.js` | `processOneCycle`, `startQueueWorker`, `stopQueueWorker`, `recoverStaleJobs` |

## Forbidden Imports

- NEVER import from `api/` -- Worker does not define HTTP routes
- NEVER import from `platforms/` directly -- always go through `core/platforms/registry`
- NEVER access Playwright APIs directly -- always go through `services/playwright-adapter`

## Work Steps

1. Read `server/src/worker/CLAUDE.md` for current domain state
2. Read the specific files you need to modify
3. Implement changes following domain rules above
4. Verify no imports from forbidden domains were introduced
5. Verify Services are called through the documented interface (never direct Playwright API)
6. Run post-work checks

## Post-Work Checks (MANDATORY)

After ANY change to this domain:

- [ ] Server starts: `node server/src/core/runtime/entrypoints/index.js` (quick startup, Ctrl+C after boot)
- [ ] No new imports from `api/` or `platforms/` directly
- [ ] Services called through documented interface functions only
- [ ] All extraction calls wrapped in `withTimeout()`
- [ ] All log calls include `jobId` and `traceId`
- [ ] Job status transitions are correct (queued -> running -> completed|failed)
- [ ] Error paths set `job.status = JOB_STATUSES.FAILED` and `job.error = message`
- [ ] No Playwright API calls outside of Services functions
- [ ] Interface contract unchanged (or Core runtime consumer notified)
- [ ] Update `server/src/worker/CLAUDE.md` -- file inventory, deps, exports if changed
- [ ] Git commit the domain changes

## Cross-Domain Notification

If your change affects the domain's interface contract (exported functions):

1. The only consumer is `core/runtime/start-worker-runtime.js` (Core domain)
2. Message the Core steward agent
3. If changing function signatures for `processOneCycle`, `startQueueWorker`, `stopQueueWorker`, or `recoverStaleJobs`, Core runtime must be updated

If your change affects how Services are called:

1. Message the Services steward agent
2. Verify the Services interface contract hasn't changed (read services CLAUDE.md)

## Common Mistakes to Avoid

- Separating job claim into read + write steps -- use atomic `findOneAndUpdate`
- Forgetting `withTimeout()` on extraction calls -- job hangs forever
- Not saving job progress after extraction (50% checkpoint) -- progress invisible to user
- Missing traceId in log calls -- breaks end-to-end tracing
- Not cleaning up files on download validation failure -- disk fills up
- Changing `setInterval` to `setTimeout` in queue.js -- breaks the polling pattern
- Calling `job.save()` without setting error field on failure path
- Not handling the case where `claimNextQueuedJob` returns null (no jobs in queue)

## Forbidden Actions

- NEVER modify files outside `server/src/worker/`
- NEVER add imports from undocumented sources without updating CLAUDE.md
- NEVER change an export shape without notifying the Core steward
- NEVER skip updating the domain CLAUDE.md after changes
- NEVER define Express routes -- that is API domain territory
- NEVER call Playwright APIs directly -- always go through Services
- NEVER kill browser processes -- Services manages browser lifecycle
