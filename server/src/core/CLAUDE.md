# Core Domain

> **Owner**: core-steward agent | **Skill**: /core-work | **Team**: core-team

The foundation layer for all backend domains. Provides shared infrastructure consumed by API, Worker, Services, and Platforms: environment configuration, constants, data models (Mongoose schemas), dispatch logic, HTTP middleware, logging/telemetry (in-memory ring buffer + MongoDB sink + SSE pub/sub), platform registry, runtime lifecycle (entrypoints, shutdown, domain plugin loading), and utility functions. Core is the most complex domain (28 files, 12 subdirectories) with the widest blast radius -- any interface change here affects every other domain.

## Boundary

This domain owns all files under `server/src/core/`. No agent outside the core-team may create, modify, or delete files in this directory.

## File Inventory

### config/ (2 files)

| File | Purpose |
|------|---------|
| `config/env.js` | `getServerConfig()` (port, mongoUri), `getRuntimeRole()`, `chooseRuntime()`, `isDomainKernelEnabled()`, `isStrictPluginStartup()`. |
| `config/platform-capabilities.js` | Runtime enable/disable per platform. `getPlatformCapabilities()`, `isPlatformEnabled()`, `setPlatformCapabilities()`. Uses `PLATFORMS` from registry. Supports runtime overrides via PATCH /api/capabilities. |

### constants/ (1 file -- re-export shim)

| File | Purpose |
|------|---------|
| `constants/job-status.js` | Re-export shim: `module.exports = require('../data/job-status')`. Provides backward-compatible import path. |

### data/ (3 files -- canonical sources)

| File | Purpose |
|------|---------|
| `data/job-status.js` | Canonical enum definitions: `JOB_STATUSES` (queued, running, completed, failed, canceled), `JOB_STATUS_VALUES`, `SOURCE_TYPES` (direct, hls, unknown), `SOURCE_TYPE_VALUES`. All frozen objects. |
| `data/job-model.js` | Canonical Mongoose Job schema: 20+ fields (tweetUrl, canonicalUrl, domainId, traceId, status, progressPct, attemptCount, sourceType, account*, extracted*, candidate*, image*, metadata, thumbnail*, outputPath, error, startedAt, completedAt, failedAt). Index on `{ status: 1, createdAt: 1 }`. Exports `{ Job, JOB_STATUSES }`. |
| `data/discovered-post-model.js` | Mongoose `DiscoveredPost` schema for profile discovery: accountSlug, accountHandle, accountPlatform, postUrl, canonicalUrl, thumbnailUrl, thumbnailPath, videoId, title, downloadedJobId (ObjectId ref). Indexes: unique on `canonicalUrl`, compound on `{ accountSlug, downloadedJobId }`. Exports `{ DiscoveredPost }`. |

### dispatch/ (2 files)

| File | Purpose |
|------|---------|
| `dispatch/resolve-domain-id.js` | Maps platform ID + URL to a domain ID string (`platform-x`, `platform-tiktok`). `resolveDomainId()`, `platformToDomainId()`. |
| `dispatch/route-job-by-domain.js` | Routes a job to domain-specific handler or fallback. `routeJobByDomain({ job, routes, fallback })`. |

### domain/ (1 file)

| File | Purpose |
|------|---------|
| `domain/job-transitions.js` | Valid state transition definitions: `ALLOWED_TRANSITIONS` map, `canTransition(from, to)`. Queued -> running/canceled; Running -> completed/failed/canceled; terminal states have no exits. |

### http/ (1 file)

| File | Purpose |
|------|---------|
| `http/request-limits.js` | Canonical request limit middleware: `createCorsOptions()`, `jsonBodyParser()` (32kb limit), `enforceTweetUrlLength()` (2048 chars), `handleRequestLimitErrors()`. |

### lib/ (3 files)

| File | Purpose |
|------|---------|
| `lib/error-codes.js` | `ERROR_CODES` frozen object: 23 standardized error code constants (INVALID_TWEET_URL, PLATFORM_DISABLED, DB_NOT_CONNECTED, JOB_NOT_FOUND, etc.). |
| `lib/logger.js` | Structured logger with two methods: `logger.info(event, meta)` and `logger.error(event, meta)`. Publishes to telemetry ring buffer and writes to console (JSON serialized). Includes `sourceProcessId` and `processRole` in every event. |
| `lib/telemetry.js` | In-memory ring buffer (`TELEMETRY_HISTORY_LIMIT` capacity) + EventEmitter pub/sub + optional MongoDB sink. `publishTelemetry()`, `subscribeTelemetry()`, `listTelemetry()`. Filters noise events (http.request.*). MongoDB sink: batched writes every 500ms. Cross-process polling every 2s when TELEMETRY_SINK=mongo. |

