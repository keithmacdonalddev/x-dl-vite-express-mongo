# x-dl Vite + Express + Mongo

Localhost rewrite of x-dl with a browser-based jobs dashboard and an Express worker pipeline.

## Architecture

- `client/`: Vite + React dashboard for creating and monitoring jobs
- `server/`: Express + Mongoose API and background queue processor
- `docs/`: implementation plans and testing matrix
- `scripts/`: PowerShell helpers for dev and release checks

## Prerequisites

- Node.js 20+
- MongoDB Atlas connection string
- `ffmpeg` installed and available on `PATH` (for HLS workflow)

## Setup

1. Install dependencies:

```bash
npm install
npm install --prefix client
npm install --prefix server
```

2. Create server env file:

```bash
copy server\\.env.example server\\.env
```

3. Set `MONGODB_URI` inside `server/.env`.
4. Optional feature flags inside `server/.env`:
   - `ENABLE_X=true`
   - `ENABLE_TIKTOK=true`

## Run Locally

- Start both apps:

```bash
npm run dev
```

- Or with PowerShell helper:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1
```

- Open `http://localhost:5173`.

## Manual Login Session (Playwright)

The extractor now uses a persistent Playwright browser profile in production worker runs.

1. Run bootstrap once:

```bash
npm run auth:bootstrap --prefix server
```

2. A browser window opens on X login.
3. Log in manually as yourself.
4. Return to terminal and press Enter.
5. Future jobs reuse the same local session profile (`PLAYWRIGHT_USER_DATA_DIR`).

## Platform Feature Flags

Server-side feature flags control which source sites are allowed for job creation.

- `ENABLE_X=true|false`
- `ENABLE_TIKTOK=true|false`

The UI reads `/api/capabilities` and shows platform availability as enabled/disabled chips.
If a URL targets a disabled platform, the API rejects it with `PLATFORM_DISABLED`.
You can now toggle `X.com` and `TikTok` directly from the intake chips in the frontend; the server remains the enforcement source of truth.

### Example Flow

1. Set flags in `server/.env`:
   - `ENABLE_X=false`
   - `ENABLE_TIKTOK=true`
2. Start server.
3. Client calls `GET /api/capabilities` and receives:
```json
{
  "ok": true,
  "platforms": {
    "x": false,
    "tiktok": true
  }
}
```
4. UI shows `X.com` and `TikTok` chips with clear enabled/disabled state.
5. Submitting an X URL returns:
```json
{
  "ok": false,
  "code": "PLATFORM_DISABLED",
  "error": "X downloads are currently disabled by server configuration."
}
```
6. Submitting a TikTok URL is still accepted normally.

### Runtime Toggle API

Use this endpoint when toggling flags from UI/admin tools:

```json
PATCH /api/capabilities
{
  "platforms": {
    "x": true,
    "tiktok": false
  }
}
```

## Real-Time Telemetry

The API now publishes high-detail pipeline telemetry for each request/job lifecycle, including:

- HTTP request start/completion (`traceId`, status code, duration)
- Job creation validation and queueing
- Queue claim and worker attempt metadata
- Extraction steps (`goto`, media/image discovery, metadata collection)
- Download mode selection and transfer details (status, bytes, duration)
- Thumbnail download progress
- Final completion/failure with timing and artifact paths

Endpoints:

- `GET /api/telemetry?limit=200&traceId=<id>&jobId=<id>&level=info|error`
- `GET /api/telemetry/stream` (Server-Sent Events)

The dashboard subscribes to `/api/telemetry/stream` and renders a live "Live Pipeline Logs" panel.
Each new intake submission returns `traceId`, allowing end-to-end request-to-worker correlation.

### X Challenge Behavior

If X shows Cloudflare/interstitial pages (for example "Just a moment..." or captcha), extraction now classifies it as a bot challenge and fails fast with explicit telemetry instead of hanging in `running`.

Related env:

- `PLAYWRIGHT_MANUAL_SOLVE_TIMEOUT_MS` (manual challenge wait window)
- `EXTRACTION_TIMEOUT_MS` (overall extraction hard timeout, default `180000`)

## Script Reference

- `npm run dev`: run server and client together
- `npm run dev:server`: run API only
- `npm run dev:client`: run client only
- `npm run test`: run server + client automated tests
- `npm run build`: build client
- `npm run lint`: lint client
- `npm run check`: validate release checklist files and required scripts
- `npm run verify`: test + build + lint + release checklist
- `npm run auth:bootstrap --prefix server`: open persistent browser for manual X login

## Operations

- [API + Worker Split-Runtime Deploy Runbook](docs/ops/api-worker-deploy-runbook.md) — startup commands, health checks, rollback, common failures
- [Team Responsibilities](docs/ownership/team-responsibilities.md) — server domain ownership and cross-area coordination
- [Module Boundaries](docs/architecture/module-boundaries.md) — allowed/forbidden dependency edges enforced by `check:boundaries`

## Verification Matrix

See `docs/testing-matrix.md` for automated and manual verification steps.
