# Server Team Responsibilities

Six responsibility areas for `server/src/`. Each area has a defined scope,
an allowed interface, and an escalation path for cross-boundary changes.

> Note: This is a single-developer project. "Team" here means logical code domains,
> not separate human teams. These boundaries prevent modules from becoming entangled
> and enforce the dependency rules in `docs/architecture/module-boundaries.md`.

---

## 1. Server Shell

**Scope:** `server/src/index.js`, `server/src/app.js`

**Responsibilities:**
- MongoDB connection and disconnect
- Express app creation, middleware mounting, route registration
- Queue worker startup and graceful shutdown
- Playwright browser lifecycle (open on start, close on SIGTERM)
- HTTP server listen and close

**Allowed interfaces:**
- Imports from `config/`, `lib/`, `routes/`, `middleware/`, `worker/`, `models/`
- May orchestrate any domain — this is the composition root

**Escalation:** Changes here affect startup order and shutdown safety.
Test graceful shutdown manually: `Ctrl+C` during an active job should wait
for job completion before exiting.

---

## 2. Data Model

**Scope:** `server/src/models/`, `server/src/constants/`, `server/src/domain/`

**Responsibilities:**
- Mongoose schema definitions (Job)
- Job status and source type enums (`JOB_STATUSES`, `SOURCE_TYPES`)
- Valid state transition definitions

**Allowed interfaces:**
- `constants/` may import nothing else
- `models/` may import `constants/` and `lib/` only
- `domain/` may import `constants/` only
- Consumed by: routes, worker, services

**Escalation:** Schema changes (adding/removing fields) require updating:
- `server/src/routes/jobs.js` (PATCH validation)
- `server/src/worker/process-job.js` (field writes)
- `server/src/routes/helpers/route-utils.js` (any projection or sanitization)

---

## 3. Routes

**Scope:** `server/src/routes/`, `server/src/middleware/`

**Responsibilities:**
- HTTP request validation and response shaping
- CRUD operations via Mongoose (via models)
- traceId extraction and propagation
- URL and input validation (via utils)
- Bulk operations (bulk-delete)

**Allowed interfaces:**
- May import: `models/`, `utils/`, `lib/`, `config/`, `platforms/`, `constants/`, `routes/helpers/`
- Must NOT import: `services/`, `worker/`
- Job state changes go through MongoDB only — routes write `status: queued`
  and read whatever status the worker has set

**Escalation:** New route needs to be registered in `server/src/app.js`.
Validation logic shared across routes goes in `routes/helpers/route-utils.js`.

---

## 4. Platforms

**Scope:** `server/src/platforms/`

**Responsibilities:**
- Platform registry (X, TikTok host resolution)
- Per-platform definitions (host patterns, 403-retry flags)
- Client-facing platform capability flags

**Allowed interfaces:**
- May import: `config/`, `lib/`, `constants/`
- Consumed by: routes (capability checks), worker/services (platform-specific logic)
- Platform definitions are data-only — no HTTP or DB calls

**Escalation:** Adding a new platform requires:
1. `server/src/platforms/<name>/index.js`
2. Register in `server/src/platforms/registry.js`
3. Add `ENABLE_<NAME>=true` to `server/.env.example`
4. Update `client/src/features/intake/useIntake.js` with platform hosts

---

## 5. Worker / Queue

**Scope:** `server/src/worker/`

**Responsibilities:**
- Queue polling loop (1s interval, recursive setTimeout)
- Atomic job claim (`findOneAndUpdate` on `status: queued`)
- Job processing pipeline (extract → pick media → download → save)
- Worker heartbeat writes (30s cadence)
- Stale job recovery on startup

**Allowed interfaces:**
- May import: `models/`, `services/`, `lib/`, `config/`, `constants/`, `utils/`, `platforms/`
- Must NOT import: `routes/`
- Communicates with routes layer ONLY through MongoDB job status

**Escalation:** Changes to job processing order affect the pipeline in
`server/src/worker/process-job.js`. Timeout changes need both
`EXTRACTION_TIMEOUT_MS` env var and the Playwright adapter config.

---

## 6. Services

**Scope:** `server/src/services/`, `server/src/utils/`

**Responsibilities:**
- Playwright singleton context and page management (playwright-adapter.js)
- Media URL extraction via network interception (extractor-service.js)
- Direct MP4 fetch and HLS ffmpeg download (downloader-service.js)
- Account slug derivation and path normalization (account-profile.js)
- URL validation and tweet URL parsing (validation.js)

**Allowed interfaces:**
- May import: `models/`, `lib/`, `config/`, `platforms/`, `utils/`, `constants/`
- Consumed by: `worker/` only (services must not be called from routes)
- Services are stateful (Playwright context) — initialize once, reuse across jobs

**Escalation:** Playwright session issues require manual login:
```bash
npm run auth:bootstrap
```
ffmpeg path issues: set `FFMPEG_PATH` in `server/.env`.

---

## Cross-Area Coordination

| Change | Coordinate with |
|--------|----------------|
| New job field | Data Model + Routes + Worker |
| New platform | Platforms + Routes + Client intake |
| New service | Services + Worker (worker imports it) |
| New route | Routes + Server Shell (register in app.js) |
| Shutdown order change | Server Shell (test manually) |
| Telemetry event shape | Lib + Client activity panel |

## Forbidden Cross-Area Shortcuts

- Routes calling services directly — add a queue job instead
- Worker importing route logic — worker is headless; extract shared logic to utils
- Services importing worker — circular dependency
- Models importing routes — schema-level routing creates circular deps
