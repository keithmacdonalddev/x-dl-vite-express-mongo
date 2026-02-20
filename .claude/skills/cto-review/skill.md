---
name: cto-review
description: >
  CTO production gate review of implemented features. Strict risk-focused audit
  with 1-10 scoring, emphasis on exceeding user intent. Use when: reviewing
  implemented code before shipping, production approval gate, post-implementation
  audit, code safety review, feature ship readiness check, verifying implementation
  exceeds expectations.
argument-hint: '[plan-path-or-feature-name]'
allowed-tools: Read, Grep, Glob, Bash, Write
context: fork
---

# CTO Production Gate Review

Strict, risk-focused audit of implemented features. No praise. No filler. No broad redesign suggestions. Evaluate only what was implemented.

The PRIMARY standard is: **does this implementation EXCEED user intent and expectations?** Technical correctness is necessary but insufficient. Code that "works" but doesn't exceed what the user envisioned is a finding.
If repository policy (CLAUDE.md or .claude/rules/) conflicts with this skill, follow repository policy.

## Step 1: Resolve Input

**Multiple targets = multiple agents.** If `$ARGUMENTS` contains more than one file path or feature name (space-separated), launch a SEPARATE parallel background review agent for EACH target. Each agent runs this full skill independently, writes its own report, and returns its own verdict. Never combine multiple targets into a single review — each target gets dedicated attention and its own report file.

If `$ARGUMENTS` is a single file path ending in `.md`:

- Use it as the plan document

If `$ARGUMENTS` is a single feature name:

- Search `.claude/plans/` for matching plan files
- If multiple matches, read each and select the most relevant

If no argument provided:

- Run `git status` and `git diff --name-only` to identify recently modified files
- Ask the user which feature to review

Fallbacks:
- If the file path doesn't exist: report "Plan file not found: {path}" and fall back to git-based discovery
- If `.claude/plans/` doesn't exist or is empty: fall back to git-based discovery
- If no plan can be identified through any method: list recently modified files and ask the user to specify scope

## Step 2: Scope Assembly — Pre-Pass (Haiku)

The coordinator launches a Haiku subagent to do the mechanical scope work. This preserves Pass 1 Sonnet's context for judgment instead of burning it on git output and grep results.

### Pre-pass prompt template

Include in the Haiku prompt:
- The plan document path or content from Step 1
- "Assemble a scope package for a code review. Write results to temp-reviews/scope-package.md."

### Pre-pass deliverables

Haiku writes `temp-reviews/scope-package.md` with these sections:

```
## Git State
- Branch, commit, uncommitted/unstaged changes
- Review covers: committed + staged changes
- Warnings for any unstaged files excluded from scope

## Plan vs Reality
- Implemented items (with file references) vs deferred items
- Deferred items are EXCLUDED from review
- UNPLANNED changes: files in git diff NOT in the plan

## Modified Files
| File | Lines Changed | Layer | Role |
|------|--------------|-------|------|
[Categorize each file: server (server/routes, server/services, server/models),
client state (client/src/hooks, client/src/context), component (client/src/components),
styles (css), config, other]

## Dependency Map
[For each modified file: who imports it, what it imports.
Produce a caller/consumer list per file.]

## Antipattern Flags
[Scan modified files for known violations from coding patterns:
- Missing input validation on Express routes
- MongoDB queries without proper sanitization
- Playwright operations without timeout
- Missing error responses (non-{ ok } shape)
- Silent catch blocks (catch with no logger call)
- fetch/API calls without AbortController timeout
Flag file:line for each. These are CANDIDATES — Pass 1 verifies.]

## Size Profile
[Line count per file, function count, complexity hints
(deep nesting, long switch statements, large objects)]
```

### Git unavailable or unreliable

If `git diff` fails or returns empty when files are clearly modified, fall back to plan-based discovery: use the plan's file list as the scope and note in the scope package that git-based discovery was unavailable. The dependency map and antipattern scans still work — they read files directly, not through git.

### Trust boundary

The scope package is a starting map, not a source of truth. Pass 1 MUST still read every modified file itself. If Pass 1's read contradicts the scope package, trust the read. Haiku's antipattern flags are candidates for investigation, not confirmed findings.

CRITICAL: The most dangerous bugs hide in UNPLANNED changes. After the pre-pass identifies unplanned files, Pass 1 MUST read them with the SAME depth as planned files. Do NOT mark them as "abbreviated" or "out of scope." If a file appears in git diff, it gets a full read. No exceptions.

