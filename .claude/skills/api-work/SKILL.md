---
name: api-work
description: "Gate access to the API domain. All changes to server/src/api/ must go through this skill."
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

# API Domain Work

> **Boundary**: `server/src/api/**`
> **Steward Agent**: `.claude/agents/api-steward.md`
> **Domain Docs**: `server/src/api/CLAUDE.md`

## Pre-Work Checks (MANDATORY)

Before ANY change to this domain:

1. **Read the domain CLAUDE.md**: `server/src/api/CLAUDE.md` -- understand current state, file inventory, dependency map, consumer map
2. **Verify boundary**: Confirm all files you plan to modify are within `server/src/api/`
3. **Check dependencies**: If your change affects exports (router instances), identify all consumers from the CLAUDE.md consumer map
4. **Read affected files**: Read every file you plan to modify BEFORE making changes

## Domain Identity

The HTTP surface layer. Receives client requests via Express 5 routers, validates input, queries MongoDB, and returns JSON responses. The API domain NEVER performs background processing, browser automation, or file downloads.

## Domain Rules

### Express 5 Async Error Handling

Express 5 catches rejected promises from async route handlers automatically. Do NOT wrap handlers in try/catch for the purpose of calling `next(err)`. Only use try/catch when you need to catch and handle specific errors within the handler itself (e.g., formatting a user-friendly error message).

```javascript
// CORRECT: Express 5 auto-catches this
router.get('/', async (req, res) => {
  const jobs = await Job.find({}).lean();
  res.json({ ok: true, jobs });
});

// WRONG: Unnecessary try/catch wrapping
router.get('/', async (req, res, next) => {
  try {
    const jobs = await Job.find({}).lean();
    res.json({ ok: true, jobs });
  } catch (err) { next(err); }
});
```

### Response Format Contract

Every endpoint MUST return `{ ok: true/false }`. Errors MUST include `code` (from `ERROR_CODES`) and `error` (human-readable string). Use `sendError()` from route-utils.js for all error responses.

```javascript
// Success
res.json({ ok: true, jobs });
res.status(201).json({ ok: true, job, traceId });

// Error (always use sendError helper)
sendError(res, 400, ERROR_CODES.INVALID_TWEET_URL, 'Invalid post URL.');
sendError(res, 404, ERROR_CODES.JOB_NOT_FOUND, 'Job not found.');
sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
```

### traceId Propagation

Every mutating endpoint (POST, PATCH, DELETE) MUST read the traceId via `getRequestTraceId(req)` and include it in all log calls. The traceId flows: HTTP header -> middleware -> route handler -> Job document -> worker logs -> SSE telemetry.

### Database Connection Guard

Every route handler that touches MongoDB MUST check connection state first:

```javascript
if (mongoose.connection.readyState !== 1) {
  return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
}
```

### ObjectId Validation

Always validate ObjectId parameters before querying:

```javascript
if (!isValidObjectId(req.params.id)) {
  return sendError(res, 400, ERROR_CODES.INVALID_JOB_ID, 'Invalid job id.');
}
```

### Read-Only Queries Use lean()

Always use `.lean()` on GET queries that don't need Mongoose document methods. Only skip `lean()` when you need to call `.save()` on the result.

### Atomic State Changes

Never read-then-write for job status transitions. Use `findOneAndUpdate` with a status filter to prevent race conditions:

```javascript
const job = await Job.findOneAndUpdate(
  { _id: jobId, status: currentStatus },
  { $set: { status: nextStatus } },
  { returnDocument: 'after' }
);
```

### Platform Validation

When creating or updating jobs with URLs, always validate the platform is enabled:

```javascript
const platformError = ensureEnabledPlatform(postInfo, res);
if (platformError) return platformError;
```

Use `PLATFORMS` from the registry for display labels -- never hardcode platform names.

### Duplicate Job Guard

Before creating a new job, check for existing active (queued/running) jobs with the same URL:

```javascript
const existingActive = await Job.findOne({
  status: { $in: [JOB_STATUSES.QUEUED, JOB_STATUSES.RUNNING] },
  $or: [{ canonicalUrl }, { tweetUrl }],
}).lean();
```

## File Inventory

