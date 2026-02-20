---
name: core-work
description: "Gate access to the Core domain. All changes to server/src/core/ must go through this skill. Extra caution required -- Core changes affect ALL other domains."
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

# Core Domain Work

> **Boundary**: `server/src/core/**`
> **Steward Agent**: `.claude/agents/core-steward.md`
> **Domain Docs**: `server/src/core/CLAUDE.md`
> **CAUTION**: Core is the foundation -- changes here affect ALL other domains. Treat every change as high-blast-radius.

## Pre-Work Checks (MANDATORY)

Before ANY change to this domain:

1. **Read the domain CLAUDE.md**: `server/src/core/CLAUDE.md` -- understand current state, file inventory, dependency map, consumer map
2. **Verify boundary**: Confirm all files you plan to modify are within `server/src/core/`
3. **Check ALL consumers**: Core exports are consumed by every other domain. Use the consumer map below to identify blast radius.
4. **Read affected files**: Read every file you plan to modify AND every file that imports from the modified module
5. **Assess interface impact**: Will this change break any existing import? If yes, all consuming domains must be notified BEFORE implementation.

## Domain Identity

The foundation layer. Provides shared infrastructure consumed by all other domains: configuration, constants, data models, dispatch logic, HTTP middleware, logging/telemetry, platform registry, runtime lifecycle, and utility functions. Core is the only domain that imports from Platforms (to build the registry). Core is consumed by every other domain.

## Domain Rules

### Change Impact Assessment (MANDATORY)

Before modifying ANY Core export, answer these questions:

1. **Who consumes this?** Check the consumer map below.
2. **Does the signature change?** Adding optional parameters is safe. Changing required parameters or return types is breaking.
3. **Does the behavior change?** Same signature but different behavior can be equally breaking.
4. **Can consumers be updated atomically?** If not, the change must be backward-compatible.

If the answer to #2 or #3 is "yes", you MUST:
- Notify ALL consuming domain stewards BEFORE implementing
- Wait for acknowledgment from each affected domain
- Coordinate the rollout (Core change + consumer updates in one commit if possible)

### Shim Management (Re-Export Patterns)

Core uses re-export shims in `constants/` and `models/` directories. These exist to provide stable import paths while the canonical source may move:

```javascript
// core/constants/job-status.js -- shim that re-exports from core/data/job-status.js
const { JOB_STATUSES, SOURCE_TYPES, JOB_STATUS_VALUES } = require('../data/job-status');
module.exports = { JOB_STATUSES, SOURCE_TYPES, JOB_STATUS_VALUES };

// core/models/job.js -- shim that re-exports from core/data/job-model.js
const { Job } = require('../data/job-model');
module.exports = { Job };
```

**Rules:**
- NEVER remove a shim that other domains import from -- check imports first
- When moving a canonical source, update the shim to point to the new location
- Shims must be transparent -- consumers should not need to know they're using a shim
- Before creating a new shim, verify the import path is actually used by other domains

### Runtime Startup Sequence

The combined-mode entry point (`entrypoints/index.js`) bootstraps:

1. Apply DNS override (if configured)
2. Connect to MongoDB (API: fire-and-forget, Worker: await)
3. Create Express app with middleware and routes (`entrypoints/app.js`)
4. Start HTTP server on configured port
5. Recover stale jobs (Worker)
6. Start queue worker (Worker)
7. Register graceful shutdown handlers

**Split-mode entry points** (`start-api.js`, `start-worker.js`) run steps independently.

**app.js is the integration seam**: It imports routers from the API domain and mounts them. This is the only file in Core that imports from API.

### Config Validation Patterns

`core/config/env.js` provides `getServerConfig()` which reads environment variables with defaults:

```javascript
const config = getServerConfig();
// config.port, config.mongoUri, config.mongoDbName, etc.
```

Always use `getServerConfig()` for configuration -- never read `process.env` directly in runtime files.

### Middleware Ordering

Middleware in `app.js` is mounted in this order:
1. CORS headers
2. JSON body parser with size limit
3. URL length enforcement
4. traceId generation/propagation
5. API routes
6. Telemetry SSE endpoint
7. Platform capabilities endpoints
8. Static file serving (downloads)

**Never reorder middleware** -- the order matters for security and functionality.

### Platform Registry

`core/platforms/registry.js` imports all platform definitions and builds lookup maps:

- `PLATFORMS` -- array of all platform definitions
- `resolvePlatform(hostname)` -- finds platform by host, returns `{ platform, isShortLink }`
- `resolvePlatformByMediaHost(url)` -- finds platform by media CDN hostname
- `platformNeeds403Refresh(url)` -- checks if platform needs URL refresh on 403
- `getAuthBlockingHosts()` -- returns Set of hosts where login-wall blocks extraction
- `getAllMediaPathPatterns()` -- returns array of all platform media path RegExps

**To add a new platform**: add `require('../../platforms/<name>')` to the PLATFORMS array.

### Telemetry System