### middleware/ (1 file -- re-export shim)

| File | Purpose |
|------|---------|
| `middleware/request-limits.js` | Re-export shim: `module.exports = require('../http/request-limits')`. Provides backward-compatible import path. |

### models/ (3 files)

| File | Purpose |
|------|---------|
| `models/job.js` | Re-export shim: `module.exports = require('../data/job-model')`. Provides backward-compatible import path for `{ Job }`. |
| `models/telemetry-event.js` | `TelemetryEvent` Mongoose model for MongoDB telemetry sink. Schema: event, level, jobId, traceId, sourceProcessId, processRole, ts, data (Mixed), createdAt. Indexes: `{ ts: -1 }`, `{ jobId: 1, ts: -1 }`, `{ sourceProcessId: 1, ts: -1 }`, TTL on createdAt (24h). |
| `models/worker-heartbeat.js` | `WorkerHeartbeat` Mongoose model. Schema: workerId (default: 'default'), lastHeartbeatAt (Date). |

### platforms/ (1 file)

| File | Purpose |
|------|---------|
| `platforms/registry.js` | Platform registry: imports X and TikTok definitions, builds host lookup maps at startup. `PLATFORMS` array, `resolvePlatform(hostname)`, `resolvePlatformByMediaHost(url)`, `getAuthBlockingHosts()`, `getAllMediaPathPatterns()`, `platformNeeds403Refresh(url)`. |

### runtime/ (8 files)

| File | Purpose |
|------|---------|
| `runtime/domain-context.js` | Creates domain context object for plugin system: `createDomainContext({ role, app, config, core })` returns `{ role, app, config, mongo, logger, telemetry, core }`. |
| `runtime/load-domains.js` | Domain plugin loader: `loadDomainsForRuntime({ role, ctx, strict, domainModules })`. Validates runtime targets, mounts routes (API) or starts workers. Returns `{ startedDomainIds, stopAll() }`. |
| `runtime/register-shutdown.js` | Graceful shutdown handler: `registerShutdown(cleanupInput)` registers cleanup functions, installs SIGINT/SIGTERM handlers. |
| `runtime/start-api-runtime.js` | API process bootstrap: Express listen, MongoDB connect (fire-and-forget), domain plugin loading, shutdown registration. `startApiRuntime({ applyDnsOverride })`. |
| `runtime/start-worker-runtime.js` | Worker process bootstrap: MongoDB connect (await), stale job recovery, domain plugin loading, queue start, shutdown registration. `startWorkerRuntime({ applyDnsOverride })`. |
| `runtime/entrypoints/app.js` | Express app definition: middleware stack (CORS, JSON parser, morgan, traceId), route mounting (all API routers), telemetry SSE endpoint, capabilities endpoint, health endpoint, static download serving. |
| `runtime/entrypoints/index.js` | Combined-mode entry point: loads dotenv, applies DNS override, chooses runtime based on ROLE env var (api/worker/combined). Monolithic mode runs API + worker in same process. |
| `runtime/entrypoints/start-api.js` | Split-mode API entry point: sets `ROLE=api`, requires index.js. |
| `runtime/entrypoints/start-worker.js` | Split-mode Worker entry point: sets `ROLE=worker`, requires index.js. |

### utils/ (2 files)

| File | Purpose |
|------|---------|
| `utils/account-profile.js` | Account slug derivation from post URL and metadata. `sanitizeAccountSlug()`, `deriveAccountProfile()`, `inferExtensionFromUrl()`, `normalizePathForApi()`. |
| `utils/validation.js` | URL validation using platform registry. `getPostUrlInfo()`, `isTweetUrl()`, `isSupportedPostUrl()`, `canonicalizePostUrl()`, `isHttpUrl()`. |

**Total file count:** 29 source files across 12 subdirectories.

**Shim files (3):** `constants/job-status.js`, `middleware/request-limits.js`, `models/job.js` -- these are re-export shims providing backward-compatible import paths. The canonical source is in `data/` and `http/`.

## Architecture

### Shim Pattern
Three files in Core are re-export shims that point to canonical sources:
- `constants/job-status.js` -> `data/job-status.js`
- `middleware/request-limits.js` -> `http/request-limits.js`
- `models/job.js` -> `data/job-model.js`

This pattern exists for backward compatibility. New code should import from the canonical paths, but both paths are supported.

### Telemetry System
The telemetry system supports two sink modes:
- **memory** (default for combined mode): in-memory ring buffer only
- **mongo** (default for split API/worker mode): ring buffer + MongoDB persistence

