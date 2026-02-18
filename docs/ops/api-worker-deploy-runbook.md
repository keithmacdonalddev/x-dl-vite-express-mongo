# API + Worker Split-Runtime Deploy Runbook

Operational guide for running the API and worker as separate processes.
Currently both run together in a single process; this runbook documents
the target split configuration once Tasks 2–5 are merged.

## Runtime Modes

| Mode | `ROLE` env var | What starts |
|------|----------------|-------------|
| Combined (default) | unset or `combined` | Express API + queue worker in one process |
| API only | `api` | Express HTTP server only — no queue polling |
| Worker only | `worker` | Queue worker only — no HTTP server |

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
ROLE=api node server/src/index.js
```

### Worker process only
```bash
ROLE=worker node server/src/index.js
```

### With nodemon (development)
```bash
ROLE=api nodemon server/src/index.js
ROLE=worker nodemon server/src/index.js
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | yes | MongoDB connection string (both processes) |
| `PORT` | API only | Express port (default 4000) |
| `ROLE` | no | `api`, `worker`, or unset (combined) |
| `TELEMETRY_SINK` | worker | `mongodb` to write telemetry to DB for API process to relay |
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
→ { ok: true, status: "ok" }
```
Confirms HTTP server is up and MongoDB is connected.

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
1. Unset `ROLE` env var (or set `ROLE=combined`).
2. Restart the process.
3. Both API and worker start in the same process — no coordination needed.

## Deployment Checklist

- [ ] Both processes share the same `MONGODB_URI`
- [ ] `ROLE=api` process has `PORT` set
- [ ] `ROLE=worker` process has Playwright deps available (Chromium, ffmpeg)
- [ ] Worker heartbeat endpoint returns `ok: true` within 60s of startup
- [ ] Submit a test job and verify it reaches `completed` or `failed` within expected time
- [ ] Telemetry stream shows worker events flowing to API

## Common Failure Modes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Jobs stuck in `queued` | Worker not running | Start `ROLE=worker` process |
| `GET /api/worker/health` → 404 | Worker heartbeat not deployed yet | Check Task 5 is merged |
| Telemetry stream empty | `TELEMETRY_SINK=mongodb` not set on worker | Add env var and restart |
| API returns 500 on job create | MongoDB not connected | Check `MONGODB_URI` on API process |
| Playwright timeouts | Worker needs `PLAYWRIGHT_USER_DATA_DIR` with auth session | Run `npm run auth:bootstrap` |

## Monitoring

For a single-developer setup, use the Activity Panel in the dashboard:
- Open `http://localhost:5173`
- The Activity Panel (right side) shows live telemetry from `/api/telemetry/stream`
- Filter by `jobId` or `traceId` to trace a specific job end-to-end