`core/lib/telemetry.js` provides:
- In-memory ring buffer (configurable via `TELEMETRY_HISTORY_LIMIT`)
- MongoDB sink mode for split-process deployments (`TELEMETRY_SINK=mongo`)
- SSE pub/sub for live telemetry streaming
- Noise filtering (HTTP request events excluded from ring buffer)

**Rules:**
- Noise events (`http.request.*`) are emitted to live subscribers but never stored in history
- MongoDB sink uses batched writes (500ms flush interval)
- Cross-process polling (2s interval) bridges worker events to API SSE in split mode

### Logger Integration

`core/lib/logger.js` is the structured logger. Every log call publishes to the telemetry ring buffer:

```javascript
logger.info('domain.action', { traceId, jobId, ...data });
logger.error('domain.action.failed', { traceId, message });
```

**Rules:**
- Always use structured format: event name string + context object
- Include `traceId` and `jobId` when available
- Event names use dot-separated hierarchical namespacing
- Never use bare `console.log` in production code (except in runtime bootstrap)

### Job State Machine

`core/domain/job-transitions.js` defines valid state transitions:
- `queued` -> `running`, `canceled`
- `running` -> `completed`, `failed`, `canceled`
- `failed` -> `queued` (retry)

`canTransition(fromStatus, toStatus)` validates transitions. Used by the status route.

### Model Definitions

`core/data/job-model.js` -- the canonical Job schema:
- Indexed fields: `status`, `createdAt`, `accountSlug`, `canonicalUrl`
- Virtual fields and methods as needed
- Re-exported via `core/models/job.js` shim

`core/models/worker-heartbeat.js` -- WorkerHeartbeat schema (workerId, lastHeartbeatAt)
`core/models/telemetry-event.js` -- TelemetryEvent schema (for MongoDB telemetry sink)

## File Inventory (22 files across 12 directories)

### config/
| File | Purpose |
|------|---------|
| `config/env.js` | `getServerConfig()`, `isDomainKernelEnabled`, `isStrictPluginStartup` |
| `config/platform-capabilities.js` | Runtime enable/disable per platform (`get/set/isPlatformEnabled`) |

### constants/
| File | Purpose |
|------|---------|
| `constants/job-status.js` | Re-export shim for `JOB_STATUSES`, `SOURCE_TYPES`, `JOB_STATUS_VALUES` |

### data/
| File | Purpose |
|------|---------|
| `data/job-model.js` | Canonical Mongoose Job schema |
| `data/job-status.js` | `JOB_STATUSES` and `SOURCE_TYPES` enum constants |

### dispatch/
| File | Purpose |
|------|---------|
| `dispatch/resolve-domain-id.js` | Maps platform ID + URL to domain ID string |
| `dispatch/route-job-by-domain.js` | Routes job to domain handler or fallback |

### domain/
| File | Purpose |
|------|---------|
| `domain/job-transitions.js` | Valid state transition definitions (`canTransition`) |

### lib/
| File | Purpose |
|------|---------|
| `lib/error-codes.js` | `ERROR_CODES` constant object |
| `lib/logger.js` | Structured logger with telemetry integration |
| `lib/telemetry.js` | Ring buffer + SSE pub/sub + MongoDB sink |

### middleware/
| File | Purpose |
|------|---------|
| `middleware/request-limits.js` | CORS, JSON body parser, URL length enforcement |

### models/
| File | Purpose |
|------|---------|
| `models/job.js` | Job model shim (re-exports from data/) |
| `models/telemetry-event.js` | TelemetryEvent Mongoose model |
| `models/worker-heartbeat.js` | WorkerHeartbeat Mongoose model |

### platforms/
| File | Purpose |
|------|---------|
| `platforms/registry.js` | Platform registry: host resolution, media host detection |

### runtime/
| File | Purpose |
|------|---------|
| `runtime/domain-context.js` | Domain context object for plugin system |
| `runtime/load-domains.js` | Domain plugin loader |
| `runtime/register-shutdown.js` | Graceful shutdown handler registration |
| `runtime/start-api-runtime.js` | API process bootstrap |
| `runtime/start-worker-runtime.js` | Worker process bootstrap |

### runtime/entrypoints/
| File | Purpose |
|------|---------|
| `entrypoints/app.js` | Express app definition (INTEGRATION SEAM -- imports from API) |
| `entrypoints/index.js` | Combined-mode entry point |
| `entrypoints/start-api.js` | Split-mode API entry point |
| `entrypoints/start-worker.js` | Split-mode Worker entry point |

### utils/
| File | Purpose |
|------|---------|
| `utils/account-profile.js` | Account slug derivation, path normalization |
| `utils/validation.js` | URL validation, `getPostUrlInfo`, `isTweetUrl`, `canonicalizePostUrl` |

## Consumer Map (Who Imports From Me)

This is the critical map. Every entry represents a dependency that can break.

