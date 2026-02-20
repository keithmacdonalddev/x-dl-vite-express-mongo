# CTO Review — Evaluation Framework

Detailed criteria for each of the 8 evaluation sections. Apply every applicable item to modified files.

## 1. Logic & API Correctness

- Does the feature behave as intended per the plan?
- Does every Express route return `{ ok: true/false }` consistently?
- Are request parameters validated before processing?
- Are MongoDB queries correct (proper filters, projections, sort)?
- Are edge cases handled (empty arrays, missing documents, null values)?
- For every new route, verify it is registered in the Express app. A route handler with no registration is dead code.
- For every client fetch call, verify the URL matches a registered route. Mismatched paths = silent 404s.
- Wiring checklist: UI control -> client fetch -> Express route -> service -> Mongoose -> response -> client state -> render. If ANY link is missing, severity is HIGH.

## 2. Data & File Integrity

- Can concurrent job processing corrupt download files?
- Are partial downloads cleaned up on failure (incomplete .mp4 files)?
- Does client state stay consistent if the API call succeeds but the UI update fails?
- Are file paths constructed safely (no `../` traversal, validated against DOWNLOADS_ROOT)?
- If a file is deleted between listing and serving, does the error propagate cleanly?
- Are there TOCTOU race conditions in file operations?
- Is MongoDB data integrity maintained (atomic updates, proper use of findOneAndUpdate)?
- Are job state transitions valid (queued->running->completed/failed, no skipping)?

## 3. Security & Input Validation

- Are all user-supplied URLs validated before passing to Playwright?
- Can user input reach MongoDB queries without sanitization (NoSQL injection)?
- Are file paths confined to DOWNLOADS_ROOT (no arbitrary reads via crafted paths)?
- Is path traversal prevented in download serving endpoints?
- Could a crafted URL cause SSRF (server-side request forgery via Playwright)?
- Are API keys/secrets kept in .env and never leaked to client responses?
- Is the Playwright browser context properly sandboxed?
- Could malicious video metadata cause XSS when rendered in the client?
- Are rate limits in place for job submission?

## 4. Failure Modes

What happens if:
- Playwright crashes or the browser context becomes invalid?
- MongoDB connection drops mid-operation?
- ffmpeg process hangs or returns non-zero?
- The target site returns 403/429/500 during extraction?
- Disk space runs out during download?
- The user submits 50 jobs simultaneously?
- A download URL expires between extraction and download start?
- The SSE telemetry stream disconnects?
- An unhandled exception occurs in the queue worker?

**Scenario Tracing Requirement:**
For every failure scenario, trace the COMPLETE execution path through the code.

## 5. Performance & Responsiveness

- Does the queue worker block on synchronous operations?
- Could large video downloads (1GB+) cause memory issues?
- Are there N+1 query patterns in MongoDB operations?
- Does the client polling interval (3s) cause excessive server load?
- Are Playwright pages closed after extraction to free memory?
- Are large response payloads (job lists) paginated?
- Are there O(n^2) or worse loops in the modified code?

## 6. Regression & Cross-Feature Risk

- Does the change affect the job state machine transitions?
- Could this break existing download flows for X vs TikTok?
- Does the change affect the SSE telemetry stream?
- Were any shared services modified that other features depend on?
- Could this break the optimistic UI deletion flow?

## 7. Observability & Debugging

- Are all operations logged via the structured logger with traceId?
- If a job fails, can the failure be diagnosed from telemetry alone?
- Are there silent catch blocks that swallow errors without logging?
- Would a stuck job (running forever) be diagnosable from logs alone?
- Are error messages user-friendly (not raw stack traces)?

## 8. State Lifecycle & Cleanup

- Are Playwright pages/contexts closed after use?
- Are temporary files cleaned up on job failure?
- When a job is deleted, are its download files also removed?
- Are stale "running" jobs detected and recovered (e.g., after server restart)?
- Are SSE connections cleaned up on client disconnect?
- Are intervals (polling, queue) cleared on shutdown?

## Exceeds Expectations — Mandatory Questions

1. Would a senior engineer be IMPRESSED by this code?
2. Are error messages actionable — does the user know what went wrong AND what to do?
3. Is defensive programming comprehensive — every edge case, not just happy path?
4. Does the architecture make future changes EASIER, not harder?
5. **If you showed this to the user RIGHT NOW, would they say "this exceeds what I asked for"?**

If #5 is "no" — that is a HIGH severity finding.