| File | Purpose | Key Exports |
|------|---------|-------------|
| `routes/jobs.js` | Job CRUD: list, get, create, update, delete, bulk-delete | `{ jobsRouter }` |
| `routes/contacts.js` | Contact update + delete by slug | `{ contactsRouter }` |
| `routes/retry.js` | Manual retry with pre-extracted media URL | `{ retryRouter }` |
| `routes/status.js` | Job status state machine transition | `{ statusRouter }` |
| `routes/worker-health.js` | Worker heartbeat health check | `{ workerHealthRouter }` |
| `routes/helpers/route-utils.js` | Internal helpers (sendError, deleteJobFiles, validation) | API-internal only |

## Dependency Map (I Import From)

| Source | What | Used In |
|--------|------|---------|
| `core/models/job` | `Job` (Mongoose model) | jobs, contacts, retry, status |
| `core/models/worker-heartbeat` | `WorkerHeartbeat` | worker-health |
| `core/constants/job-status` | `JOB_STATUSES`, `SOURCE_TYPES` | jobs, retry, status, route-utils |
| `core/lib/error-codes` | `ERROR_CODES` | jobs, route-utils |
| `core/lib/logger` | `logger` | jobs, contacts, retry, status |
| `core/config/platform-capabilities` | `getPlatformCapabilities`, `isPlatformEnabled` | jobs, route-utils |
| `core/platforms/registry` | `PLATFORMS` | jobs, route-utils |
| `core/dispatch/resolve-domain-id` | `resolveDomainId` | jobs, retry, status |
| `core/domain/job-transitions` | `canTransition` | status |
| `core/utils/validation` | `getPostUrlInfo`, `isTweetUrl`, `canonicalizePostUrl`, `isHttpUrl` | jobs, retry |

## Consumer Map (Who Imports From Me)

| Consumer | What |
|----------|------|
| `core/runtime/entrypoints/app.js` | All 5 Express routers mounted at `/api/jobs` and app root |

## Forbidden Imports

- NEVER import from `worker/` -- API does not process jobs
- NEVER import from `services/` -- API does not use Playwright or ffmpeg
- NEVER import from `platforms/` directly -- always go through `core/platforms/registry`

## Work Steps

1. Read `server/src/api/CLAUDE.md` for current domain state
2. Read the specific files you need to modify
3. Implement changes following domain rules above
4. Verify no imports from forbidden domains were introduced
5. Run post-work checks

## Post-Work Checks (MANDATORY)

After ANY change to this domain:

- [ ] Server starts: `node server/src/core/runtime/entrypoints/index.js` (quick startup, Ctrl+C after boot)
- [ ] No new imports from `worker/`, `services/`, or `platforms/` directly
- [ ] Response format matches `{ ok: true/false, code?, error? }` contract
- [ ] Error responses use `ERROR_CODES` constants, not bare strings
- [ ] All GET queries use `.lean()` for read-only access
- [ ] All mutating routes include traceId in log calls
- [ ] Connection guard present on all routes touching MongoDB
- [ ] Interface contract unchanged (or consumer `core/runtime/entrypoints/app.js` notified)
- [ ] Update `server/src/api/CLAUDE.md` -- file inventory, deps, exports if changed
- [ ] Git commit the domain changes

## Cross-Domain Notification

If your change affects the domain's interface contract (exported router instances):

1. The only consumer is `core/runtime/entrypoints/app.js` (Core domain)
2. Message the Core steward agent
3. If adding a new route file, Core must mount it in app.js
4. If changing response shapes, notify client team (frontend) -- they consume these via fetch

## Common Mistakes to Avoid

- Forgetting `.lean()` on GET queries -- unnecessary Mongoose hydration overhead
- Using try/catch to call `next(err)` -- Express 5 does this automatically
- Returning inside an async handler without `return` -- risk of double response
- Not checking for duplicate active jobs before creating new ones
- Hardcoding platform labels instead of using `PLATFORMS` registry
- Using `{ new: true }` instead of `{ returnDocument: 'after' }` with Mongoose 9

## Forbidden Actions

- NEVER modify files outside `server/src/api/`
- NEVER add imports from undocumented sources without updating CLAUDE.md
- NEVER change an export shape without notifying the Core steward
- NEVER skip updating the domain CLAUDE.md after changes
- NEVER call Playwright, ffmpeg, or any browser automation from API routes
- NEVER perform job processing -- that is Worker domain territory