In mongo mode, a 2-second poll bridges cross-process telemetry (worker writes events to MongoDB, API polls and emits to SSE subscribers). Noise events (`http.request.*`) are never stored in the ring buffer or MongoDB.

### Runtime Modes
The entry point (`entrypoints/index.js`) supports three modes:
- **combined** (default, no ROLE set): API + Worker in one process
- **api** (ROLE=api): Express server only
- **worker** (ROLE=worker): Queue worker only

### Domain Plugin System
The `loadDomainsForRuntime` function provides an optional plugin system for domain modules. Domain modules can declare `runtimeTargets` (api, worker, both) and implement `mountRoutes(app, ctx)` and/or `startWorker(ctx)`. This is gated behind `ENABLE_DOMAIN_KERNEL=true`.

## Dependencies (What We Import)

| Source Domain | Module | What We Use |
|---------------|--------|-------------|
| platforms | `platforms/x/index.js` | X platform definition (registry.js) |
| platforms | `platforms/tiktok/index.js` | TikTok platform definition (registry.js) |
| api | `api/routes/*.js` | All Express routers (entrypoints/app.js) |
| worker | `worker/queue.js` | `startQueueWorker`, `stopQueueWorker` (start-worker-runtime.js, index.js) |
| worker | `worker/process-job.js` | `processOneCycle` (start-worker-runtime.js, index.js) |
| worker | `worker/recovery.js` | `recoverStaleJobs` (start-worker-runtime.js, index.js) |
| services | `services/playwright-adapter.js` | `closePersistentContext` (start-worker-runtime.js, index.js) |

**Note:** Core imports from Platforms (data definitions), API (router mounting), Worker (queue lifecycle), and Services (browser shutdown). These imports occur only in the runtime/entrypoints layer, which is the integration seam.

## Consumers (Who Imports Us)

Every other domain imports from Core:

| Core Module | Consumed By |
|-------------|-------------|
| `models/job` | API (jobs, contacts, retry, status), Worker (queue, recovery) |
| `models/worker-heartbeat` | API (worker-health), Worker (queue) |
| `data/discovered-post-model` | API (discovery), Services (profile-discovery-service) |
| `models/telemetry-event` | Core internal (telemetry.js lazy require) |
| `constants/job-status` | API (jobs, retry, status, route-utils), Worker (process-job, queue, recovery), Services (extractor) |
| `lib/error-codes` | API (jobs, contacts, retry, status, worker-health, route-utils) |
| `lib/logger` | API (jobs, contacts, retry, status), Worker (process-job, queue), Services (all 3 files), Core internal |
| `lib/telemetry` | Core internal (domain-context, app.js) |
| `config/env` | Core internal (start-api-runtime, start-worker-runtime, index.js) |
| `config/platform-capabilities` | API (jobs, route-utils), Core internal (app.js) |
| `platforms/registry` | API (jobs, route-utils), Worker (process-job), Services (downloader, playwright-adapter), Core internal (app.js) |
| `dispatch/resolve-domain-id` | API (jobs, retry, status) |
| `dispatch/route-job-by-domain` | Worker (process-job) |
| `domain/job-transitions` | API (status) |
| `middleware/request-limits` | Core internal (app.js) |
| `utils/validation` | API (jobs, retry), Worker (process-job), Services (extractor) |
| `utils/account-profile` | Worker (process-job) |
| `runtime/*` | Core internal only (bootstrap) |

## Interface Contract

**Stable interfaces (MUST NOT change without cross-domain notification):**

