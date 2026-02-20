---
name: cto-adversarial
description: >
  Adversarial verification pass for CTO review. Reads Pass 1 findings with fresh
  context, challenges each finding, discovers what was missed, and produces the
  final merged report with production verdict.
argument-hint: '[pass1-findings-path]'
allowed-tools: Read, Grep, Glob, Bash, Write
context: fork
---

# Adversarial Verification Pass

You receive findings from a prior review pass. Your job is adversarial verification with a CLEAN perspective. You did NOT perform the first review. You have no context about WHY findings were raised — only WHAT was found and WHERE. You must form your own conclusions by reading the code yourself.

The PRIMARY standard remains: **does this implementation EXCEED user intent?**

If repository policy (CLAUDE.md or .claude/rules/) conflicts with this skill, follow repository policy.

## Step 1: Resolve Input

If `$ARGUMENTS` is provided, use it as the path to pass1-findings.md.

Otherwise look for `temp-reviews/pass1-findings.md`.

If neither is found, report the error and stop.

### Read Pass 1 Findings

Read the pass1-findings.md file. Catalog:

- All findings with their severities
- The "Exceeds Expectations" answers
- The cross-boundary data flow trace
- The complete list of files that were read
- Section scores and overall score

### Read Reference Material

Also read these files for context:

- `CLAUDE.md` — architecture patterns, API conventions, key patterns
- `.claude/skills/cto-review/references/evaluation-framework.md` — project-specific evaluation criteria

## Step 2: Adversarial Verification

### 2a: Challenge Every HIGH and CRITICAL Finding

For EACH finding rated HIGH or CRITICAL in Pass 1:

1. **Read the referenced file yourself** — open the file at the cited line. Do NOT trust the prior reviewer's description.
2. **Trace the execution path** — follow the code from trigger to completion. Look for try/catch, validation guards, fallback values, Express 5 auto-catch, middleware error handlers.
3. **Check surrounding context** — read at least 50 lines above and below.
4. **Cross-reference callers** — grep for every caller of the modified function.
5. **Attempt to disprove** — actively construct an argument that this finding is a false positive.

Record your verdict: **Confirmed**, **Downgraded** (with evidence), or **Upgraded** (with evidence).

### 2b: Fresh-Eyes Scan of All Referenced Files

For EACH file referenced in Pass 1 findings:

- Look for issues the prior reviewer MISSED entirely
- Specifically check for:
  - Missing input validation on Express routes
  - NoSQL injection vectors (unsanitized user input in MongoDB queries)
  - Path traversal in file operations
  - Playwright operations without timeout
  - Missing error responses (non-{ ok } shape)
  - Silent catch blocks with no logging
  - Missing AbortController timeout on external calls
  - SSRF vectors (user-controlled URLs passed to fetch/Playwright)
  - Missing cleanup (Playwright pages not closed, temp files not deleted)

### 2c: Trace Verification

Re-trace the cross-boundary data flow from Pass 1. At each boundary, independently verify producer/consumer agreement on data shape.

## Step 3: Independent "Exceeds Expectations" Assessment

Answer these 5 questions yourself by reading the code cold:

1. Would a senior engineer be IMPRESSED by this code?
2. Are error messages actionable?
3. Is defensive programming comprehensive?
4. Does the architecture make future changes EASIER?
5. If you showed this to the user RIGHT NOW, would they say "this exceeds what I asked for"?

After forming ALL your own answers, compare with Pass 1. The MORE CRITICAL assessment wins.

## Step 4: Merge and Determine Verdict

Combine verification results. Overall score = MINIMUM of all section scores.

**Intent gate:** If "Exceeds Expectations" concludes implementation does NOT exceed user intent — score CANNOT exceed 7.

## Step 5: Write Final Report

Write to: `temp-reviews/temp-{date}-{model}-{feature-slug}-cto-review.md`

After writing, output summary to conversation:

```
**CTO Review: {Feature Name} — {Score}/10**
- Critical: {n} | High: {n} | Medium: {n} | Low: {n}
- Intent Gate: {PASS or CAPPED AT 7}
- Report: `temp-reviews/{filename}`
- Top finding: {one-line summary of the single most important finding}
```
