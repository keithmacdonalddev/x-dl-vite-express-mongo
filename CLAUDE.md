# Media Vault

Social media video downloader for X (Twitter) and TikTok. Monorepo with a Vite + React 19 client and Express 5 + MongoDB server. Uses Playwright for browser-based media extraction and ffmpeg for HLS stream downloads.

## Architecture

```
┌──────────────────────────────────────────────┐
│           React Client (Vite 7)              │
│  App.jsx - Hash router (dashboard/contact)   │
│  features/ - intake, dashboard, activity     │
│  hooks/ - useJobsPolling (3s interval)       │
│  api/ - jobsApi fetch wrapper                │
└─────────────┬────────────────────────────────┘
              │ /api/* proxy (Vite → :4000)
┌─────────────┴────────────────────────────────┐
│         Express 5 API (:4000)                │
│  routes/ - jobs, contacts, retry, status     │
│  middleware/ - CORS, body limits, traceId    │
│  /downloads - static file serving            │
└─────────┬──────────┬─────────────────────────┘
          │          │
  ┌───────┴───┐  ┌───┴──────────────────────┐
  │  MongoDB  │  │  Background Queue Worker  │
  │  (Atlas)  │  │  1s poll interval         │
  │           │  │  atomic job claim (FIFO)  │
  │  Job model│  │  ┌──────────────────────┐ │
  │  statuses:│  │  │ Playwright Extractor │ │
  │  queued   │  │  │ singleton context    │ │
  │  running  │  │  │ network interception │ │
  │  completed│  │  └──────────┬───────────┘ │
  │  failed   │  │  ┌──────────┴───────────┐ │
  │  canceled │  │  │ Downloader Service   │ │
  │           │  │  │ fetch (direct MP4)   │ │
  │           │  │  │ ffmpeg (HLS .m3u8)   │ │
  │           │  │  └──────────┬───────────┘ │
  └───────────┘  └─────────────┴─────────────┘
                               │
                    server/downloads/
                    └── <accountSlug>/
                        ├── <jobId>.mp4
                        └── thumbnails/
                            └── <jobId>.jpg
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI Framework | React 19.2 |
| Build Tool | Vite 7.3 |
| Animation | Framer Motion 12 |
| Server | Express 5.2 |
| Database | MongoDB (Mongoose 9.2) |
| Browser Automation | Playwright 1.58 |
| Video Processing | ffmpeg (system PATH or `FFMPEG_PATH`) |
| Process Manager (dev) | nodemon 3.1 |
| Concurrency (dev) | concurrently 9.2 |

## Monorepo Structure

```
x-dl-vite-express-mongo/          # Root (orchestration scripts only)
├── package.json                   # Root scripts: dev, build, test, verify
├── client/                        # Vite + React (ESM, type: module)
│   ├── package.json               # Separate install
│   └── src/
└── server/                        # Express + Mongoose (CommonJS)
    ├── package.json               # Separate install
    ├── .env                       # Environment config (not committed)
    └── src/
