# Worker Domain

> **Owner**: worker-steward agent | **Skill**: /worker-work | **Team**: worker-team

The background job processing engine. Claims queued jobs from MongoDB via atomic `findOneAndUpdate`, orchestrates media extraction and download through the Services domain, manages the 1-second poll loop lifecycle, writes heartbeats for health monitoring, and handles job recovery after server restarts. The Worker domain never defines HTTP routes or directly accesses Playwright APIs.

## Boundary

This domain owns all files under `server/src/worker/`. No agent outside the worker-team may create, modify, or delete files in this directory.

## File Inventory

| File | Purpose |
|------|---------|
| `process-job.js` | Job processing orchestrator: claim -> extract -> pick media -> download (with retry strategies) -> save results. Exports `{ processOneCycle, buildTargetPath, productionExtractor }`. ~688 lines. |
| `queue.js` | Queue worker: 1s `setInterval` poll loop, atomic job claim via `findOneAndUpdate`, tick-overlap guard, 30s heartbeat upsert. Exports `{ claimNextQueuedJob, startQueueWorker, stopQueueWorker }`. ~126 lines. |
| `recovery.js` | Stale job recovery: marks `running` jobs older than `maxAgeMs` as `failed` with `RECOVERED_FROM_RESTART` error. Exports `{ RECOVERED_FROM_RESTART, recoverStaleJobs }`. ~36 lines. |

**File count:** 3 source files in 1 directory.

## Architecture

### Job Processing Pipeline
```
claimNextQueuedJob() -> atomic findOneAndUpdate (queued -> running)
  -> routeJobByDomain (checks for domain-specific handler, falls back to default)
  -> Extract: Playwright via Services (with configurable timeout)
  -> Pick media: inferSourceTypeFromMediaUrl (direct MP4 > HLS)
  -> Download: Services downloadMedia (with 3-tier retry on validation failure)
  -> Thumbnail: downloadDirect for first image URL
  -> Save: job.status = completed, outputPath, thumbnailPath
  -> On error: job.status = failed, error message saved
```

### Download Retry Strategies (process-job.js)
When download validation fails (wrong content type or suspiciously small file), three retry strategies are attempted in order:
1. **Authenticated download** -- `downloadDirectWithPlaywrightSession` (uses cookies)
2. **Browser navigation download** -- `downloadDirectWithBrowserNavigation` (real TLS fingerprint)
3. **Re-extract fresh URL** -- run extractor again, then try authenticated download, then plain fetch

### 403 Refresh Logic
When `platformNeeds403Refresh(job.tweetUrl)` is true (TikTok), a 403 download error triggers re-extraction of a fresh media URL before retrying the download.

### Queue Tick Guard
The `isTickRunning` flag prevents overlapping ticks. If a previous tick is still running, subsequent ticks are skipped. After every 10 skipped ticks, a warning is logged.

### Heartbeat
Every 30 seconds, the queue writes a heartbeat to the `WorkerHeartbeat` collection (`workerId: 'default'`). This is fire-and-forget and non-blocking.

### Recovery
On server restart, `recoverStaleJobs` marks any `running` jobs older than 15 minutes as `failed` with the error string `RECOVERED_FROM_RESTART`.

## Dependencies (What We Import)

| Source Domain | Module | What We Use |
|---------------|--------|-------------|
| core | `core/constants/job-status` | `JOB_STATUSES`, `SOURCE_TYPES` |
| core | `core/models/job` | `Job` Mongoose model |
| core | `core/models/worker-heartbeat` | `WorkerHeartbeat` model |
| core | `core/lib/logger` | `logger` structured logging |
| core | `core/utils/account-profile` | `deriveAccountProfile`, `inferExtensionFromUrl`, `normalizePathForApi`, `sanitizeAccountSlug` |
| core | `core/utils/validation` | `isHttpUrl` |
| core | `core/platforms/registry` | `platformNeeds403Refresh` |
| core | `core/dispatch/route-job-by-domain` | `routeJobByDomain` |
| services | `services/extractor-service` | `extractFromTweet` |
| services | `services/downloader-service` | `downloadMedia`, `downloadDirect`, `downloadDirectWithPlaywrightSession`, `downloadDirectWithBrowserNavigation`, `isSignedUrlExpired` |
| services | `services/playwright-adapter` | `createPlaywrightPageFactory` |

