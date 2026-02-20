# Strict Folder Ownership Plan — Critical Review Report

> **Reviewed by:** 3-agent Sonnet review team (architect, risk-analyst, code-critic)
> **Plan:** `docs/plans/2026-02-19-strict-folder-ownership-implementation-plan.md`
> **Date:** 2026-02-19
> **Verdict:** CONDITIONAL NO-GO — 4 blockers must be resolved before implementation

---

## Executive Summary

Three independent reviewers (architecture, risk, implementation) conducted a codebase-grounded adversarial review of the 9-task strict folder ownership plan. All three converge on the same verdict: **CONDITIONAL NO-GO as written.** The plan has a sound incremental migration strategy and a good rollback flag — but it has 3 critical blockers, 4 high-severity gaps, and multiple missing prerequisite tasks that would cause immediate failures if implementation began today.

---

## Consensus Findings (All 3 Reviewers Agree)

### 1. Job Model Has No Home — CRITICAL
The `Job` model (`server/src/models/job.js`) is imported by **6+ files** spanning routes, worker, queue, and recovery. The plan's boundary rule (`domains/A -> domains/B` forbidden) makes it impossible to place Job in any domain without violating the rules. It must go in `core/` — but the plan never says this and never tasks the migration. **Without resolving this, the boundary checker fails on Day 1.**

Evidence:
- `routes/jobs.js:3` — `require('../models/job')`
- `routes/contacts.js:3` — `require('../models/job')`
- `routes/retry.js:3` — `require('../models/job')`
- `routes/status.js:3` — `require('../models/job')`
- `worker/queue.js:2` — `require('../models/job')`
- `worker/recovery.js:2` — `require('../models/job')`

### 2. Platform Registry Has No Migration Path — CRITICAL
`platforms/registry.js` has **9 dependents** across every layer (app.js, routes, worker, services, utils, config). The plan splits platforms into `domains/platform-x/` and `domains/platform-tiktok/` but never addresses the registry aggregator. It must stay in `core/` with domains self-registering — but this is never stated or tasked.

Evidence (9 importers):
- `app.js:134` (dynamic require inside PATCH handler)
- `config/platform-capabilities.js:1`
- `worker/process-job.js:14`
- `services/downloader-service.js:7`
- `services/playwright-adapter.js:6`
- `utils/account-profile.js:2`
- `utils/validation.js:1`
- `routes/jobs.js:9`
- `routes/helpers/route-utils.js:7`

### 3. Platform Strategy Extraction Is Underspecified — CRITICAL
`process-job.js` has `job.save()` calls interleaved with platform retry logic. The plan says "extract platform strategies" but provides **no interface contract**. Without a defined return signature for `worker-strategy.js`, extraction either re-creates the coupling (passing full job doc) or is unimplementable. Additionally, **only the 403-refresh (lines 285-339) is actually X-specific** — Strategies 1-3 are shared fallbacks the plan incorrectly attributes to TikTok.

Evidence:
- Lines 285-339: 403-refresh — platform-gated via `platformNeeds403Refresh()`. X-specific. Correct to extract.
- Lines 383-427: Playwright session auth — NOT platform-gated. Applied universally.
- Lines 431-480: Browser navigation download — NOT platform-gated. Applied universally.
- Lines 482-577: Re-extraction + fresh URL — NOT platform-gated. Applied universally.

### 4. Multiple Missing Prerequisite Migrations
Files the plan never mentions but must move to `core/`:
- `constants/job-status.js` (7+ dependents)
- `domain/job-transitions.js` (singular `domain/` folder — completely ignored by plan)
- `utils/validation.js`, `utils/account-profile.js`
- `routes/helpers/route-utils.js`
- `middleware/request-limits.js`

### 5. Two Live API Endpoints Orphaned
`routes/retry.js` and `routes/status.js` serve live endpoints but have **no domain assignment** in the plan. Task 9's deletion list omits them. They'd be structurally orphaned at cutover.

---

## Contested Findings (Reviewers Disagree)

