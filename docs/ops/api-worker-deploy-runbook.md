# API + Worker Split-Runtime Deploy Runbook

Operational guide for running the API and worker as separate processes.
Currently both run together in a single process; this runbook documents
the target split configuration once Tasks 2–5 are merged.

## Runtime Modes

| Mode | `ROLE` env var | What starts |
|------|----------------|-------------|
| Combined (default) | unset | Express API + queue worker in one process |
| API only | `api` | Express HTTP server only — no queue polling |
| Worker only | `worker` | Queue worker only — no HTTP server |

> **Note:** There is no required `ROLE=combined` value for normal operation. Combined mode is selected by leaving `ROLE` unset (or absent from the environment). If you explicitly set `ROLE=combined`, current runtime treats it as combined mode.

## Startup Commands

### Combined (development default)
```bash
# Uses existing npm dev script
npm run dev:server
# Or directly:
node server/src/index.js
```

### API process only
```bash
# Using the dedicated entrypoint (recommended):
node server/src/start-api.js
# Or via npm script (from root):
npm run start:api --prefix server
```

### Worker process only
```bash
# Using the dedicated entrypoint (recommended):
node server/src/start-worker.js
# Or via npm script (from root):
npm run start:worker --prefix server
```

### Both together (split mode, with client — development)
```bash
# Starts API, worker, and Vite client concurrently:
npm run dev:split
```

### With nodemon (development, split)
```bash
npm run dev:api --prefix server   # API only
npm run dev:worker --prefix server  # Worker only
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | yes | MongoDB connection string (both processes) |
| `PORT` | API only | Express port (default 4000) |
| `ROLE` | no | `api` or `worker`; leave unset for combined mode |
| `TELEMETRY_SINK` | worker + api (split mode) | `mongo` (alias: `mongodb`) — writes telemetry events to MongoDB so the API process can relay them over SSE. **Required on both processes** when running split. |
| `ENABLE_X` | both | X platform flag |
| `ENABLE_TIKTOK` | both | TikTok platform flag |
| `PLAYWRIGHT_USER_DATA_DIR` | worker | Persistent browser profile path |
| `PLAYWRIGHT_HEADLESS` | worker | `false` for visible browser |
| `EXTRACTION_TIMEOUT_MS` | worker | Playwright extraction timeout |
| `FFMPEG_PATH` | worker | Custom ffmpeg binary path |

## Health Checks

### API health
```
GET /api/health
→ { ok: true, service: "x-dl-api", timestamp: "<ISO 8601 timestamp>" }
```
Confirms HTTP server is up. The `timestamp` field reflects the current server time.
MongoDB connectivity is confirmed separately — a healthy response does not guarantee DB access.

### Worker liveness
```
GET /api/worker/health
→ { ok: true, lastHeartbeatAt: "<ISO timestamp>", ageMs: 5000, staleAfterMs: 120000 }
```
Returns the age of the worker's most recent heartbeat write (30s cadence).
`ok: false` when `ageMs > 120000` (120s stale threshold) or when no heartbeat has
been recorded yet:
```
→ { ok: false, error: "No heartbeat recorded", lastHeartbeatAt: null, ageMs: null, staleAfterMs: 120000 }
```

### Telemetry stream
```
GET /api/telemetry/stream   (SSE)
```
Worker events (job claimed, extraction started, download complete) should appear
within 5s of a job being submitted. Silence on this stream indicates the worker
is not processing.

## Rollback

To revert to combined mode:
1. Unset `ROLE` env var (recommended), or set `ROLE=combined`.
2. Restart the process.
3. Both API and worker start in the same process — no coordination needed.

## Deployment Checklist

- [ ] Both processes share the same `MONGODB_URI`
- [ ] `ROLE=api` process has `PORT` set
- [ ] `ROLE=worker` process has Playwright deps available (Chromium, ffmpeg)
- [ ] `TELEMETRY_SINK=mongo` set on **both** API and worker processes (required for cross-process SSE visibility)
- [ ] Worker heartbeat endpoint returns `ok: true` within 60s of startup
- [ ] Submit a test job and verify it reaches `completed` or `failed` within expected time
- [ ] Telemetry stream shows worker events flowing to API

## Common Failure Modes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Jobs stuck in `queued` | Worker not running | Start `ROLE=worker` process |
| `GET /api/worker/health` → 404 | Worker heartbeat not deployed yet | Check Task 5 is merged |
| Telemetry stream empty | `TELEMETRY_SINK` not set on worker and/or API | Set `TELEMETRY_SINK=mongo` on **both** processes and restart |
| API returns 500 on job create | MongoDB not connected | Check `MONGODB_URI` on API process |
| Playwright timeouts | Worker needs `PLAYWRIGHT_USER_DATA_DIR` with auth session | Run `npm run auth:bootstrap` |

## Monitoring

For a single-developer setup, use the Activity Panel in the dashboard:
- Open `http://localhost:5173`
- The Activity Panel (right side) shows live telemetry from `/api/telemetry/stream`
- Filter by `jobId` or `traceId` to trace a specific job end-to-end