## Consumers (Who Imports Us)

| Consumer Domain | Module | What They Use |
|-----------------|--------|---------------|
| core | `core/runtime/start-worker-runtime.js` | `startQueueWorker`, `stopQueueWorker` (from queue.js), `processOneCycle` (from process-job.js), `recoverStaleJobs` (from recovery.js) |
| core | `core/runtime/entrypoints/index.js` | Same imports for monolithic mode |

**Note:** Worker is a leaf domain. Only the Core runtime imports from it to wire up the poll loop and recovery.

## Interface Contract

**Public exports (consumed by Core runtime):**

```javascript
// process-job.js
module.exports = {
  processOneCycle,       // async (extractor?, downloader?) => JobObject | null
  buildTargetPath,       // (jobId: string, accountSlug: string) => string
  productionExtractor,   // async (tweetUrl, options?) => ExtractionResult
}

// queue.js
module.exports = {
  claimNextQueuedJob,    // async () => JobDocument | null
  startQueueWorker,      // ({ intervalMs?, onTick? }) => IntervalHandle
  stopQueueWorker,       // () => void
}

// recovery.js
module.exports = {
  RECOVERED_FROM_RESTART, // string constant: 'RECOVERED_FROM_RESTART'
  recoverStaleJobs,       // async ({ maxAgeMs? }) => number (count of recovered jobs)
}
```

**Contract rules:**
- Worker consumes Services through function calls (never direct Playwright API access)
- Worker MUST NOT import from `api/` routes
- Worker MUST NOT define Express routes
- `processOneCycle` accepts optional `extractor` and `downloader` parameters for testing

## Change Protocol

1. All changes to this domain MUST go through the worker-steward agent
2. Changes to `processOneCycle` signature: notify Core steward (it's called from runtime)
3. Changes to retry/recovery logic: notify Services steward if service interfaces are affected
4. Changes to job field writes: notify API steward (API reads those fields)
5. After any change, update this CLAUDE.md

## Domain Rules

- **NEVER import from `api/` routes** -- Worker must not define or access HTTP endpoints
- **NEVER access Playwright APIs directly** -- always go through Services domain functions
- **Always use atomic `findOneAndUpdate`** for job claiming (prevents double-processing)
- **Always clean up files on validation failure** -- use `fs.unlinkSync` before retrying
- **Always include `{ jobId, traceId }` in log calls** for end-to-end tracing
- **Use `job.save()` for multi-field updates** during processing (not findOneAndUpdate) -- the job document is already claimed
- **Timeout all extraction calls** using `withTimeout()` wrapper with `EXTRACTION_TIMEOUT_MS`
- **Track tried URLs** in a `Set` to avoid re-downloading the same expired URL

## Common Mistakes

- Not handling the case where `claimNextQueuedJob` returns `null` (no jobs in queue)
- Forgetting to check `isSignedUrlExpired` before reusing a pre-extracted URL
- Not cleaning up downloaded files before retry attempts (leaves corrupt files)
- Calling Services functions without `telemetryContext` -- breaks traceId flow
- Not saving intermediate progress (`job.progressPct = 50`) after extraction
- Assuming `extractedUrl` on the job is always fresh -- it may be expired
- Not handling `TimeoutError` distinctly from other errors in logging

## Testing

Tests are located in `server/test/worker/`:

| Test File | Covers |
|-----------|--------|
| `server/test/worker/domain-dispatch-mixed-state.test.js` | Domain routing dispatch with mixed job states |

Run tests: `cd server && npx jest test/worker/`

Note: Test scripts are currently disabled in package.json. Tests can be run directly with Jest.