### 7-Team Ownership: Over-Engineered or Forward-Looking?
- **Risk-analyst & Architect:** The `manifest/register/start/stop` lifecycle is Spring/NestJS-grade ceremony for a single-developer project. Current startup is 6 lines. CODEOWNERS is non-functional with no team members.
- **Counter-argument:** The structure enables agent teams (Claude Code teammates) to work with clear ownership boundaries. It's not for human teams — it's for AI-assisted development.
- **Recommended resolution:** Replace `manifest/register/start/stop` domain kernel with simpler `{ mountRoutes(app), startWorker(ctx), stopWorker() }` array pattern. Same ownership benefits, 80% less indirection.

### Rollback Adequacy
- **Risk-analyst:** 3-line rollback is 20% of what's needed. Tasks 5-6 require git revert, Task 4 schema has no reverse migration.
- **Architect:** For a single-developer project, git history IS the rollback. The flag covers runtime; git revert covers code.
- **Recommended resolution:** Add per-task rollback notes, but accept git revert as the mechanism.

---

## Critical Blockers (Must Fix Before Implementation)

| # | Finding | Agreed By | Required Fix |
|---|---------|-----------|--------------|
| B1 | No `core/` contents inventory — Job model, constants, registry, utils, middleware all need explicit placement | All 3 | Add a new Task 1.5: define and execute `core/` contents inventory |
| B2 | No worker strategy interface contract | Architect + Code-critic | Define function signature for `worker-strategy.js` before Task 5 (return delta, not mutate job) |
| B3 | Platform retry misidentification | Risk-analyst + Code-critic | Produce a platform-behavior matrix; only 403-refresh is X-specific |
| B4 | domainId gaps in schema, creation route, and backfill | Risk-analyst | Define schema default + update creation route + add queue-drain before backfill |

---

## High Priority (Should Fix)

| # | Finding | Source | Detail |
|---|---------|--------|--------|
| H1 | ENABLE_DOMAIN_KERNEL all-or-nothing | Risk + Architect | One bad domain kills entire startup; no per-domain isolation; split-brain risk if API/worker toggled separately |
| H2 | Thin adapter lifetime undefined | Risk-analyst | No behavioral equivalence test; no Definition of Done for "temporarily" |
| H3 | Boundary enforcer needs complete rewrite | Risk + Code-critic | FORBIDDEN_EDGES are irrelevant post-migration; TDD fixtures test synthetic paths, not real imports |
| H4 | 7-team register/start/stop overhead | Risk + Architect | Non-functional CODEOWNERS; Spring-grade lifecycle for single-dev project |

---

## Medium Priority (Nice to Fix)

| # | Finding | Source | Detail |
|---|---------|--------|--------|
| M1 | 3-line rollback inadequate | Risk-analyst | Tasks 5+6 require git revert; no reverse backfill for domainId |
| M2 | Task 8 violates plan's own isolation | Risk-analyst | Bundles server telemetry + client UI in one commit across 2 ownership domains |
| M3 | `runtime-lifecycle.test.js` never created | Code-critic | Referenced in Tasks 3 and 9 verification gates but no task writes it |
| M4 | Client test runner disabled | Code-critic | Task 8 TDD "confirm fail" step always passes (test script is `echo "Tests disabled"`) |
| M5 | `register-shutdown.js` needs full rewrite | Code-critic + Architect | Listener stacking from multiple domain startups triggers MaxListenersExceededWarning |

---

## Infeasible Items (Will Not Work As Written)

| # | Finding | File Evidence |
|---|---------|---------------|
| IF-1 | Task 1 tests call unexported `getDomain()` | `scripts/check-module-boundaries.mjs:52-58` — only `evaluateImports` exported at line 118 |
| IF-2 | `runtime-lifecycle.test.js` never created | Tasks 3 and 9 reference it; no task writes it |
| IF-3 | `process-job.js` retains boundary-violating `platforms/registry` import | `worker/process-job.js:14` — no task removes this import |
| IF-4 | Platform strategy extraction has no interface contract | `process-job.js:285-339, 483-577` — `job.save()` interleaved with platform logic |
| IF-5 | Client-side TDD gate is non-functional | `client/package.json` test script is `echo "Tests disabled"` |

---