## Two-Pass Execution Architecture

This review uses two sequential subagents with isolated contexts. A single agent doing multiple review passes degrades — context fills with prior findings and the agent anchors on its own conclusions. Two fresh instances with focused scopes outperform one loaded instance trying to self-critique.

**Coordinator (this agent):** Execute Step 1 yourself (resolve input). Then launch the Haiku pre-pass for scope assembly. Read its output. Launch Pass 1 subagent with the scope package. Read its output. Launch Pass 2 subagent with Pass 1's findings only. Read its output. Merge results and write the final report (Steps 6-7).

**Pre-pass subagent (Haiku):** Launched after Step 1. Fast, mechanical scope assembly. Writes `temp-reviews/scope-package.md`. See Step 2 for full instructions.

**Pass 1 subagent (Sonnet):** Receives `temp-reviews/scope-package.md` from the pre-pass. Executes Steps 3-5: reads all files, evaluates all 8 sections, traces data flows, answers exceeds-expectations questions. Writes `temp-reviews/pass1-findings.md`.

**Pass 2 subagent (fresh Sonnet):** Receives `temp-reviews/pass1-findings.md` and full read access to the repository. It does NOT receive Pass 1's reasoning, context, or draft report — only the findings (what and where) and the codebase itself. Two jobs:
1. Adversarial verification — for each HIGH/CRITICAL, attempt to disprove it via the verification gate (Step 4b). For each flagged file, look for findings Pass 1 missed.
2. Fresh "exceeds expectations" evaluation — read the flagged code cold and challenge Pass 1's answers to the 5 questions.
Writes `temp-reviews/pass2-verification.md` with upgrades, downgrades, and net-new findings.

