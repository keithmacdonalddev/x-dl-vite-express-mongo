# Confidence Checklists

A task is NOT complete until the agent runs the verification checklist for its task type and reports completion to the lead. The lead spot-checks at least one item before accepting. Agents must never self-mark complete without evidence.

## Three Confidence Modes (ALL THREE Required)

**Mode 1: Verification** — "Check these items." Confirmatory baseline.

**Mode 2: Adversarial** — "What's wrong that ISN'T on this checklist?" Find problems nobody thought to ask about.

**Mode 3: Integration** — "What breaks when these changes combine?" Check cross-agent side effects after every implementation.

A score from Mode 1 alone is meaningless. Every confidence check MUST include all three modes.

---

## Base Checklist (All Task Types)

- [ ] Client builds without errors (`npm run build` in client/)
- [ ] Server starts without crashes (`node server/src/core/runtime/entrypoints/index.js`)
- [ ] MongoDB connection succeeds on startup
- [ ] ADVERSARIAL: What's missing that a hostile reviewer would find?
- [ ] INTEGRATION: Do all counts/claims match the CURRENT codebase (not a stale snapshot)?

---

## Planning Confidence Checklist

- [ ] Used agent-browser to experience the current app before designing changes
- [ ] Read all source files in scope (not just the ones expected)
- [ ] Plan accounts for actual UX flow, not just code architecture
- [ ] All task dependencies identified and set via blockedBy
- [ ] Regression risk named for each change
- [ ] Integration boundaries listed (every API/prop/CSS crossing)
- [ ] Task count is 5-6 per agent
- [ ] User approved the approach

---

## Implementation Confidence Checklist

- [ ] Code matches the plan/spec — every item addressed
- [ ] Visual verification — agent-browser screenshot/snapshot confirms change renders correctly
- [ ] Visual review meets standards in visual-review-standards.md (minimum 5 findings per screenshot review)
- [ ] Functional verification — agent-browser confirms runtime behavior (polling cleanup, state wiring, error propagation)
- [ ] All instances addressed — grep confirms zero remaining matches
- [ ] Integration boundaries notified — teammate messaged AND acknowledged
- [ ] No leftover debug code (grep for console.log, TODO, FIXME added during task)
- [ ] No regressions in adjacent functionality (visual + functional)
- [ ] ADVERSARIAL: What OTHER code does the same thing?
- [ ] ADVERSARIAL: What would break if this code receives unexpected input?
- [ ] INTEGRATION: Trace every caller of modified functions — do they still work with the new behavior?
- [ ] INTEGRATION: If behavior was restricted, do all producers of that input comply?

### MongoDB-Specific
- [ ] Queries use appropriate indexes (check with .explain() for new patterns)
- [ ] State transitions use atomic findOneAndUpdate (no read-then-write)
- [ ] lean() used for read-only queries
- [ ] No unbounded queries (always limit or paginate)

### Playwright-Specific
- [ ] Browser resources cleaned up on error paths
- [ ] Timeout guards on all page operations
- [ ] No orphaned browser pages after job completion/failure

---

## Review Confidence Checklist

- [ ] Every finding has file:line reference
- [ ] Critical/High findings verified by second agent (VERIFIED / FALSE POSITIVE)
- [ ] Every instance enumerated (count + list, not "some" or "many")
- [ ] Fix code provided for Critical/High
- [ ] UI/UX findings backed by agent-browser evidence (snapshot, screenshot, or interaction log)
- [ ] UI/UX findings meet visual-review-standards.md (specific values, design principles cited, minimum thresholds met)
- [ ] Cross-domain findings messaged to affected agent AND response received
- [ ] No contradictions between agents' findings (lead reconciled)
- [ ] Positive findings documented
- [ ] ADVERSARIAL: Trace data flows end-to-end across API boundaries — do producers and consumers agree?
- [ ] ADVERSARIAL: For every security fix, check if the same vulnerability exists via another code path

---

## Documentation Confidence Checklist

- [ ] Every referenced file path exists (glob verified)
- [ ] Every referenced function/method exists (grep verified)
- [ ] All counts match actual code — verified against LIVE files, not cached values
- [ ] No rules contradict the codebase
- [ ] No hardcoded facts that will drift — only rules and patterns

---

## Bug Investigation Confidence Checklist

- [ ] Root cause confirmed by at least 2 agents or traced end-to-end by lead
- [ ] Competing hypotheses explicitly eliminated with evidence
- [ ] Second agent verified no regression
- [ ] Agent-browser evidence shows bug is resolved

---

## Refactoring Confidence Checklist

- [ ] Target state defined before work started
- [ ] Inventory complete — zero instances missed (grep verified)
- [ ] All migrations consistent (no mixed old/new patterns)
- [ ] /review-ui shows no visual regressions
- [ ] agent-browser screenshots before/after show no layout or style changes
- [ ] Functional verification — all polling intervals/subscriptions still cleanup correctly

---

## Monitor Confidence Checklist

- [ ] Found at least 1 issue (adversarial duty met)
- [ ] Checked all modified files (not just the primary one)
- [ ] Traced data shapes across at least 1 API boundary
- [ ] Checked for missing cleanup/reset on state transitions
- [ ] Verified imports and exports are correct (CommonJS in server, ESM in client)
- [ ] Checked for pattern violations against existing code
- [ ] Checked implementation against plan's Intent Statement for drift
- [ ] Reported with file:line evidence for every finding
- [ ] Any screenshots reviewed meet visual-review-standards.md standards (no rubber-stamp approvals)
