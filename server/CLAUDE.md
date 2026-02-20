# ⛔ DO NOT USE THIS DIRECTORY AS A WORKING DIRECTORY

**Valid working directories for server agents are ONLY the 5 domain directories:**
- `server/src/api/` — API domain (api-steward)
- `server/src/core/` — Core domain (core-steward)
- `server/src/platforms/` — Platforms domain (platforms-steward)
- `server/src/services/` — Services domain (services-steward)
- `server/src/worker/` — Worker domain (worker-steward)

If you are an agent and your working directory is `server/`, you are misconfigured. Report this to the lead and stop work.

---

# server/ -- Domain Architecture Hub

The server is organized into 5 autonomous domains, each with strict ownership boundaries. Every domain has its own CLAUDE.md containing the authoritative file inventory, dependency map, interface contract, and coding rules.

## Domains

| Domain | Directory | Steward | Skill | CLAUDE.md |
|--------|-----------|---------|-------|-----------|
| **API** | `src/api/` | api-steward | /api-work | [src/api/CLAUDE.md](src/api/CLAUDE.md) |
| **Worker** | `src/worker/` | worker-steward | /worker-work | [src/worker/CLAUDE.md](src/worker/CLAUDE.md) |
| **Services** | `src/services/` | services-steward | /services-work | [src/services/CLAUDE.md](src/services/CLAUDE.md) |
| **Platforms** | `src/platforms/` | platforms-steward | /platforms-work | [src/platforms/CLAUDE.md](src/platforms/CLAUDE.md) |
| **Core** | `src/core/` | core-steward | /core-work | [src/core/CLAUDE.md](src/core/CLAUDE.md) |

## Domain Boundary Rule

No agent outside a domain's team may create, modify, or delete files in that domain's directory. All changes must go through the domain's skill gate and steward agent.

## Dependency Flow

```
Platforms (zero deps)
    |
    v
Core (imports Platforms definitions)
    |
    v
+---+---+---+
|   |       |
v   v       v
API Worker  Services
|   |       ^
|   +-------+
|   (Worker imports Services)
+----------->
(API imports Services: profile discovery only)
```

- **Platforms** has zero external dependencies (pure data)
- **Core** imports from Platforms (registry), API (router mounting), Worker (queue lifecycle), Services (browser shutdown)
- **API** imports from Core (models, constants, utils, config) and Services (`triggerProfileDiscovery` for profile discovery)
- **Worker** imports from Core (models, constants, utils) and Services (extraction, download)
- **Services** imports from Core only (logger, constants, registry, models for discovery dedup)

## Cross-Domain Change Protocol

1. Identify which domain owns the code you need to change
2. Use the domain's skill gate (e.g., /api-work) to access the files
3. If the change affects an interface consumed by other domains, notify those domains' stewards
4. Interface changes require acknowledgment from consuming domain stewards before merging

## Express 5

This project uses Express 5. Key differences from Express 4:
- Async route handlers automatically catch errors -- do NOT wrap in try/catch for `next(err)`
- `app.delete()` works (not just `app.del()`)
- Path-to-regexp v8 syntax for route params
- `req.query` returns a plain object (no prototype)

## API Response Contract

All routes return consistent shape:
```javascript
// Success
res.json({ ok: true, data: { ... } })

// Error
res.json({ ok: false, code: 'INVALID_URL', error: 'URL is not a supported platform' })
```

## Job Processing Pipeline

```
POST /api/jobs -> status:queued -> Worker claims (atomic findOneAndUpdate) -> status:running
  -> Playwright extracts media URLs (network interception)
  -> pickMediaUrl() ranks candidates (direct MP4 > HLS, scored by resolution/bitrate/codec)
  -> Download: fetch stream (direct) or ffmpeg (HLS .m3u8)
  -> Output: server/downloads/<accountSlug>/<jobId>.mp4 -> status:completed
  -> On error -> status:failed (with error message)
```

## traceId Pattern

UUID flows through the entire pipeline for debugging:
- HTTP request middleware generates `req.traceId` (from `x-trace-id` header or `randomUUID()`)
- Stored on Job document
- Worker logs include traceId
- SSE telemetry stream tagged with traceId

## Runtime Modes

The entry point (`src/core/runtime/entrypoints/index.js`) supports three modes:
- **combined** (default, no ROLE set): API + Worker in one process
- **api** (ROLE=api): Express server only, via `src/core/runtime/entrypoints/start-api.js`
- **worker** (ROLE=worker): Queue worker only, via `src/core/runtime/entrypoints/start-worker.js`

## Environment

Copy `.env.example` to `.env`. Key vars:
- `MONGODB_URI` -- MongoDB connection string
- `PORT` -- Server port (default 4000)
- `ROLE` -- Runtime mode: api, worker, or combined (default)
- `PLAYWRIGHT_HEADLESS` -- false for visible browser (default)
- `EXTRACTION_TIMEOUT_MS` -- Playwright timeout (default 180000)
- `FFMPEG_PATH` -- empty = use system PATH
- `TELEMETRY_SINK` -- memory (default for combined) or mongo (default for split)

## CommonJS

Server uses `require()` / `module.exports`. `"type": "commonjs"` in package.json. Client uses ESM.
