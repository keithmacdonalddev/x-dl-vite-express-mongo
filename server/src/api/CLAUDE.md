# API Domain

> **Owner**: api-steward agent | **Skill**: /api-work | **Team**: api-team

The HTTP surface layer for Media Vault. Receives client requests via Express 5 routers, validates input, queries MongoDB via the Job model, and returns JSON responses. The API domain never performs background processing, browser automation, or file downloads. It is a leaf domain: its routers are consumed only by the Core runtime's app entrypoint for mounting.

## Boundary

This domain owns all files under `server/src/api/`. No agent outside the api-team may create, modify, or delete files in this directory.

## File Inventory

| File | Purpose |
|------|---------|
| `routes/jobs.js` | Job CRUD: list (GET /), get (GET /:id), create (POST /), update (PATCH /:id), delete (DELETE /:id), bulk-delete (POST /bulk-delete). Exports `{ jobsRouter }`. |
| `routes/contacts.js` | Contact management: update display name (PATCH /contact/:slug), delete all jobs for contact (DELETE /contact/:slug). Exports `{ contactsRouter }`. |
| `routes/retry.js` | Manual retry: creates a new queued job from a failed job with a user-supplied media URL (POST /:id/manual-retry). Exports `{ retryRouter }`. |
| `routes/status.js` | Status transitions: validates state machine and updates job status (PATCH /:id/status). Exports `{ statusRouter }`. |
| `routes/discovery.js` | Discovered posts: list by contact (GET /:accountSlug), create download job from discovered post (POST /:id/download), delete single discovered post (DELETE /posts/:id), trigger profile discovery refresh (POST /:accountSlug/refresh), repair missing thumbnails via oEmbed (POST /:accountSlug/repair-thumbnails). Imports `triggerProfileDiscovery` and `repairThumbnailsViaOembed` from Services domain. Exports `{ discoveryRouter }`. |
| `routes/worker-health.js` | Worker health check: queries WorkerHeartbeat model for staleness (GET /api/worker/health). Exports `{ workerHealthRouter }`. |
| `routes/helpers/route-utils.js` | Internal helpers: `sendError`, `getRequestTraceId`, `getUrlFacts`, `inferSourceTypeFromMediaUrl`, `isValidObjectId`, `toSafeAbsoluteDownloadPath`, `removeEmptyParentDirs`, `deleteJobFiles`, `normalizeBulkDeleteIds`, `normalizeContactSlug`, `sanitizeDisplayName`, `platformLabel`, `ensureEnabledPlatform`, `DOWNLOADS_ROOT`. |

**File count:** 7 source files across 2 directories.

## Architecture

### Express 5 Route Handlers
All route handlers are async. Express 5 automatically catches rejected promises -- do NOT wrap in try/catch for the purpose of calling `next(err)`. However, some handlers do use try/catch for custom error responses with structured error codes.

### Response Contract
Every endpoint returns `{ ok: true/false, ... }`. Error responses include `code` (from ERROR_CODES constants) and `error` (human-readable message).

### traceId Flow
Route handlers read `req.traceId` (set by middleware in app.js). The traceId is stored on created Job documents and included in all logger calls. The create and retry endpoints return `traceId` in the response.

### Atomic Operations
- Job creation checks for duplicate active jobs using `Job.findOne` with `$or` on `canonicalUrl` and `tweetUrl`
- Status transitions use `Job.findById` then `job.save()` (with `canTransition` validation)
- Bulk delete uses `Job.find` + `Job.deleteMany` with `$in` filter
- Job claim (in Worker domain) uses atomic `findOneAndUpdate`

### File Deletion
The `deleteJobFiles` helper in route-utils.js handles safe file cleanup:
- Validates paths against `DOWNLOADS_ROOT` to prevent path traversal
- Removes both `outputPath` and `thumbnailPath`
- Cleans up empty parent directories after deletion

## Dependencies (What We Import)

| Source Domain | Module | What We Use |
|---------------|--------|-------------|
| core | `core/models/job` | `Job` Mongoose model (queries + mutations) |
| core | `core/models/worker-heartbeat` | `WorkerHeartbeat` model (health check) |
| core | `core/constants/job-status` | `JOB_STATUSES`, `JOB_STATUS_VALUES`, `SOURCE_TYPES` |
| core | `core/lib/error-codes` | `ERROR_CODES` constants |
| core | `core/lib/logger` | `logger` structured logging |
| core | `core/config/platform-capabilities` | `getPlatformCapabilities`, `isPlatformEnabled` |
| core | `core/platforms/registry` | `PLATFORMS` array (for labels and validation) |
| core | `core/dispatch/resolve-domain-id` | `resolveDomainId` (assigns domainId on create/update/retry) |
| core | `core/domain/job-transitions` | `canTransition` (validates status state machine) |
| core | `core/utils/validation` | `getPostUrlInfo`, `isTweetUrl`, `canonicalizePostUrl`, `isHttpUrl` |
| core | `core/data/discovered-post-model` | `DiscoveredPost` Mongoose model (discovery route) |
| services | `services/profile-discovery-service` | `triggerProfileDiscovery` (jobs.js post-create hook, discovery.js refresh), `repairThumbnailsViaOembed` (discovery.js repair-thumbnails) |

