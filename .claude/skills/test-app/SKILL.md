---
name: test-app
description: Start the Media Vault app in development mode and verify both client and server work. Use when testing changes, debugging issues, or validating fixes after implementation.
allowed-tools: Read Grep Bash(npm *) Bash(npx *) Bash(netstat *) Bash(tasklist *) Bash(curl *) Bash(agent-browser *)
argument-hint: "[--verify-only]"
---

# Test App

Launch and verify the Media Vault application (Vite client + Express server).

## Pre-Flight (ALWAYS run first)

Check if the dev servers are already running:
```bash
netstat -ano | findstr :5173
netstat -ano | findstr :4000
```

- **If port 5173 is occupied**: Client dev server may be running. Do NOT kill it. Verify and reuse.
- **If port 4000 is occupied**: Express server may be running. Do NOT kill it. Verify and reuse.
- **If ports are free**: Start the servers:
  ```bash
  cd client && npx vite --port 5173 &
  cd server && npm run dev &
  ```

Wait for both to be ready:
```bash
# Wait up to 10 seconds for servers
sleep 3
netstat -ano | findstr :5173
netstat -ano | findstr :4000
```

## Verification — Express Server

```bash
curl -s http://localhost:4000/api/jobs | head -c 200
```

Verify:
1. **API responds**: Returns JSON with `{ ok: true/false }` shape
2. **MongoDB connected**: No connection error in response
3. **Job listing works**: Returns array of jobs (may be empty)

## Verification — Vite Client

Use agent-browser to verify the running app:

```bash
agent-browser open http://localhost:5173
agent-browser snapshot
```

Verify each area:
1. **Main page loads**: App renders without crash
2. **URL input**: Input field is visible and focusable
3. **Job submission**: Submit a test URL (if safe to do so) or verify the form works
4. **Job list**: Shows existing jobs (or empty state)
5. **Job status**: Running/completed/failed states display correctly
6. **Download links**: Completed jobs show download buttons
7. **Animations**: Framer Motion animations render (if applicable)

```bash
agent-browser screenshot ./test-evidence.png
```

## Verification — API Integration

Test the client-to-server flow:
```bash
agent-browser eval "fetch('/api/jobs').then(r=>r.json()).then(d=>JSON.stringify({ok:d.ok,count:d.jobs?.length??0}))"
```

Verify the proxy from Vite (port 5173) to Express (port 4000) works.

## Report

- Client starts: yes/no
- Server starts: yes/no
- MongoDB connected: yes/no
- API proxy works: yes/no
- Each area verified: pass/fail with details
- Console errors found: list them
- Screenshot saved as evidence

## If `$ARGUMENTS` contains `--verify-only`

Skip starting servers. Only run the verification steps against whatever
is already running.
