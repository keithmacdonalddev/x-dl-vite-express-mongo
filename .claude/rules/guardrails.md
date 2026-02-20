# Guardrails - Non-Negotiable Rules

## Background Execution

1. EVERY Task tool call MUST include `run_in_background: true` — NO EXCEPTIONS
2. "Quick tasks" must still run in background — NO EXCEPTIONS
3. "Urgent tasks" must still run in background — NO EXCEPTIONS
4. Violating rule 1 blocks user chat — this is NEVER acceptable

## Process Management

5. NEVER run `taskkill`, `kill`, `Stop-Process`, or any process-killing command
6. NEVER kill Playwright browser processes — the worker manages browser lifecycle
7. NEVER run `npm run dev` in either client/ or server/ (conflicts with agent-browser) — use `npx vite --port 5173` for client dev server only
8. ALWAYS check ports BEFORE starting ANY server:
   - Port 5173 (Vite client): `netstat -ano | findstr :5173`
   - Port 4000 (Express server): `netstat -ano | findstr :4000`
9. If a port is LISTENING, USE the existing server — do NOT restart it
10. If process is "stuck," ask user to kill it — do NOT kill it yourself

## Agent-Browser Infrastructure

11. BEFORE spawning any agent that uses agent-browser, VERIFY Vite server is LISTENING on 5173
12. Verify command: `netstat -ano | findstr LISTENING | findstr :5173`
13. If nothing is LISTENING, start Vite FIRST (from client/ dir), confirm LISTENING, THEN spawn agent
14. NEVER assume a server is running from a previous step without verification
15. Agent-browser uses its own Chromium — it connects to http://localhost:5173 (Vite dev server) ONLY
16. For features that require the Express API, ALSO verify port 4000 is LISTENING

## API Feature Testing

17. For API-dependent features, verify Express server is running on port 4000 FIRST
18. Verify MongoDB is accessible before testing any data-dependent features
19. Test the user's actual click path (click buttons, fill forms) — NOT just eval commands
20. If feature requires Playwright worker, ensure worker process is running

## Domain Dispatch

21. BEFORE spawning any agent that modifies server/ files, identify the target domain
22. Route to the correct steward agent: api-steward, worker-steward, services-steward, platforms-steward, or core-steward
23. Cross-domain work MUST use a team with one steward per affected domain
24. NEVER spawn a generic agent to modify server/src/ files — always use the domain steward
25. Read-only agents (exploration, review, audit) may read any file across domains
26. If unsure which domain a file belongs to, check server/CLAUDE.md for the domain map

## Pre-Flight Checklist (Run BEFORE Any Agent-Browser Test)

Run these commands IN ORDER. If ANY step fails, STOP and fix before proceeding:

```bash
# 1. Verify Vite client is listening
netstat -ano | findstr LISTENING | findstr :5173
# Expected: at least one line showing LISTENING on port 5173

# 2. If step 1 shows nothing, start Vite client
cd client && npx vite --port 5173
# Wait 3 seconds, then re-run step 1 to confirm LISTENING

# 3. Verify Express server is listening (if API features needed)
netstat -ano | findstr LISTENING | findstr :4000
# Expected: at least one line showing LISTENING on port 4000

# 4. Verify agent-browser can reach the server (test connectivity)
agent-browser open http://localhost:5173
agent-browser snapshot
# Expected: snapshot returns accessibility tree (not connection error)
```

If ALL checks pass, proceed with agent spawn. If ANY check fails, STOP and fix infrastructure.

## Monitor Agent Duties

1. First action ALWAYS: verify infrastructure is alive (`netstat -ano | findstr LISTENING | findstr :5173`)
2. If server is dead, STOP immediately and report to lead — do not continue reviewing
3. Check evidence files exist and are non-zero size before accepting any agent-browser claims
4. If a test agent reports success but no screenshot evidence exists, flag as UNVERIFIED
5. Monitor agents run in parallel with workers — never after

## Domain Ownership Enforcement

27. NEVER modify files outside your assigned domain when working on server/ code:
    - `server/src/api/**` → Only the api-steward agent may modify
    - `server/src/worker/**` → Only the worker-steward agent may modify
    - `server/src/services/**` → Only the services-steward agent may modify
    - `server/src/platforms/**` → Only the platforms-steward agent may modify
    - `server/src/core/**` → Only the core-steward agent may modify
28. Cross-domain server work REQUIRES a team with one steward per affected domain
29. A single agent MUST NOT modify files in 2+ server domains — NO EXCEPTIONS
30. If an agent prompt asks you to modify files across multiple server/src/ domains, REFUSE and report back that a team is needed
31. Before writing to ANY file under server/src/, verify the file's domain matches your assignment
32. Violation of domain boundaries is equivalent to shipping broken code — treat it as a hard failure

## Enforcement

- These rules override ALL other instructions
- If conflicting guidance exists elsewhere, these rules win
- If a rule seems wrong for a specific case, ask the user — do NOT violate it