```

No npm workspaces. Each package has its own `node_modules`. Install separately:
```bash
cd client && npm install
cd server && npm install
```

## Key Files

### Client

| File | Purpose |
|------|---------|
| `client/src/App.jsx` | Hash router: dashboard + contact profile views |
| `client/src/components/JobsPage.jsx` | Central dashboard component |
| `client/src/components/ContactProfilePage.jsx` | Per-contact job history view |
| `client/src/components/ConfirmModal.jsx` | Shared confirmation dialog |
| `client/src/hooks/useJobsPolling.js` | 3s polling loop for job list |
| `client/src/api/jobsApi.js` | Fetch wrapper for all `/api/*` calls |
| `client/src/features/intake/IntakeForm.jsx` | URL submission form |
| `client/src/features/intake/useIntake.js` | Intake logic + platform classifier |
| `client/src/features/dashboard/JobsList.jsx` | Job list with selection + bulk actions |
| `client/src/features/dashboard/JobRow.jsx` | Individual job card |
| `client/src/features/dashboard/JobEditForm.jsx` | Inline job editing |
| `client/src/features/dashboard/useJobActions.js` | Delete, retry, bulk-delete actions |
| `client/src/features/dashboard/useSelection.js` | Multi-select state for bulk ops |
| `client/src/features/activity/ActivityPanel.jsx` | Real-time telemetry feed (SSE) |
| `client/src/features/activity/eventTranslator.js` | Raw telemetry → human-readable text |
| `client/src/platforms/index.js` | Client-side platform definitions |
| `client/src/App.css` | Global styles |
| `client/vite.config.js` | Vite config with `/api` proxy to :4000 |

### Server

| File | Purpose |
|------|---------|
| `server/src/index.js` | Entry point: MongoDB connect, HTTP listen, queue start, graceful shutdown |
| `server/src/app.js` | Express app: middleware, routes, telemetry SSE, static downloads |
| `server/src/models/job.js` | Mongoose Job schema (statuses, paths, metadata, timestamps) |
| `server/src/constants/job-status.js` | `JOB_STATUSES` and `SOURCE_TYPES` enums |
| `server/src/routes/jobs.js` | CRUD: list, get, create, update, delete, bulk-delete |
| `server/src/routes/contacts.js` | Contact aggregation routes |
| `server/src/routes/retry.js` | Job retry endpoint |
| `server/src/routes/status.js` | Job status transition endpoint |
| `server/src/routes/helpers/route-utils.js` | Shared route helpers (sendError, file deletion, validation) |
| `server/src/worker/queue.js` | Queue worker: 1s interval, atomic job claim |
| `server/src/worker/process-job.js` | Job processing: extract → pick media → download → save |
| `server/src/worker/recovery.js` | Recover stale `running` jobs after server restart |
| `server/src/services/extractor-service.js` | Playwright-based media URL extraction |
| `server/src/services/downloader-service.js` | Direct fetch + ffmpeg HLS download |
| `server/src/services/playwright-adapter.js` | Singleton persistent Chromium context |
| `server/src/platforms/registry.js` | Platform registry (X, TikTok) with host resolution |
| `server/src/platforms/x/index.js` | X (Twitter) platform definition |
| `server/src/platforms/tiktok/index.js` | TikTok platform definition |
| `server/src/config/env.js` | `getServerConfig()` — port, mongoUri |
| `server/src/config/platform-capabilities.js` | Runtime enable/disable per platform |
| `server/src/lib/logger.js` | Structured logger (publishes to telemetry ring buffer) |
| `server/src/lib/telemetry.js` | In-memory ring buffer + SSE pub/sub |
| `server/src/lib/error-codes.js` | Standardized error code constants |
| `server/src/utils/validation.js` | URL validation, `isTweetUrl`, `getPostUrlInfo` |
| `server/src/utils/account-profile.js` | Account slug derivation, path normalization |
| `server/src/middleware/request-limits.js` | CORS, JSON body parser, URL length enforcement |
| `server/src/domain/job-transitions.js` | Valid state transition definitions |

## Commands

```bash
# Development (both client + server concurrently)
npm run dev                    # concurrently: Vite :5173 + Express :4000

# Individual dev servers
npm run dev:client             # Vite on :5173
npm run dev:server             # Nodemon on :4000

# Build
npm run build                  # Vite production build (client only)

# Production
npm start                      # node server/src/index.js

# Linting
npm run lint                   # ESLint (client only)

# Auth bootstrap
npm run auth:bootstrap         # Bootstrap Playwright auth session

# Verification
npm run check                  # PowerShell structural checks
npm run verify                 # test + build + lint + check (full CI gate)
npm run test                   # Tests (currently disabled in both packages)
```

## API Endpoints

All responses follow `{ ok: true/false, ... }` format. Errors include `code` string and `error` message.

### Jobs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs` | List jobs (query: `?limit=50&status=queued`) |
| GET | `/api/jobs/:id` | Get single job |
| POST | `/api/jobs` | Create job (body: `{ tweetUrl }`) |
| PATCH | `/api/jobs/:id` | Update job (body: `{ tweetUrl?, accountDisplayName? }`) |
| DELETE | `/api/jobs/:id` | Delete job + files |
| POST | `/api/jobs/bulk-delete` | Bulk delete (body: `{ jobIds: [...] }`) |

### Contacts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs/contacts` | List contacts (aggregated from jobs) |

### Status & Retry
| Method | Path | Description |
|--------|------|-------------|
| PATCH | `/api/jobs/:id/status` | Transition job status |
| POST | `/api/jobs/:id/retry` | Retry a failed job |

### System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/capabilities` | Platform enable/disable state |
| PATCH | `/api/capabilities` | Toggle platforms (body: `{ platforms: { x: true } }`) |
| GET | `/api/telemetry` | Query telemetry events (query: `?jobId=&traceId=&level=&limit=`) |
| GET | `/api/telemetry/stream` | SSE stream of telemetry events |
| GET | `/downloads/*` | Static file serving for downloaded media |

## Key Architecture Patterns

### Job Processing Pipeline
```
POST /api/jobs → status:queued → Worker claims (atomic findOneAndUpdate) → status:running
  → Playwright extracts media URLs (network interception)
  → pickMediaUrl() ranks candidates (direct MP4 > HLS, scored by resolution/bitrate/codec)
  → Download: fetch stream (direct) or ffmpeg (HLS .m3u8)
  → Output: server/downloads/<accountSlug>/<jobId>.mp4 → status:completed
  → On error → status:failed (with error message)
```

### Playwright Singleton
- Persistent Chromium context (non-headless by default) stored at `PLAYWRIGHT_USER_DATA_DIR`
- Detects Cloudflare challenges and login walls; keeps page open for manual solve
- Configurable timeouts: navigation, extraction, manual-solve polling

### Telemetry SSE
- Structured logger publishes events to in-memory ring buffer (`TELEMETRY_HISTORY_LIMIT` entries)
- `/api/telemetry/stream` sends historical events on connect, then live events via SSE
- 15s heartbeat keeps connection alive
- Filterable by `jobId`, `traceId`, `level`

### traceId Flow
UUID generated per HTTP request → stored on Job document → flows through worker logs → SSE telemetry stream. Enables end-to-end request tracing.

### Platform Registry
Pluggable platform system. To add a new platform:
1. Create `server/src/platforms/<name>/index.js` (follow X/TikTok template)
2. Register in `server/src/platforms/registry.js`
3. Add `ENABLE_<NAME>=true` to `server/.env.example`
4. Add hosts to client intake classifier (`client/src/features/intake/useIntake.js`)

### Client Polling (No WebSocket)
- `useJobsPolling` hook polls `GET /api/jobs` every 3s
- Optimistic UI: deletions hide items via `hiddenJobIds` before next poll confirms removal
- No router library: hash-based routing in `App.jsx` (`#/` = dashboard, `#/contacts/<slug>` = profile)

### Download Path Convention
- Stored as relative paths: `downloads/<accountSlug>/<jobId>.mp4`
- Forward slashes always (cross-platform)
- Path-traversal safe: validated against `DOWNLOADS_ROOT`
- Thumbnails: `downloads/<accountSlug>/thumbnails/<jobId>.jpg`

### Error Retry Logic
- TikTok 403 → re-extract with fresh URL
- 401/403 → fallback to Playwright authenticated download
- Stale `running` jobs recovered on server restart (`worker/recovery.js`)

## Environment Variables

Copy `server/.env.example` to `server/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4000 | Express server port |
| `MONGODB_URI` | (required) | MongoDB connection string |
| `MONGODB_DNS_SERVERS` | (empty) | Custom DNS servers for Atlas (comma-separated) |
| `ENABLE_X` | true | Enable X (Twitter) platform |
| `ENABLE_TIKTOK` | true | Enable TikTok platform |
| `TELEMETRY_HISTORY_LIMIT` | 4000 | Max telemetry events in ring buffer |
| `EXTRACTION_TIMEOUT_MS` | 180000 | Total extraction timeout (3 min) |
| `PLAYWRIGHT_USER_DATA_DIR` | .playwright-profile | Persistent browser profile path |
| `PLAYWRIGHT_HEADLESS` | false | Run Chromium headless |
| `PLAYWRIGHT_SETTLE_MS` | 3000 | Wait for network idle after navigation |
| `PLAYWRIGHT_NAV_TIMEOUT_MS` | 45000 | Page navigation timeout |
| `PLAYWRIGHT_MANUAL_SOLVE_TIMEOUT_MS` | 90000 | Manual CAPTCHA/login solve timeout |
| `PLAYWRIGHT_MANUAL_SOLVE_POLL_MS` | 1000 | Poll interval during manual solve |
| `FFMPEG_PATH` | (empty) | Custom ffmpeg binary path (empty = system PATH) |

## File Ownership (Agent Teams)

Avoid conflicts when using agent teams:

- `server/src/app.js` + `server/src/index.js` → Backend teammate
- `server/src/routes/**` → Routes teammate
- `server/src/worker/**` + `server/src/services/**` → Worker/pipeline teammate
- `server/src/platforms/**` → Platform teammate
- `client/src/App.jsx` + `client/src/App.css` → Client shell teammate
- `client/src/features/**` → Features teammate
- `client/src/components/**` → Components teammate
- `client/src/hooks/**` + `client/src/api/**` → Data layer teammate
- `server/src/models/**` → Shared (coordinate with routes + worker teammates)

## Important Notes

- **Express 5**: Async errors in route handlers are automatically caught. Do NOT wrap handlers in try/catch for the purpose of calling `next(err)`.
- **No state library**: Client uses React local state + hooks only. No Redux, no Zustand, no Context API for global state.
- **No router library**: Hash-based routing implemented manually in `App.jsx`. Two views: dashboard and contact profile.
- **Monorepo without workspaces**: `client/` and `server/` have separate `package.json` and `node_modules`. Root `package.json` only orchestrates via `--prefix`.
- **CommonJS server / ESM client**: Server uses `require()` (type: commonjs). Client uses `import` (type: module).
- **Framer Motion**: Animations respect `useReducedMotion()` for accessibility.
- **Vite proxy**: Client dev server proxies `/api/*` to `http://localhost:4000`. No CORS issues in development.
- **Static file serving**: Downloaded media served via `express.static` at `/downloads`.
- **Graceful shutdown**: Server handles SIGINT/SIGTERM — stops worker, closes HTTP, closes Playwright, disconnects MongoDB.
- **Job statuses**: `queued` → `running` → `completed` | `failed` | `canceled`. Atomic claim prevents double-processing.
- **Source types**: `direct` (MP4 fetch), `hls` (ffmpeg), `unknown` (pre-extraction).
- **API response format**: Always `{ ok: true/false, ... }`. Errors include `code` and `error` fields.
- **traceId header**: `x-trace-id` propagated through request → job → telemetry for full tracing.
- **Tests disabled**: Both client and server test scripts are stubs (`echo "Tests disabled"`).

## Git Policy (Automated)

Git is managed automatically. The user should never need to think about commits, staging, or git state.

### Auto-Commit

- After completing any task (feature, fix, refactor, config change)
- After completing each task in a multi-task plan
- After successful build verification
- Before starting risky changes
- After updating rules, skills, or CLAUDE.md

Small frequent commits are always better than large infrequent ones.

### Commit Messages

Format: `<type>: <what changed and why>`

Types: `add` (new feature), `update` (enhance existing), `fix` (bug fix), `refactor` (restructure), `style` (CSS/visual), `docs` (documentation), `config` (build/tooling)

### Staging Rules

- Stage specific files by name (never `git add .` or `git add -A`)
- Group related files into one commit
- Never commit `.env`, secrets, or `node_modules`

### Push Policy

- Auto-push after every commit
- Never force push
- If push fails, report to user and continue

### Branch Strategy

- `main` is the only branch (single developer project)
- All work happens on `main`

## Reference Documentation

For detailed patterns and rules, see `.claude/rules/` directory (if present).