## Consumers (Who Imports Us)

| Consumer Domain | Module | What They Use |
|-----------------|--------|---------------|
| core | `core/runtime/entrypoints/app.js` | `jobsRouter`, `contactsRouter`, `retryRouter`, `statusRouter`, `workerHealthRouter` (mounted on Express app) |

**Note:** API is a leaf domain. Only Core's app.js entrypoint imports API routers for mounting. No other domain imports from API files directly.

## Interface Contract

**Public exports (consumed by Core app.js):**

```javascript
// routes/jobs.js
module.exports = { jobsRouter }         // Express.Router

// routes/contacts.js
module.exports = { contactsRouter }     // Express.Router

// routes/retry.js
module.exports = { retryRouter }        // Express.Router

// routes/status.js
module.exports = { statusRouter }       // Express.Router

// routes/discovery.js
module.exports = { discoveryRouter }    // Express.Router

// routes/worker-health.js
module.exports = { workerHealthRouter } // Express.Router
```

**Internal exports (NOT part of the public interface):**

```javascript
// routes/helpers/route-utils.js — API-internal only, other domains MUST NOT import
module.exports = {
  DOWNLOADS_ROOT,            // string — absolute path to downloads directory
  sendError,                 // (res, status, code, error) => Response
  getRequestTraceId,         // (req) => string
  getUrlFacts,               // (url) => { host, pathname, searchLength }
  inferSourceTypeFromMediaUrl, // (url) => 'direct' | 'hls' | 'unknown'
  isValidObjectId,           // (value) => boolean
  toSafeAbsoluteDownloadPath, // (inputPath) => string (empty if unsafe)
  removeEmptyParentDirs,     // async (filePath) => void
  deleteJobFiles,            // async (job) => void
  normalizeBulkDeleteIds,    // (value) => string[]
  normalizeContactSlug,      // (value) => string
  sanitizeDisplayName,       // (value) => string
  platformLabel,             // (platform) => string
  ensureEnabledPlatform,     // (postInfo, res) => Response | null
}
```

## Change Protocol

1. All changes to this domain MUST go through the api-steward agent
2. Changes to route response shapes: notify client team (frontend) via message
3. Changes to Core imports: verify Core interface hasn't changed first (read core CLAUDE.md)
4. New routes: update this file's inventory, notify Core steward to mount in app.js
5. Changes to route-utils.js: check all routes that use the modified helper
6. After any change, update this CLAUDE.md

## Domain Rules

- **NEVER import from `worker/`** -- API routes must not perform background processing
- **Do not import from `services/` except `profile-discovery-service`** -- the discovery feature requires fire-and-forget profile scraping triggered from API routes. No other Services imports are allowed.
- **NEVER import from `platforms/` directly** -- use Core's registry instead
- **Always validate ObjectId** before querying: use `isValidObjectId(req.params.id)` or `mongoose.Types.ObjectId.isValid()`
- **Always check `mongoose.connection.readyState`** before database operations (return 503 with `DB_NOT_CONNECTED`)
- **Use `.lean()`** on all read-only queries (GET endpoints) for performance
- **Error responses MUST use `ERROR_CODES` constants** from `core/lib/error-codes`, never bare strings
- **Use `sendError` helper** for all error responses to ensure consistent `{ ok: false, code, error }` shape
- **Express 5**: async errors auto-propagate. Do NOT wrap handlers in try/catch solely for `next(err)`
- **File paths**: always validate against `DOWNLOADS_ROOT` before any filesystem operation

## Common Mistakes

- Forgetting `.lean()` on GET queries -- unnecessary Mongoose hydration overhead
- Using try/catch only to call `next(err)` -- Express 5 does not need this pattern
- Returning inside an async handler without `return` keyword -- risk of double response
- Not checking for duplicate active jobs before creating new ones (use `canonicalUrl` + `tweetUrl` $or query)
- Hardcoding platform labels instead of using `PLATFORMS` registry
- Calling `job.save()` for status transitions instead of atomic `findOneAndUpdate` (exception: status.js which validates transitions first)
- Not sanitizing user input (display names must use `sanitizeDisplayName`, slugs must use `normalizeContactSlug`)

## Testing

Tests are located in `server/test/routes/`:

| Test File | Covers |
|-----------|--------|
| `server/test/routes/job-duplicate-guard.test.js` | Duplicate active job detection on create |
| `server/test/routes/domain-id-assignment.test.js` | Domain ID assignment on job create/update |
| `server/test/routes/worker-health.test.js` | Worker health endpoint behavior |
| `server/test/routes/telemetry-stream.test.js` | SSE telemetry streaming (tests app.js SSE routes) |

Run tests: `cd server && npx jest test/routes/`

Note: Test scripts are currently disabled in package.json (`echo "Tests disabled"`). Tests can be run directly with Jest.
