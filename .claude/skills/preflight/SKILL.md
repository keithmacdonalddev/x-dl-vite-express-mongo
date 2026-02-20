---
name: preflight
description: Run pre-flight checks before starting team operations. Verifies port availability, running processes, MongoDB connection, and system readiness.
model: haiku
allowed-tools: Bash(netstat *) Bash(tasklist *) Bash(wmic *) Bash(curl *) Read Glob
argument-hint: "[port-number]"
---

# Pre-Flight Check

Verify system readiness before spawning agent teams or starting dev servers.

## Step 1: Check Vite Dev Server (Port 5173)

```bash
netstat -ano | findstr :5173
```

### If port is occupied:
- Check what process owns it:
  ```bash
  tasklist | findstr -i "node"
  ```
- If it's the Vite dev server -> **reuse it**. Report:
  `Port 5173 occupied by Vite dev server. Reusing existing server.`
- If it's something else -> **do NOT kill it**. Report:
  `Port 5173 occupied by [process]. Cannot start dev server. User action needed.`

### If port is free:
Report: `Port 5173 available. Client dev server can be started.`

## Step 2: Check Express Server (Port 4000)

```bash
netstat -ano | findstr :4000
```

### If port is occupied:
- If it's the Express server -> **reuse it**.
- If it's something else -> report and stop.

### If port is free:
Report: `Port 4000 available. Express server can be started.`

## Step 3: Check MongoDB Connection

```bash
curl -s http://localhost:4000/api/jobs 2>/dev/null || echo "Express not responding"
```

If Express is running, check that it can reach MongoDB by hitting an API endpoint. If the response includes an error about MongoDB connection, report it.

If Express is not running, check if MongoDB is reachable:
```bash
netstat -ano | findstr :27017
```

Report MongoDB status: `MongoDB: listening on 27017 | not detected`

## Step 4: Check Node Processes

```bash
tasklist | findstr -i "node"
```

Report any running Node processes. Flag if more than 5 are active (potential
resource contention for agent teams).

## Step 5: Check Playwright Browser

Verify Playwright browsers are installed:
```bash
npx playwright install --dry-run chromium 2>&1 || echo "Playwright not configured"
```

Report: `Playwright: browsers installed | needs install`

## Step 6: Verify Project Dependencies

Check that node_modules exists in both client and server:

```bash
ls client/node_modules/.package-lock.json 2>/dev/null && echo "Client deps: OK" || echo "Client deps: MISSING"
ls server/node_modules/.package-lock.json 2>/dev/null && echo "Server deps: OK" || echo "Server deps: MISSING"
```

If either is missing, report: `Dependencies not installed. Run npm install in {client|server} first.`

## Step 7: Check Disk Space (Optional)

```bash
wmic logicaldisk where "DeviceID='C:'" get FreeSpace /format:value
```

Flag if less than 1GB free (video downloads can be large).

## Step 8: Capture Before State (for implementation/feature/fix tasks)

If this preflight is for an implementation, feature, or bug fix task:

1. Open the app area that will be changed:
   ```
   agent-browser open http://localhost:5173
   ```
2. Navigate to the affected feature/page
3. Capture the current state:
   ```
   agent-browser screenshot ./evidence/before-state.png
   agent-browser snapshot
   ```
4. Describe in 2-3 sentences what the user currently sees

Report: `Before state captured: ./evidence/before-state.png`

## Report Format

```
Pre-Flight Check Results:
- Vite (5173): available | occupied by [process]
- Express (4000): available | occupied by [process]
- MongoDB (27017): listening | not detected
- Node processes: N running
- Playwright: installed | needs install
- Client dependencies: installed | missing
- Server dependencies: installed | missing
- Disk space: adequate | low (N GB free)
- Before state: captured | not applicable
- Recommendation: ready | [specific blockers]
```