| Core Module | Consumed By |
|-------------|-------------|
| `models/job` | API (jobs, contacts, retry, status), Worker (queue, recovery) |
| `models/worker-heartbeat` | API (worker-health), Worker (queue) |
| `models/telemetry-event` | Core internal (telemetry.js) |
| `constants/job-status` | API (jobs, retry, status, route-utils), Worker (process-job, queue, recovery), Services (extractor) |
| `lib/error-codes` | API (jobs, route-utils) |
| `lib/logger` | API (jobs, contacts, retry, status), Worker (process-job, queue), Services (all 3 files) |
| `lib/telemetry` | Core internal (domain-context, app.js) |
| `config/env` | Core internal (start-api-runtime, start-worker-runtime) |
| `config/platform-capabilities` | API (jobs, route-utils), Core internal (app.js) |
| `platforms/registry` | API (jobs, route-utils), Worker (process-job), Services (downloader, playwright-adapter) |
| `dispatch/resolve-domain-id` | API (jobs, retry, status) |
| `dispatch/route-job-by-domain` | Worker (process-job) |
| `domain/job-transitions` | API (status) |
| `middleware/request-limits` | Core internal (app.js) |
| `utils/validation` | API (jobs), Worker (process-job), Services (extractor) |
| `utils/account-profile` | Worker (process-job) |

## Dependency Map (I Import From)

| Source | What | Used In |
|--------|------|---------|
| `platforms/x/index.js` | X platform definition | `core/platforms/registry.js` |
| `platforms/tiktok/index.js` | TikTok platform definition | `core/platforms/registry.js` |
| `api/routes/*.js` | All Express routers | `core/runtime/entrypoints/app.js` |
| `worker/queue.js` | `startQueueWorker`, `stopQueueWorker` | `core/runtime/start-worker-runtime.js` |
| `worker/process-job.js` | `processOneCycle` | `core/runtime/start-worker-runtime.js` |
| `worker/recovery.js` | `recoverStaleJobs` | `core/runtime/start-worker-runtime.js` |
| `services/playwright-adapter.js` | `closePersistentContext` | `core/runtime/start-worker-runtime.js` |

## Work Steps

1. Read `server/src/core/CLAUDE.md` for current domain state
2. Read the specific files you need to modify
3. **Check the consumer map** -- identify ALL domains affected by your change
4. If changing an exported interface: notify ALL consuming domain stewards BEFORE implementing
5. Implement changes following domain rules above
6. Verify shims are intact (if modifying re-exported modules)
7. Verify middleware ordering (if modifying app.js)
8. Run post-work checks

## Post-Work Checks (MANDATORY)

After ANY change to this domain:

- [ ] Server starts in combined mode: `node server/src/core/runtime/entrypoints/index.js`
- [ ] No circular dependencies introduced (Node.js will throw on startup)
- [ ] All shims still re-export correctly (check constants/job-status.js, models/job.js)
- [ ] Middleware ordering preserved in app.js (if modified)
- [ ] Config functions use `getServerConfig()` not raw `process.env`
- [ ] Logger calls use structured format: event string + context object
- [ ] All consuming domains still work (check consumer map above)
- [ ] If export signature changed: all consumers updated
- [ ] If new model/constant added: shim created if needed for stable import path
- [ ] Update `server/src/core/CLAUDE.md` -- file inventory, consumer map, deps if changed
- [ ] Git commit the domain changes

## Cross-Domain Notification

Core changes have the widest blast radius. Follow this notification protocol:

### For ANY export change:
1. Check the consumer map above to identify ALL affected domains
2. Message EACH affected domain's steward agent
3. Include: what changed, what the new signature/behavior is, what consumers need to update
4. Wait for acknowledgment from all affected stewards before committing

### For new model/constant:
1. Decide if a shim is needed (do other domains need a stable import path?)
2. If yes, create the shim + canonical source
3. Update the domain CLAUDE.md with the new file

### For runtime changes:
1. Test both combined-mode and split-mode entry points
2. Verify graceful shutdown still works (SIGINT handler)
3. Verify MongoDB connection lifecycle (API: fire-and-forget, Worker: await)

### For middleware changes:
1. Test all API endpoints still work
2. Verify CORS headers are correct
3. Verify body parsing limits
4. Verify traceId propagation

## Common Mistakes to Avoid

- Changing an export without notifying consumers -- silent breakage across domains
- Removing a shim that other domains import from -- instant import errors
- Reordering middleware in app.js -- security and functionality implications
- Using `console.log` instead of `logger` in non-bootstrap code
- Reading `process.env` directly instead of `getServerConfig()` in runtime files
- Creating circular dependencies (Core -> Worker -> Core) -- Node.js throws
- Changing Job schema without updating all queries in API and Worker
- Modifying telemetry ring buffer size without considering memory impact
- Breaking the fire-and-forget MongoDB pattern in API runtime (must not block HTTP startup)
- Changing `JOB_STATUSES` enum values without updating the state machine in job-transitions.js

## Forbidden Actions

- NEVER modify files outside `server/src/core/`
- NEVER change an export without notifying ALL consumers
- NEVER remove a shim without verifying zero imports from other domains
- NEVER skip updating the domain CLAUDE.md after changes
- NEVER reorder middleware without security review
- NEVER introduce circular dependencies between domains
- NEVER block API HTTP startup on MongoDB connection (fire-and-forget pattern)
