# Team Review Playbook (Lead Checklist)

I am the lead. I coordinate, steer, and synthesize. I don't implement.
Teammates don't see this memory file, but they DO auto-load:
- Project root CLAUDE.md (architecture, API, design system overview)
- .claude/rules/*.md (all rules files including agent-teams.md)
- Local CLAUDE.md files in directories they work in

This means spawn prompts can be shorter — domain-specific context is in the local files.
Spawn prompts should focus on: collaboration preamble + domain-specific CHECKLIST.

**Model selection:**
(Per agent-teams.md → Operational Details → Model Selection)
- Review agents: Sonnet (reads + reports, doesn't need Opus reasoning depth)
- Security agent: Opus (attack chain tracing needs deep reasoning)
- Verification agent (Step 3): Sonnet
- Lead (me): Opus (always)
Specify model via `model` parameter in Task tool when spawning.

---

## When user asks for a full review/audit:

### Step -1: Confirm Intent (MANDATORY — before any technical work)

1. Restate the user's request: "You're asking for [X], meaning [Y in plain terms]. Is that right?"
2. If user confirms → capture as Intent Statement for the plan
3. If user says "not quite" → ask clarifying questions until they confirm
4. Capture before-state of the affected area (screenshot or description)
5. Record in plan's User Intent Context section
6. DO NOT proceed to Step 0 without confirmed intent

**Why this step exists:** The system has no other checkpoint for intent fidelity. If intent is misunderstood here, every downstream quality gate (monitors, confidence checks, agent-browser verification) will pass while building the wrong thing. This is the only moment to catch it.

### Step 0: Pre-flight check + dev server

(Per agent-teams.md → Operational Details → Verification → Pre-Flight Check)

Before spawning agents, I check what's already running:
```bash
netstat -ano | findstr :5173    # Is the dev server already running?
```
- If port 5173 is already occupied → reuse it, don't start a second server
- If nothing is running → start dev server in background
- If the port is used by something else the user is running → ask which port to use

Agents that need visual verification will use agent-browser against the running URL.
I never kill or restart the user's own processes.

### Step 1: Spawn 5 agents

(Per agent-teams.md → Team Templates → 1. Code Review)

I create a team and spawn these 5. NEVER fewer. NEVER merge domains.

Each agent's prompt gets the collaboration preamble PLUS their domain checklist.
The preamble (per agent-teams.md → Operational Details → Communication):
```
You are on a team with 4 other reviewers. As you review, whenever you find
something that affects another agent's domain, MESSAGE that teammate directly
with what you found and what they should check. Don't wait until you're done.
Create tasks in the shared task list for any cross-domain issue you discover.
If another agent messages you, investigate their lead IMMEDIATELY.

For every Critical/High finding, include:
- The actual FIX CODE (not just a description)
- Effort estimate (15min / 30min / 1hr / 2-4hr)
- What could BREAK if this fix is applied (regression risk)

Also report POSITIVE FINDINGS — things done correctly that should not be changed.

COMPLETION PROTOCOL: When you finish your review, do NOT just say "done."
Run the review confidence checklist:
1. Every finding has a file:line reference
2. Every instance enumerated (count + list, not "some")
3. Fix code provided for every Critical/High
4. Cross-domain messages sent for every finding that crosses domains
5. Positive findings documented
6. Visual findings backed by agent-browser evidence (snapshot or screenshot)
Report which items pass and which don't. The lead will verify before accepting.
```

**security** — additional instructions:
- Trace full ATTACK CHAINS end-to-end across multiple routes/middleware
- Include CWE numbers for every vulnerability
- Check: CORS configuration, helmet headers, rate limiting
- Check: SSRF via any user-configurable URL
- Check: Input validation on all routes (params, body, query)
- Check: Authentication/authorization middleware coverage
- Check: MongoDB injection via unsanitized query parameters
- Check: File upload handling (size limits, type validation, path traversal)
- Check: Dependencies for known CVEs (`npm audit`)
- **USE agent-browser**: Open the app, test for XSS, check response headers
- Message code agent when you find an exploit chain so they verify reachability
- Message docs agent when you find a security property docs claim but code lacks

**code** — additional instructions:
- ENUMERATE every instance — "these 11 functions lack try/catch" not "some lack it"
- Check BOTH server AND client code
- Check: error handling in routes, middleware, and database operations
- Check: connection error handling (MongoDB, external APIs)
- Catalog all magic numbers
- Check for code duplication (same logic in multiple places)
- Check for stale/contradictory rules in .claude/rules/
- Message security when you find unvalidated inputs flowing to dangerous ops
- Message design when you find inline styles that duplicate CSS patterns
- Message docs when you find function signatures that differ from docs

**uiux** — additional instructions:
- **USE agent-browser FIRST**: Before reading ANY code, open the app
  and experience it as a first-time user. Navigate every page. Click every
  button. Try to accomplish real tasks. Form opinions about what works and what
  doesn't BEFORE looking at the source.

  Your review has TWO parts:

  PART 1 — Product experience (do this first, with agent-browser only):
  - What's your first impression? Is the purpose of the app immediately clear?
  - Navigate each major flow
  - How many clicks to reach common actions? Where is there unnecessary friction?
  - Does the visual hierarchy guide your attention to what matters?
  - What feedback does the app give during loading, errors, empty states?
  - What's confusing? What's missing? What would you change as a user?
  - Screenshot anything noteworthy — good or bad

  PART 2 — Accessibility verification (combine agent-browser with code reading):
  - `agent-browser press Tab` repeatedly through each view — log which elements
    receive focus and which are skipped. Screenshot missing focus rings.
  - `agent-browser snapshot` on each view — verify ARIA roles appear in the tree
  - `agent-browser click` every interactive element — verify it responds
  - Check: :focus-visible on ALL interactive elements (enumerate missing ones WITH evidence)
  - Check: prefers-reduced-motion media query
  - Check: all ARIA attributes (role, aria-label, aria-selected, aria-modal, aria-live)
  - Check: clickable divs that should be buttons (enumerate all — snapshot reveals these)
  - Check: :active pseudo-class for press feedback
  - Check: :disabled visual states (do disabled buttons look different?)
  - Check: empty states, loading states, error states for every view

- Message security about clickjacking risk on div-as-button elements
- Message design to reconcile accessibility findings with token violations
- Message design with product enhancement ideas that need new design tokens

**design** — additional instructions:
- QUANTIFY tokenization adoption rates per category (colors, fonts, spacing, radii, transitions)
- Check for unused CSS variables (defined in :root but never referenced)
- Propose a complete :root block with all needed variables
- Provide phased migration roadmap with effort estimates per phase
- Count every raw value vs every tokenized value
- **USE agent-browser**: Screenshot each major view. Use `get styles` on key elements
  to verify computed values match design tokens. Visual evidence of inconsistencies
  is stronger than code-only findings.
- Message uiux: "Here are the untokenized font sizes — are these the same ones you flagged?"

**docs** — additional instructions:
- Check for rules that CONTRADICT the actual codebase (stale rules are worse than missing)
- Check ALL .md files in project root (not just CLAUDE.md)
- Verify every referenced file, function, method, constant actually exists
- Check every count (lines, components, routes, methods) against actual code
- Message code when you find documented behavior that code doesn't implement
- Message security when you find security claims the docs make

### Step 2: Steer DURING the review (don't just wait)

(Per agent-teams.md → 5 Gate Checks → Gate 2: Non-Blocking)

As messages come in from agents, I actively connect dots:
- Security finds exploit chain → I message code: "verify this path is reachable"
- Code finds unhandled functions → I message docs: "do any docs claim error handling?"
- Design says 0% font tokenization → I message uiux: "does the rendered UI actually look broken?"
- Docs finds a contradictory rule → I message code: "does any code rely on this stale rule?"
- Two agents find overlapping issues → I message both: "reconcile and deduplicate"
- Ambiguous finding → I have the two relevant agents debate it

### Step 3: Verification round

(Per agent-teams.md → 5 Gate Checks → Gate 3: Who Checks the Work)

After initial findings stabilize, I ask code agent (or spawn a 6th) to:
- Read top 10 critical/high findings from all agents
- Trace actual code paths to confirm each is real
- Mark each: VERIFIED / FALSE POSITIVE / NEEDS-MORE-INFO
- Write fix code for verified findings

### Step 4: Compile report

I write the report with these required sections:
1. Executive Summary — top 3 findings, overall health, counts by severity
2. Verified Critical/High Findings — with fix code, effort, regression risk, dependency
3. All Findings by Domain — 5 sections
4. Cross-Cutting Themes — I synthesize patterns across domains:
   - Incomplete refactoring (old patterns left behind)
   - Missing validation layer (trust boundaries)
   - Specs that exist only in docs, not code
   - Absent infrastructure (accessibility, error handling)
   - Inconsistent application of patterns
5. Fix Dependency Graph — which fixes must happen before others
6. Impact x Effort Matrix:
   ```
                Low Effort    High Effort
   High Impact  [DO FIRST]    [PLAN CAREFULLY]
   Low Impact   [EASY WINS]   [DEFER]
   ```
7. Positive Findings — what's well-implemented (prevents regression)
8. Migration Roadmap — phased plan with effort per phase
9. File-Level Issue Counts

### Step 5: Collect metrics

(Per agent-teams.md → Operational Details)

Before shutting down, I gather per-agent data for the scorecard:
- Count each agent's findings (total, by severity)
- From the verification round: how many were VERIFIED vs FALSE POSITIVE
- Count cross-domain messages each agent sent and how many led to new findings
- Compare each agent's self-reported confidence against my verification
- Note whether each agent's model was adequate, overkill, or insufficient
- Note any prompt adjustments needed (too vague → high false positives, etc.)

Append the scorecard to `memory/team-metrics.md` using the template.

### Step 6: Shutdown and cleanup

(Per agent-teams.md → Operational Details → Recovery)

Shutdown all agents, run Teammate cleanup.

---

## When user asks to fix review findings:

(Per agent-teams.md → Team Templates → 2. Implementation)

### Step -1: Confirm Intent (MANDATORY — before any technical work)

1. Restate the user's request: "You're asking for [X], meaning [Y in plain terms]. Is that right?"
2. If user confirms → capture as Intent Statement for the plan
3. If user says "not quite" → ask clarifying questions until they confirm
4. Capture before-state of the affected area (screenshot or description)
5. Record in plan's User Intent Context section
6. DO NOT proceed to Step 1 without confirmed intent

### Step 1: Build the dependency graph from the review report

I identify which fixes block others. Example:
```
Tier 1: Critical security fixes (unblocks all other work)
Tier 2: Database schema/model fixes (need stable foundation)
Tier 3: Independent fixes in parallel (routes, middleware, client)
Tier 4: Polish (CSS, UX, documentation)
```

### Step 2: Spawn agents by DOMAIN ownership

(Per agent-teams.md → File Ownership → Server Domains)

NOT by finding type. Server agents align with domain boundaries. All Sonnet unless noted:
- **api-steward**: server/src/api/** (routes, helpers) -- use /api-work skill
- **worker-steward**: server/src/worker/** (queue, process-job, recovery) -- use /worker-work skill
- **services-steward**: server/src/services/** (extractor, downloader, playwright-adapter) -- use /services-work skill
- **core-steward**: server/src/core/** (models, config, middleware, lib, utils, dispatch, runtime) -- use /core-work skill
- **platforms-steward**: server/src/platforms/** (x, tiktok definitions) -- use /platforms-work skill
- **client**: React components, features, hooks, CSS

Cross-domain changes go through steward messaging, never direct file edits.

Enter **delegate mode** (Shift+Tab) immediately after spawning.

### Step 3: Create all tasks with dependencies upfront

(Per agent-teams.md → Operational Details → Task Management)

Use TaskCreate + TaskUpdate addBlockedBy so agents automatically know the order.
Assign Tier 1 tasks immediately. Aim for **5-6 tasks per agent**.
After Tier 1, let agents **self-claim** from the task list — only intervene
to steer or relay integration boundary changes.

### Step 4: Run build + visual verification after each tier completes

Don't let fixes pile up untested. After each tier:
- Run build to confirm no compilation errors
- Use agent-browser to visually verify the changes

### Step 5: Relay integration boundary changes

When server changes an API response shape → I message client agents.
When styles adds new CSS classes → I message component agents.
When models change schema → I message route/service agents.

### Step 6: Verify and collect metrics

After final tier completes:
- Run build to confirm no regressions
- Grep for any remaining instances of patterns that should be fully migrated
- Collect per-agent scorecard data (tasks completed, regressions, confidence accuracy)
- Append scorecard to `memory/team-metrics.md`

---

## When user asks for a new feature:

(Per agent-teams.md → Team Templates → 3. Feature Development)

### Step -1: Confirm Intent (MANDATORY — before any technical work)

1. Restate the user's request: "You're asking for [X], meaning [Y in plain terms]. Is that right?"
2. If user confirms → capture as Intent Statement for the plan
3. If user says "not quite" → ask clarifying questions until they confirm
4. Capture before-state of the affected area (screenshot or description)
5. Record in plan's User Intent Context section
6. DO NOT proceed to Step 0 without confirmed intent

### Step 0: Pre-flight check + dev server

Check if dev server is already running. Reuse if so.
Start dev server only if nothing is on the expected port.
Agent-browser has its own Chromium. Never kill user processes.

### Step 1: Spawn architect agent in plan mode

Architect's FIRST action is to open the app with agent-browser and use it.
They need to understand:
- Where this feature fits in the existing navigation
- What the current workflow looks like for the task this feature improves
- What UX patterns exist (so the new feature feels native, not bolted on)
- What screen real estate is available
- What adjacent UI elements the feature needs to integrate with

Only AFTER using the app does the architect read code and produce an API contract:
```
{ route, method, params, returns, errorShape }
```
Plus: component structure, state additions, CSS classes needed.
I approve the plan before anyone implements.

### Step 2: Spawn 3 implementers (server, client, styles)

All work against the architect's contract. Server is unblocked first
(client is blocked until API routes exist).

### Step 3: Integrate and test

Run build. If issues, message the responsible agent.

### Step 4: Verify confidence and collect metrics

Each agent reports their implementation confidence checklist before I accept:
- Code matches the architect's contract?
- All instances addressed (grep verified)?
- No leftover debug code?
- Build passes?

I spot-check at least one item per agent. Append scorecard to `memory/team-metrics.md`.

---

## When user reports a cross-layer bug:

(Per agent-teams.md → Team Templates → 4. Bug Investigation)

### Step -1: Confirm Intent (MANDATORY — before any technical work)

1. Restate the user's request: "You're asking for [X], meaning [Y in plain terms]. Is that right?"
2. If user confirms → capture as Intent Statement for the plan
3. If user says "not quite" → ask clarifying questions until they confirm
4. Capture before-state of the affected area (screenshot or description)
5. Record in plan's User Intent Context section
6. DO NOT proceed to Step 1 without confirmed intent

### Step 1: Spawn 2-3 investigators with competing hypotheses

Each investigates a different layer (server routes, database queries, client state).

### Step 2: They message each other with evidence

One agent's evidence narrows the search space for others.
If they disagree on root cause, I have them debate — present evidence to each other.

### Step 3: Assign the fix

When root cause is found, the agent who owns that file implements the fix.
A second agent verifies it doesn't regress.

### Step 4: Verify and collect metrics

Bug investigation confidence checklist:
- Root cause confirmed by 2+ agents or traced end-to-end by lead?
- Competing hypotheses explicitly eliminated with evidence?
- Fix tested — build passes?
- Second agent verified no regression?

Append scorecard: which hypothesis was correct, how many messages to converge,
whether model assignments were appropriate. Update `memory/team-metrics.md`.

---

## When user asks for a large refactor:

(Per agent-teams.md → Team Templates → 5. Refactoring / Migration)

### Step -1: Confirm Intent (MANDATORY — before any technical work)

1. Restate the user's request: "You're asking for [X], meaning [Y in plain terms]. Is that right?"
2. If user confirms → capture as Intent Statement for the plan
3. If user says "not quite" → ask clarifying questions until they confirm
4. Capture before-state of the affected area (screenshot or description)
5. Record in plan's User Intent Context section
6. DO NOT proceed to Step 1 without confirmed intent

### Step 1: Define the target state explicitly

BAD: "clean up the code"
GOOD: "extract all inline database queries into service modules with consistent error handling"

### Step 2: Foundation agent goes first

They define the new patterns/structure. Other agents are blocked until
the foundation is confirmed.

### Step 3: Consumers update in parallel

Remaining agents apply the new patterns to their file ownership areas simultaneously
(they own different files, so no conflict).

### Step 4: Verify and collect metrics

Refactoring confidence checklist:
- Inventory complete — grep confirms zero remaining instances of old pattern?
- All migrations consistent — no mixed old/new patterns in same file?
- Build passes?
- Visual verification shows no regressions?

Append scorecard to `memory/team-metrics.md`. Note inventory agent accuracy
(did they find all instances, or did implementation agents discover more?).

---

## Recovery

(Per agent-teams.md → Operational Details → Recovery and 5 Gate Checks → Platform Limitations)

**If context compresses mid-team (session compaction/resume):**
In-process teammates are lost. Run `cleanup` on the stale team, create a fresh
team, spawn new agents. The task list persists — check it to see what was
completed before the interruption.

**If a teammate crashes or goes unresponsive:**
Wait ~5 min for automatic timeout. Then reassign their uncompleted tasks to
another active agent, or spawn a replacement into the same team.

**If the lead accidentally implements instead of delegating:**
Stop. Enter delegate mode (Shift+Tab). Message the appropriate agent to
take over the work. Don't create a mixed state where both lead and agent
have partial changes to the same file.

---

## When working with domain teams:

### Domain-Aware Task Assignment

Server changes must respect domain boundaries. When assigning tasks:

1. **Identify which domain owns the file** -- check `server/src/<domain>/CLAUDE.md`
2. **Use the domain skill gate** -- assign the task with a note to invoke /api-work, /worker-work, etc.
3. **Cross-domain changes need coordination** -- if a task spans domains, split into one task per domain with `blockedBy` dependencies
4. **Read domain CLAUDE.md before spawning** -- each domain's CLAUDE.md lists dependencies and consumers so you know who to notify

### Domain Steward Workflow

Each domain has a steward agent (`.claude/agents/<domain>-steward.md`). When spawning domain work:

- The steward invokes the domain's skill gate as their first action
- The skill gate reads the domain CLAUDE.md, verifies the change is within boundary, runs pre-work checks
- After work is done, the skill gate runs post-work checks and updates the domain CLAUDE.md if needed
- Cross-domain interface changes trigger mandatory notification to consuming domains

### Domain Change Notification Protocol

When a change crosses domain boundaries:
1. Identify consumers from the domain's CLAUDE.md "Consumers" section
2. Message each consuming domain's steward with: what changed, which export/interface, whether it's breaking
3. Wait for acknowledgment before merging
4. Both domain CLAUDE.md files must be updated to reflect the change

### File Ownership for Multi-Domain Tasks

Example: Adding a new API endpoint that requires a new Job field:
- Task A (Core): Add field to Job schema in `core/data/job-model.js` -- /core-work
- Task B (API): Add route handler in `api/routes/jobs.js` -- /api-work, blocked by Task A
- Task C (Worker): Read new field in `worker/process-job.js` -- /worker-work, blocked by Task A

---

## Context File Maintenance

Local CLAUDE.md files contain RULES and PATTERNS, never hardcoded counts.
- "Use service modules for database access" = stable rule (good)
- "~1131 lines, 64 routes, 38 models" = hardcoded fact that drifts (bad)

After any implementation team finishes, I check if any CLAUDE.md rules
were violated or rendered stale by the changes, and update them.

Domain CLAUDE.md files are the single source of truth for their domain.
After any server change, the affected domain's CLAUDE.md must be updated
by the domain steward. The lead verifies this happened.
