---
name: debug-issue
description: Guided investigation of bugs in the Media Vault app. Walks through client console, API responses, server logs, MongoDB queries, and Playwright errors. Use when something is broken and you need to find the root cause.
allowed-tools: Read Grep Glob Bash(agent-browser *) Bash(netstat *) Bash(curl *)
argument-hint: "<symptom>"
---

# Debug Issue

Systematic investigation of a bug. Follow the layers in order —
most bugs are found by step 3.

## Arguments

`$ARGUMENTS` should describe the symptom:
- "jobs page won't load"
- "download button returns 404"
- "job stuck in running state"
- "video extraction fails on TikTok"
- "SSE telemetry stream disconnects"

## Step 1: Reproduce

Open the app and reproduce the bug:

```bash
agent-browser open http://localhost:5173
agent-browser snapshot
```

Confirm the bug is real. Screenshot the broken state:
```bash
agent-browser screenshot ./debug-evidence/01-broken-state.png
```

If you can't reproduce, note exactly what you tried.

## Step 2: Check the Client (client/src/)

Most user-visible bugs originate in the React layer.

### Console errors
```bash
agent-browser eval "window.__errors || 'no error capture'"
```

### State inspection
```bash
agent-browser snapshot
```

Look at the accessibility tree for clues: missing elements, empty text, wrong values.

### Common client issues
- **Stale polling data**: `useJobsPolling` returns stale data. Check if the polling
  interval is firing and the API response is fresh.
- **Optimistic UI desync**: `hiddenJobIds` hides a job that the server still returns.
  Check if the delete API actually succeeded.
- **Missing error handling**: `fetch('/api/...')` doesn't check `response.ok` or
  catch network errors.
- **Animation blocking**: Framer Motion `AnimatePresence` blocks removal if exit
  animation is misconfigured.
- **Proxy failure**: Vite proxy to Express not forwarding requests. Check vite.config.

Search for the symptom in source:
```
Grep for the error message text
Grep for the component name that's broken
Grep for the API endpoint being called
```

## Step 3: Check the API Layer (server/routes/)

Verify the route exists and returns correct data:

```bash
curl -s http://localhost:4000/api/jobs | head -c 500
```

For specific endpoints:
```bash
curl -s http://localhost:4000/api/jobs/{jobId}
curl -s -X POST http://localhost:4000/api/jobs -H "Content-Type: application/json" -d '{"url":"test"}'
```

Common API issues:
- **Route not registered**: New route handler exists but wasn't added to Express app
- **Wrong HTTP method**: Client sends POST but route expects PUT
- **Missing middleware**: Auth/validation middleware not applied
- **MongoDB query error**: Bad filter, missing index, connection dropped
- **Express 5 async**: Unhandled async errors should auto-propagate, but check if
  the error handler formats the response correctly

## Step 4: Check the Server Services (server/services/)

Read the specific service that's failing:

```
Grep for the service function name
```

Common service issues:
- **Playwright crash**: Browser context invalid, page closed, navigation timeout
- **ffmpeg hang**: Process spawned but never completes. Check for missing `-y` flag
  or incorrect input URL.
- **File path error**: Download path doesn't exist, permission denied, disk full
- **Race condition**: Two queue workers claim the same job (should be prevented by
  atomic findOneAndUpdate)
- **URL expiration**: Extracted media URL expired between extraction and download start

## Step 5: Check MongoDB State

If the bug involves job state:

```bash
curl -s http://localhost:4000/api/jobs | python3 -c "import sys,json; jobs=json.load(sys.stdin).get('jobs',[]); [print(f'{j[\"_id\"]}: {j[\"status\"]}') for j in jobs[:10]]"
```

Common data issues:
- **Stuck job**: Status is "running" but no worker is processing it (server restarted)
- **Missing fields**: Job document missing expected fields after schema change
- **Duplicate jobs**: Same URL submitted multiple times

## Step 6: Check Playwright/Extraction

If the bug involves video extraction:

- Read the extractor service code
- Check if the target site changed its page structure
- Look for bot detection / Cloudflare challenge indicators
- Verify Playwright browser context is still valid
- Check extraction timeout configuration

## Step 7: Check Telemetry/SSE

If the bug involves the telemetry stream:

```bash
curl -N http://localhost:4000/api/telemetry/stream &
sleep 5
kill %1
```

Verify SSE events are being emitted. Check the ring buffer implementation.

## Step 8: Report

```
Bug: [symptom]
Root cause: [specific code location and explanation]
Layer: client | api | service | database | playwright | ffmpeg
Fix: [what to change]
File: [path:line]
Regression risk: [what could break]
```

## Quick Reference: Most Common Bugs

| Symptom | Likely Cause | Where to Look |
|---------|-------------|---------------|
| Jobs page empty | API returns error or wrong shape | server/routes, curl test |
| Job stuck in "running" | Worker crashed, no recovery | server/services/queue |
| Download 404 | File path mismatch or deleted | server/routes/downloads |
| "Network error" in UI | Vite proxy misconfigured | client/vite.config.js |
| Extraction timeout | Site blocking Playwright | server/services/extractor |
| ffmpeg fails | Bad media URL or missing codec | server/services/downloader |
| Optimistic delete reverts | Delete API failed silently | client hiddenJobIds logic |
| SSE stream drops | Server restart or connection limit | server/routes/telemetry |