```javascript
// constants/job-status.js (via data/job-status.js)
module.exports = { JOB_STATUSES, JOB_STATUS_VALUES, SOURCE_TYPES, SOURCE_TYPE_VALUES }

// lib/error-codes.js
module.exports = { ERROR_CODES }

// lib/logger.js
module.exports = { logger }  // { info(event, meta), error(event, meta) }

// lib/telemetry.js
module.exports = { publishTelemetry, subscribeTelemetry, listTelemetry }

// models/job.js (via data/job-model.js)
module.exports = { Job }  // Mongoose model

// models/worker-heartbeat.js
module.exports = { WorkerHeartbeat }

// data/discovered-post-model.js
module.exports = { DiscoveredPost }  // Mongoose model

// models/telemetry-event.js
module.exports = { TelemetryEvent }

// config/platform-capabilities.js
module.exports = { getPlatformCapabilities, isPlatformEnabled, setPlatformCapabilities }

// config/env.js
module.exports = { getServerConfig, getRuntimeRole, chooseRuntime, isDomainKernelEnabled, isStrictPluginStartup }

// platforms/registry.js
module.exports = { PLATFORMS, resolvePlatform, resolvePlatformByMediaHost, getAuthBlockingHosts, getAllMediaPathPatterns, platformNeeds403Refresh }

// dispatch/resolve-domain-id.js
module.exports = { resolveDomainId, platformToDomainId }

// dispatch/route-job-by-domain.js
module.exports = { routeJobByDomain }

// domain/job-transitions.js
module.exports = { canTransition, ALLOWED_TRANSITIONS }

// middleware/request-limits.js (via http/request-limits.js)
module.exports = { MAX_JSON_BODY, MAX_TWEET_URL_LENGTH, createCorsOptions, jsonBodyParser, enforceTweetUrlLength, handleRequestLimitErrors }

// utils/validation.js
module.exports = { isTweetUrl, isSupportedPostUrl, getPostUrlInfo, canonicalizePostUrl, isHttpUrl }

// utils/account-profile.js
module.exports = { sanitizeAccountSlug, deriveAccountProfile, inferExtensionFromUrl, normalizePathForApi }

// runtime/register-shutdown.js
module.exports = { registerShutdown }

// runtime/domain-context.js
module.exports = { createDomainContext }

// runtime/load-domains.js
module.exports = { loadDomainsForRuntime }

// runtime/start-api-runtime.js
module.exports = { startApiRuntime }

// runtime/start-worker-runtime.js
module.exports = { startWorkerRuntime }

// runtime/entrypoints/app.js
module.exports = { app }
```

**Contract rule:** Any change to a Core export signature or behavior MUST be communicated to all consuming domains before implementation. Core is the foundation -- breaking Core breaks everything.

## Change Protocol

1. All changes to this domain MUST go through the core-steward agent
2. Changes to any export signature: notify ALL consuming domains (API, Worker, Services)
3. Changes to Job schema: notify API steward (reads fields) and Worker steward (writes fields)
4. Changes to JOB_STATUSES or SOURCE_TYPES: notify all domains (used everywhere)
5. Changes to platform registry: notify Services and API stewards
6. Changes to telemetry: notify API steward (SSE integration in app.js)
7. Changes to middleware: notify API steward (route mounting in app.js)
8. Changes to runtime/entrypoints: coordinate with Worker steward (lifecycle)
9. After any change, update this CLAUDE.md

## Domain Rules

- **Core exports MUST be backward compatible** -- never remove an export without migration
- **Re-export shims MUST remain functional** -- other domains may import from either path
- **The Job schema is a cross-domain contract** -- field additions require notification, removals are breaking changes
- **ERROR_CODES must be frozen** -- new codes can be added, existing codes must not change
- **Logger must publish to telemetry** -- never bypass publishTelemetry in logger methods
- **Telemetry ring buffer must filter noise events** -- http.request.* events are emitted but not stored
- **Runtime entrypoints must handle all three modes** -- combined, api-only, worker-only
- **Shutdown handlers must be idempotent** -- multiple signals should not cause double cleanup
- **Platform registry maps are built at startup** -- adding a platform at runtime is not supported
- **MongoDB connection is fire-and-forget in API mode** -- do not block HTTP startup on database

## Common Mistakes

- Importing from `data/` or `http/` in other domains -- use `constants/`, `middleware/`, `models/` shim paths for stability
- Adding a new ERROR_CODE but not freezing the object -- all enums must remain frozen
- Changing telemetry event names without updating the noise filter prefix
- Not handling `mongoose.connection.readyState !== 1` in new code that queries MongoDB
- Forgetting to call `registerShutdown` in new runtime bootstrap code
- Not setting `{ new: true }` or `{ returnDocument: 'after' }` on `findOneAndUpdate` calls
- Adding fields to Job schema without default values -- breaks existing documents

## Testing

Tests are located across several directories:

| Test File | Covers |
|-----------|--------|
| `server/test/config/runtime-role.test.js` | Runtime role selection (env.js) |
| `server/test/lib/telemetry-contract.test.js` | Telemetry pub/sub/list contract |
| `server/test/core/no-legacy-shims.test.js` | Verifies no stale legacy shim paths |
| `server/test/runtime/runtime-lifecycle.test.js` | Runtime startup/shutdown lifecycle |
| `server/test/runtime/domain-runtime-wiring.test.js` | Domain plugin loading and wiring |
| `server/test/runtime/entrypoint-contract.test.js` | Entrypoint module export contracts |

Run tests: `cd server && npx jest test/config/ test/lib/ test/core/ test/runtime/`

Note: Test scripts are currently disabled in package.json. Tests can be run directly with Jest.