## Missing Files (Plan Omits But Must Migrate)

| # | File | Dependents | Issue |
|---|------|-----------|-------|
| MF-1 | `server/src/models/job.js` | 6 files | No `core/` migration task; blocks entire boundary enforcement |
| MF-2 | `server/src/constants/job-status.js` | 7+ files | Must follow Job model to `core/` |
| MF-3 | `server/src/routes/retry.js` + `status.js` | Live API endpoints | No domain assignment; orphaned at cutover |
| MF-4 | `server/src/domain/job-transitions.js` | `routes/status.js:4` | Singular `domain/` folder entirely ignored by plan |
| MF-5 | `server/src/platforms/registry.js` | 9 files | No `core/` migration despite being the most depended-on file |
| MF-6 | `server/src/middleware/request-limits.js` | `app.js:14-19` | Cross-cutting infrastructure with no domain owner |
| MF-7 | `server/test/runtime/runtime-lifecycle.test.js` | Tasks 3 + 9 | Referenced but never created |

---

## Risk Register Summary

| ID | Severity | Summary |
|----|----------|---------|
| RISK-01 | Critical | domainId backfill excludes running jobs; recovery re-queues them without domainId; fallback untested |
| RISK-02 | Critical | Thin adapter has no exit criteria, no timeline, no behavioral equivalence check |
| ARCH-01 | Critical | Job model ownership unresolved — shared by two domains, placement contradicts plan's own principles |
| RISK-03 | High | ENABLE_DOMAIN_KERNEL all-or-nothing: wider blast radius than current system, split-brain risk |
| RISK-04 | High | Boundary enforcer needs complete replacement; Task 1 TDD fixtures decoupled from real imports |
| RISK-05 | High | process-job.js decomposition misidentifies platform-specific retry strategies |
| RISK-06 | High | 7-team ownership model non-functional for single-developer repository |
| RISK-07 | Medium | 3-line rollback inadequate for 9-task plan with schema changes |
| RISK-08 | Medium | No domainId schema default; job creation route not updated; gap window |
| RISK-09 | Medium | Task 8 bundles server + client in one commit, violating plan's own isolation principle |

---

## Strengths (What the Plan Does Well)

1. **Boundary enforcement before behavior change** — Tasks 0-1-2 sequence is correct
2. **ENABLE_DOMAIN_KERNEL feature flag** — clean kill switch for rollback
3. **Backfill dry-run flag** — good operational practice
4. **Incremental skeleton-then-fill approach** — stubs first, behavior later
5. **Self-registration pattern concept** — architecturally correct direction for avoiding circular imports

---

## Missing Items Checklist

1. `core/` contents inventory (what goes in core vs domains)
2. Platform behavior matrix (which retry strategies are platform-specific vs shared)
3. `domain/` (singular) folder migration for `job-transitions.js`
4. domainId assignment on job retry path
5. Per-task rollback procedures
6. Behavioral equivalence tests for adapter -> domain route migration
7. Mixed-state integration tests (some jobs with domainId, some without)
8. Domain context (`ctx`) shape definition
9. Boundary enforcer staging rules for the transition period

---

## GO / NO-GO Recommendation

### CONDITIONAL NO-GO

The plan cannot be implemented as written — it would hit immediate failures at Task 1 (boundary checker flags all existing code) and Task 5 (no interface contract). However, the **overall strategy is sound.**

**4 required remediations to convert to GO:**

1. **Add a `core/` contents inventory task** (resolves B1 — Job model, constants, registry, utils, middleware placement)
2. **Define platform worker strategy interface contract** (resolves B2 — return delta pattern, not job mutation)
3. **Produce a platform-behavior matrix** for process-job.js decomposition (resolves B3 — only 403-refresh is X-specific)
4. **Define domainId schema default + update job creation route** in Task 4 (resolves B4 — close the gap window)

**These 4 remediations convert this to a GO.** The remaining High/Medium findings are fixable during implementation.

---

*Review conducted by 3 independent Sonnet agents with full codebase access. All findings backed by file:line references from actual source reads. Cross-reviewed with mandatory inter-agent debate before finalization.*
