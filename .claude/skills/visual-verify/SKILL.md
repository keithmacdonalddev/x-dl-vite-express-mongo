---
name: visual-verify
description: Verify specific UI features using agent-browser. Agent-invocable only — used by teammates to validate their changes visually AND functionally.
user-invocable: false
allowed-tools: Bash(agent-browser *) Bash(netstat *) Read
argument-hint: "<area|functional> [--screenshot path]"
---

# Visual Verify

Verify a specific area of the app using agent-browser. This skill serves
THREE purposes — all are required for implementation confidence checks:

1. **Visual verification** — Does it look right?
2. **Functional verification** — Does it work right?
3. **Intent verification** — Does it match what the user asked for?

## Arguments

`$ARGUMENTS` should contain the area to verify. Valid areas:

**Visual areas:**
- `main` — Main page, URL input, job list
- `jobs` — Job cards, status indicators, progress
- `downloads` — Download links, file management
- `settings` — Settings/configuration (if present)
- `animations` — Framer Motion transitions, loading states
- `focus` — Focus rings and keyboard navigation
- `all` — Full walkthrough of every area

**Functional areas (runtime behavior):**
- `functional` — Full functional verification of all flows
- `functional:submit` — Job submission flow (input URL, submit, see queued job)
- `functional:status` — Job status updates (queued -> running -> completed/failed)
- `functional:download` — Download completed video
- `functional:delete` — Delete job and verify optimistic UI
- `functional:polling` — Verify 3s polling interval updates job list
- `functional:errors` — Trigger error conditions, verify user feedback
- `functional:state` — Verify every state field has a writer that updates UI

Optional `--screenshot path` saves evidence to the specified path.

## Step 1: Confirm App is Running

```bash
netstat -ano | findstr :5173
```

If not running, STOP and report: `App not running on port 5173. Start dev server first with: cd client && npx vite --port 5173`

Also check Express:
```bash
netstat -ano | findstr :4000
```

If not running, note: `Express server not running on port 4000. API calls will fail.`

## Step 2: Open App

```bash
agent-browser open http://localhost:5173
```

## Step 3: Verify Requested Area

### Visual Areas

#### main
```bash
agent-browser snapshot
```
- Verify main page renders
- URL input is visible and has placeholder text
- Submit button is present
- Job list renders (or shows empty state)

#### jobs
- Verify job cards display with correct status
- Check status indicators (colors, icons)
- Verify progress indicators for running jobs

#### downloads
- Navigate to a completed job
- Verify download button/link is present
- Check file size display

#### animations
- Submit a job or trigger a state change
- Verify Framer Motion animations render
- Check loading spinners/skeletons

#### focus
```bash
agent-browser press Tab
```
- Tab through current view
- Verify focus rings appear on interactive elements
- Report any elements that are skipped or lack visible focus

#### all
- Run every visual area check above in sequence

### Intent Verification (MANDATORY for implementation/feature/fix)

- Read the Intent Statement from the plan
- Compare the current app state against the target
- Document any gaps between intent and implementation

### Functional Areas (Runtime Behavior)

#### functional:submit
1. Enter a URL in the input field
2. Click Submit button
3. **VERIFY**: New job appears in the list
4. **VERIFY**: Job shows "queued" status
5. **VERIFY**: Input field clears after submission
6. Take screenshot at each state transition

#### functional:status
1. Observe a queued/running job
2. Wait for polling to update
3. **VERIFY**: Status transitions are reflected in UI
4. **VERIFY**: Completed jobs show download option
5. **VERIFY**: Failed jobs show error message

#### functional:delete
1. Click delete on a job
2. **VERIFY**: Job disappears immediately (optimistic UI)
3. **VERIFY**: Job stays hidden after next poll
4. Take screenshot before and after

#### functional:errors
1. Submit an invalid URL
2. **VERIFY**: Error message appears
3. **VERIFY**: App remains functional after error
4. Try submitting when server is down
5. **VERIFY**: Network error is handled gracefully

## Step 4: Capture Evidence

If `--screenshot` was specified:
```bash
agent-browser screenshot [path]
```

## Report Format

### Visual Report
```
Visual Verification: [area]
- Status: PASS | FAIL
- Details: [what was checked and result]
- Evidence: [snapshot excerpt or screenshot path]
- Issues found: [list any problems, or "none"]
```

### Functional Report
```
Functional Verification: [area]
- Status: PASS | FAIL

Flow: [operation name]
  Step 1: [action taken] — [PASS/FAIL] — Evidence: [screenshot]
  ...

Issues found:
- [severity] [description] — Evidence: [screenshot path]
```