Pass 2 gets the map (what was found and where), not the territory (Pass 1's full reasoning). This information asymmetry forces independent verification.

**Fallback:** If subagent spawning is unavailable in the current environment, execute both passes sequentially in the main agent. After completing Pass 1 findings, explicitly reset your assessment posture: re-read each HIGH/CRITICAL finding as if seeing it for the first time and attempt to disprove it. This is less rigorous than true isolation but preserves the adversarial verification step.

### Coordinator Prompt Templates

When launching the Haiku pre-pass, include the FULL deliverable spec inline — Haiku cannot read this skill file. Copy the following into the prompt verbatim:

```
You are assembling a scope package for a code review. Write results to temp-reviews/scope-package.md.

Use `git diff {base}..{commit}` to identify modified files. For each modified file, read it completely.

Your output MUST include ALL of these sections:

## Git State
- Branch, commit hash, any uncommitted/unstaged changes
- What the review covers (committed, staged, or working tree)
- Warnings for any files excluded from scope

## Plan vs Reality
- Read the plan document at {plan_path}
- List implemented items (with file references) vs deferred items
- UNPLANNED changes: files in git diff NOT listed in the plan

## Modified Files
| File | Lines Changed | Layer | Role |
For each file, categorize: server route (server/routes), server service (server/services), model (server/models), middleware (server/middleware), client hook (client/src/hooks), client component (client/src/components), styles (css), config, other

## Dependency Map
For EACH modified file, run two greps:
1. grep for the filename across the codebase (who imports it)
2. Read the file's import/require statements (what it imports)
Produce a caller/consumer list per file.

## Antipattern Flags
Scan each modified file for these patterns. Flag file:line for each match:
- Express route handlers missing input validation
- MongoDB queries with unsanitized user input (NoSQL injection vectors)
- Playwright operations without timeout configuration
- API responses not following { ok: true/false } shape
- catch blocks that don't log the error (silent error swallowing)
- fetch/API calls without AbortController timeout
- Missing path-traversal checks on file operations
These are CANDIDATES for the review agent to verify, not confirmed findings.

## Size Profile
For each modified file: total line count, number of exported functions, and flag any function longer than 50 lines or nesting deeper than 4 levels.
```

Also include the plan document path and the git diff range.

When launching Pass 1, include in the prompt:
- "Read temp-reviews/scope-package.md for the pre-assembled scope: file list, dependency map, antipattern candidates, and architecture classification."
- "This scope package is a starting map, not a source of truth. You MUST still read every modified file yourself. If your read contradicts the scope package, trust your read."
- Instructions: "Follow Steps 3-5 of the CTO review process. Read references/evaluation-framework.md for project-specific criteria. Write your complete findings to temp-reviews/pass1-findings.md."

When launching Pass 2, include in the prompt:
- "Read temp-reviews/pass1-findings.md. This contains findings from a prior review pass. Your job is adversarial verification with a clean perspective."
- "For each HIGH/CRITICAL finding: read the referenced file, trace the execution path, and attempt to disprove it. If you cannot disprove it, confirm it. If you find it's already handled by surrounding code, downgrade it."
- "For each file referenced in findings: look for issues the prior pass missed."
- "Re-evaluate the 'exceeds expectations' answers independently — read the code yourself and form your own opinion."
- "Write results to temp-reviews/pass2-verification.md with: confirmed findings, downgraded findings (with evidence), upgraded findings, and net-new findings."

## Step 3: Read All Modified Files

Read every file identified in Step 2 — completely. No skimming, no sampling.

If modified files exceed 20, split into two passes:
- Pass 1: Files with the most line changes (top 15) — full depth.
- Pass 2: Remaining files — read completely but skip caller/consumer tracing.
Note any pass-2 files in the report under "Abbreviated Review."

Also read for context (but do not evaluate unless modified):

- `CLAUDE.md` for architecture patterns

Before proceeding to Step 4, verify your file read count:
- Count of files in git diff: ___
- Count of files you read completely: ___
These numbers MUST match. If they don't, go back and read the missing files.

MINIMUM DEPTH REQUIREMENT: For full-depth files (all files when under 20, or top 15 by change volume when over 20), make at least 3 tool calls per file (read the file, grep for callers, grep for consumers). For abbreviated-review files (remaining files in the 20+ case), a complete read is sufficient. Tool call validation applies to full-depth files only. After completing all file reads, enumerate:
- Full-depth files read: [list]
- Abbreviated files read: [list]
- Grep searches performed: [list]
- Total tool calls: ___
If total tool calls < (full-depth files * 3), you have not read deeply enough. Go back and trace more paths.

After reading all modified files, trace at least ONE complete data flow across file boundaries:

- Pick the most complex data path touched by this feature
- Trace it from origin to destination (e.g., Express route handler -> service -> Mongoose model -> response -> client fetch -> component render)
- At each boundary crossing, verify: do the producer and consumer agree on the data shape?
- Document this trace in the report under "Cross-Boundary Data Flow Trace"

This trace often reveals the most significant bugs — contract mismatches, missing fields, type coercions, and stale data references.

If unplanned changes exist, trace a SECOND data path that crosses between the planned feature and the unplanned changes.

PASS 1 OUTPUT: After completing Steps 3-5, write `temp-reviews/pass1-findings.md` containing:
- Every finding with severity, file:line, code path, and reproduction scenario
- Your "Exceeds Expectations" answers (all 5 questions + additional intent checks)
- The cross-boundary data flow trace
- List of all files read and grep searches performed
This file is the input for Pass 2. Include enough context for a fresh agent to verify each finding independently.

## Step 4: Evaluate Against 8-Section Framework

PRIORITY ORDER for evaluation effort:
1. State consistency and data flow correctness (broken wiring, missing cases, silent failures)
2. Intent fidelity (does the feature match what the user asked for?)
3. Code quality and defensive programming
4. Performance and responsiveness
5. Observability and debugging
6. Accessibility and responsive design (report only if clearly broken, not for spec compliance gaps)

Spend 80% of evaluation effort on priorities 1-3.

SEVERITY BIAS CHECK: Review agents systematically underrate findings. Before assigning MEDIUM to any finding, explicitly answer: "Can a QA engineer reproduce this in under 60 seconds?" If YES, it is HIGH, not MEDIUM.

Read references/evaluation-framework.md and apply each applicable section to the modified files.

Apply each section to the modified files. Every finding MUST include:

- File path and line number
- The specific code or pattern causing the issue
- Concrete reproduction scenario
- Suggested fix (code-level, not vague advice)

EVIDENCE STANDARD: Every finding must include a VERIFIED execution trace. "I believe this happens" is not a finding. "I traced this path: file:line -> file:line -> file:line, and at step 3 the value is X when it should be Y" IS a finding.

If a section has no findings, write: "No findings." Do not pad sections with observations.

Assume correct unless directly modified:
- Existing routes/services not touched by this feature
- Playwright browser management
- ffmpeg integration
- MongoDB connection/auth setup
- Vite/build configuration
- Existing components not modified

## Step 4b: Finding Verification Gate

Before finalizing any HIGH or CRITICAL finding, VERIFY it is real:

1. **Trace the execution path** — follow the code from trigger to completion. Does existing code already handle this case?
2. **Check surrounding context** — read 50 lines above and below the finding.
3. **Test the scenario mentally** — walk through the exact steps a user would take.
4. **Cross-reference with callers** — grep for every caller of the modified function.

If you cannot trace the complete execution path proving the bug exists, downgrade from HIGH/CRITICAL to MEDIUM with a note: "Potential issue — verify with runtime testing."

## Finding Format Example

**Section:** Failure Modes
**Severity:** High
**File:** `server/services/downloader.js:47`
**Issue:** No timeout on ffmpeg subprocess. If ffmpeg hangs on a corrupt HLS stream, the job blocks indefinitely with no user feedback.
**Reproduction:** Submit a job with a URL that produces a corrupt .m3u8 manifest. The job stays in "running" state forever.
**Fix:** Add `timeout: 60000` option to the ffmpeg spawn call at line 47. On timeout, mark job as failed with error message.

## Step 5: Exceed Expectations Assessment (MOST IMPORTANT)

This section is NOT optional. It is the PRIMARY evaluation criterion.

Answer honestly:

1. Would a senior engineer be IMPRESSED by this code?
2. Are error messages actionable? Would a user know what went wrong AND what to do?
3. Is defensive programming comprehensive? Every edge case, not just happy path?
4. Does the architecture make future changes EASIER, not harder?
5. **If you showed this to the user RIGHT NOW, would they say "this exceeds what I asked for"?**

If the answer to #5 is "no" — that IS a finding, severity HIGH, regardless of technical correctness.

### What "exceeds" means

"Exceeds" DOES mean:
- Error messages that tell users exactly what to do, not just what went wrong
- Edge cases handled that the plan didn't mention but a user would hit
- Code structured so the NEXT feature is easier to add
- Loading states, empty states, and error states all handled gracefully

### Recommendations to Exceed Intent

| Gap | Current | Exceeding | Recommendation | Effort |
| --- | ------- | --------- | -------------- | ------ |

## Step 5b: Pass 2 — Adversarial Verification

After Pass 1 writes `temp-reviews/pass1-findings.md`, the coordinator launches a fresh Sonnet subagent. Pass 2 receives ONLY that file.

Pass 2's deliverable is `temp-reviews/pass2-verification.md`.

## Step 6: Merge and Determine Verdict

The coordinator merges Pass 1 and Pass 2 results.

| Section | Score (1-10) | Findings | Notes |
|---------|-------------|----------|-------|
| Logic & API | | | |
| Data Integrity | | | |
| Security | | | |
| Failure Modes | | | |
| Performance | | | |
| Regression Risk | | | |
| Observability | | | |
| State Lifecycle | | | |

The overall score is the MINIMUM of all section scores, not the average.

Score 1-10:

| Score   | Meaning                                                         |
| ------- | --------------------------------------------------------------- |
| 10      | No findings above Medium. Exceeds user intent and expectations. |
| 8-9     | High findings with clear fixes, no Criticals.                   |
| 6-7     | Criticals exist but contained to this feature.                  |
| 4-5     | Multiple Criticals or architectural issues. Targeted rework.    |
| 2-3     | Fundamental design flaws. Significant rethinking needed.        |
| 1       | Non-functional or dangerous. Full rewrite.                      |

**Intent gate:** If "Exceeds Expectations" concludes the implementation does NOT exceed user intent — score CANNOT exceed 7.

## Step 7: Write Report

Write to: `temp-reviews/temp-{date}-{model}-{feature-slug}-cto-review.md`

Report structure follows the 8-section framework with Cross-Boundary Data Flow Trace, Exceeds Expectations Assessment, Pass 2 Verification Summary, What Breaks First, Production Verdict, and Non-Negotiable Fixes.

After writing the report, output to conversation:

**CTO Review: {Feature Name} — {Score}/10**
- Critical: {n} | High: {n} | Medium: {n} | Low: {n}
- Intent Gate: {PASS or CAPPED AT 7}
- Report: `temp-reviews/{filename}`
- Top finding: {one-line summary of most important finding}
