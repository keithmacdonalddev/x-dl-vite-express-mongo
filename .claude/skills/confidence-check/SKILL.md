---
name: confidence-check
description: Run the appropriate confidence checklist for a task type. Agent-invocable only — teammates call this before marking tasks complete.
user-invocable: false
model: haiku
allowed-tools: Read Grep Glob Bash(agent-browser *) Bash(netstat *)
argument-hint: "<checklist-type>"
---

# Confidence Check

Run a confidence checklist to verify task completion quality. Every item must
pass with evidence before the task can be marked complete.

**CRITICAL: Agent-browser runtime verification is MANDATORY for implementation,
bug, and refactoring checklists.** Structural code analysis alone has a proven
80% ceiling. The remaining bugs hide in runtime behavior — timer lifecycles,
state wiring, error propagation — and can ONLY be found by running the app.

## Arguments

`$ARGUMENTS` must be one of:
- `planning` — For architecture/design tasks
- `implementation` — For code changes
- `review` — For audit/review findings
- `documentation` — For docs/rules changes
- `bug` — For bug investigation tasks
- `refactoring` — For refactoring tasks

## Runtime Verification (MANDATORY for implementation, bug, refactoring)

Before running the checklist, verify the app is running:
```bash
netstat -ano | findstr :5173
```

If not running, STOP and report: `FAIL — App not running. Start dev server first.
Runtime verification is mandatory. Cannot complete confidence check without it.`

If running, open the app and verify:
```bash
agent-browser open http://localhost:5173
agent-browser snapshot
```

### Runtime Tracing (the bugs that code reading ALWAYS misses)

For EVERY change in this task, trace these paths through the running app:

**Timer/listener lifecycle:**
- For every setTimeout/setInterval/addEventListener the code creates: trigger it,
  then trigger the cleanup path. Does the timer/listener actually stop?
- Evidence: snapshot or screenshot BEFORE and AFTER the cleanup path runs.

**State wiring:**
- For every piece of React state the code defines: trigger the action that
  writes to it. Does the UI actually update?
- Evidence: snapshot showing the state change reflected in the UI.

**Error propagation:**
- For every try/catch or `{ ok: false }` path: trigger it (bad input, missing file,
  network error). What does the user see? Is it the correct message?
- Evidence: screenshot of the error state in the UI.

**Progress/loading states:**
- For every async operation with progress indication: trigger it. Does the loading
  state appear? Does it disappear when done? What happens on error?
- Evidence: screenshot during and after the operation.

## Checklists

### planning
1. [ ] INTENT: Quote the user's Intent Statement from the plan. Does this work serve it?
2. [ ] Current state experienced via agent-browser (navigated app, clicked flows)
3. [ ] All affected files identified (grep/glob evidence)
4. [ ] API contract defined if cross-layer
5. [ ] Breaking changes identified
6. [ ] Effort estimate provided per task
7. [ ] Dependencies mapped (which tasks block others)
8. [ ] ADVERSARIAL: What's missing from this plan?
9. [ ] INTEGRATION: Do all counts/claims match the CURRENT codebase?

### implementation
1. [ ] INTENT: Quote the user's Intent Statement from the plan. Does this work serve it?
2. [ ] Code matches the plan/contract exactly
3. [ ] All instances addressed (grep confirms zero remaining old pattern)
4. [ ] No leftover debug code (grep for console.log, debugger, TODO)
5. [ ] Error handling present for all async operations
6. [ ] No new inline styles (all use CSS classes/variables)
7. [ ] App builds without errors
8. [ ] **RUNTIME: App runs — agent-browser snapshot confirms no crash**
9. [ ] **RUNTIME: Changed feature works — agent-browser interaction + screenshot evidence**
10. [ ] **RUNTIME: Timer/listener lifecycle traced — every create has a verified cleanup**
11. [ ] **RUNTIME: State wiring verified — every state field has a verified writer + UI update**
12. [ ] **RUNTIME: Error paths tested — triggered error, verified correct message**
13. [ ] ADVERSARIAL: What OTHER code does the same thing? Checked for same bug class elsewhere
14. [ ] INTEGRATION: Traced every caller of modified functions — they still work

### review
1. [ ] INTENT: Quote the user's Intent Statement from the plan. Does this work serve it?
2. [ ] Every finding has a file:line reference
3. [ ] Every instance enumerated (count + list, not "some" or "several")
4. [ ] Fix code provided for every Critical/High
5. [ ] Cross-domain messages sent for every finding that crosses domains
6. [ ] Positive findings documented
7. [ ] Visual findings backed by agent-browser evidence
8. [ ] **RUNTIME: Key findings verified by reproducing in agent-browser**
9. [ ] ADVERSARIAL: Traced data flows end-to-end across API boundaries

### documentation
1. [ ] INTENT: Quote the user's Intent Statement from the plan. Does this work serve it?
2. [ ] Every referenced file actually exists (glob verified)
3. [ ] Every count matches reality (grep/wc verified against LIVE files)
4. [ ] No contradictions with actual code behavior
5. [ ] All code examples are syntactically valid
6. [ ] Stale information identified and flagged
7. [ ] INTEGRATION: If code was recently modified, re-verify counts against current state

### bug
1. [ ] INTENT: Quote the user's Intent Statement from the plan. Does this work serve it?
2. [ ] Root cause confirmed by 2+ agents OR traced end-to-end
3. [ ] Competing hypotheses explicitly eliminated with evidence
4. [ ] **RUNTIME: Bug reproduced in agent-browser before fix**
5. [ ] **RUNTIME: Fix verified in agent-browser — bug no longer occurs**
6. [ ] **RUNTIME: Related flows tested — no regression**
7. [ ] Second agent verified no regression
8. [ ] Related code paths checked for same class of bug

### refactoring
1. [ ] INTENT: Quote the user's Intent Statement from the plan. Does this work serve it?
2. [ ] Inventory complete — grep confirms zero remaining old pattern
3. [ ] All migrations consistent — no mixed old/new in same file
4. [ ] App builds without errors
5. [ ] **RUNTIME: App runs — agent-browser snapshot confirms no crash**
6. [ ] **RUNTIME: Every refactored feature still works — agent-browser interaction evidence**
7. [ ] **RUNTIME: No visual regressions — before/after screenshots compared**
8. [ ] No new patterns introduced that weren't in the plan

## Procedure

1. Read the checklist for the specified type
2. If type is implementation/bug/refactoring: verify app is running, open agent-browser
3. For each item, gather evidence using Read/Grep/Glob AND agent-browser where marked
4. Mark each item PASS (with evidence) or FAIL (with what's missing)
5. **RUNTIME items that lack agent-browser evidence = automatic FAIL**
6. Calculate completion percentage
7. If any item is FAIL, the task is NOT complete

## Report Format

```
Confidence Check: [type]
Task: [task description]
App running: YES/NO
Agent-browser used: YES/NO

STRUCTURAL CHECKS:
1. [PASS] Item description — Evidence: [grep output / file reference]
2. [FAIL] Item description — Missing: [what needs to be done]

RUNTIME CHECKS:
7. [PASS] App runs — Evidence: [snapshot excerpt]
8. [PASS] Feature works — Evidence: [screenshot path]
9. [FAIL] Timer cleanup — Missing: [timer at line X has no clearTimeout]

Score: N/M (X%)
Runtime score: N/M (X%)
Status: COMPLETE | INCOMPLETE — [list of failing items]
```
