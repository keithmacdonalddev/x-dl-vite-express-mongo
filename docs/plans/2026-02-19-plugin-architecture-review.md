# Plugin Architecture Plan — Formal Review

**Date:** 2026-02-19
**Review Panel:** Architecture Critic, Implementation Risk Analyst, First-Principles Challenger
**Documents Reviewed:**
- `2026-02-19-plugin-architecture-design.md`
- `2026-02-19-plugin-architecture-implementation-plan.md`

**Codebase Analyzed:** `server/src/` — 35 files, 4,284 lines, single developer
**Verdict:** REVISE PLAN — The plugin kernel is premature; a scoped alternative delivers 80% of the value at 20% of the complexity

---

## Executive Summary

This plan proposes converting the backend from a modular monolith into a kernel + internal plugin architecture across 11 tasks and 5 phases. Three independent reviewers — examining architecture, implementation risk, and first-principles validity — reached the same conclusion: **the plan is well-executed engineering solving the wrong problem at the wrong time.**

The implementation discipline is commendable (TDD, worktree isolation, phased migration, rollback flags). The target architecture is not wrong in principle. But a 4,284-line, 35-file, single-developer codebase does not have the coordination problems that plugin architectures exist to solve. The plan borrows abstractions from multi-team ecosystems (Hapi, Fastify, VSCode, webpack) without evidence that the coordination problem those abstractions address exists here.

Five structural blockers prevent execution as-written. Twelve implementation risks were identified with codebase evidence. Twelve test gaps leave critical migration scenarios unverified. A scoped 5-task alternative (Plan A+) is recommended, with the full plugin kernel deferred to concrete triggers.

---

## 1. Plan Strengths

**S1. Graceful degradation as a first-class requirement.** Locking in `STRICT_PLUGINS=true/false` and a deterministic `503 FEATURE_DISABLED` contract shows the design understands resilience must be designed in, not bolted on.

**S2. Plugin vertical ownership principle.** Owning routes + models + worker + migrations per plugin matches how successful plugin architectures work and prevents split-brain ownership.

**S3. Phased migration with legacy parallel path.** Phase 0 (no behavior change) through Phase 5 is conservatively structured. The design correctly understands that big-bang migrations fail.

**S4. Boundary checker as enforcement infrastructure.** The existing `check-module-boundaries.mjs` is valuable infrastructure. Extending it for plugins builds on what exists rather than inventing new tooling.

**S5. Telemetry envelope extension.** Adding `pluginId`/`area` fields with `core` as default is additive, backward-compatible, and delivers real Activity UI value.

**S6. Deferring external plugins to V2.** Correct risk management. External plugin support without supply-chain policy would be a security exposure.

---

## 2. Structural Blockers

These prevent the plan from being executed as written. Each must be resolved before implementation can proceed.

### B1. Legacy Jobs Fail Immediately on Deploy (CRITICAL)

Task 7 adds `pluginId: { type: String, default: '' }` to the Job model. The dispatch table treats empty `pluginId` as terminal failure ("Worker refuses unknown plugin jobs"). Every pre-existing QUEUED job has no `pluginId` field. Deploying Task 7 with any jobs in the queue converts them all to permanent failures with no recovery path.

**Evidence:** `server/src/worker/queue.js:24-37` claims ANY QUEUED job regardless of pluginId. `server/src/models/job.js:9-120` has no pluginId field. See R-001 for full risk analysis.

**Required fix:** Dispatch layer MUST fall back to legacy `processOneCycle()` when `pluginId` is empty. Additionally, a MongoDB migration script must backfill `pluginId` for existing QUEUED jobs before deploy.

### B2. Static Platform Registry vs. Dynamic Plugin Registration (CRITICAL)

`platforms/registry.js` builds `PLATFORMS`, `hostMap`, and `shortHostMap` at module load time via hardcoded `require('./x')` and `require('./tiktok')`. The plan's `ctx.platforms.register()` runs post-load — after these Maps are already built. If static imports are removed, a race window opens where PLATFORMS is empty and valid URLs are rejected. If static imports are kept, the plugin registration is redundant.

**Evidence:** `server/src/platforms/registry.js:13-32` — static build at load time. `server/src/routes/jobs.js:9` — PLATFORMS imported at module top. See R-006 and Scenario C.

**Required fix:** For V1, keep static imports permanently. Platform plugins are lifecycle shells only. `ctx.platforms.register()` becomes meaningful only in V2.

### B3. `process-job.js` Is Untouched (HIGH)

The 671-line monolith with all platform-specific extraction logic — TikTok auth session retry (lines 382-450), browser navigation fallback (lines 451-520), X 403 refresh (line 286) — remains fully intact after all 11 tasks. Platform plugins own the URL pattern data but not the behavior. The stated goal of "vertical plugin ownership" is contradicted by the implementation: the actual work stays in core.

**Evidence:** `server/src/worker/process-job.js:154-665` — entire function, no dispatch hook, no extraction seam. See R-007.

**Required fix:** Extract platform-specific worker strategies before building the dispatch layer. Without this prerequisite refactor, Task 7's dispatch table is an indirection that routes back to the same monolith.

### B4. Boundary Checker Blind Until Task 9 (HIGH)

`check-module-boundaries.mjs` has no `plugins` domain entry. `getDomain()` returns `null` for plugin files, and `evaluateImports()` skips null-domain edges. Tasks 5-8 write plugin code with zero boundary enforcement. Violations accumulate for four tasks before detection.

**Evidence:** `scripts/check-module-boundaries.mjs:22-34` — DOMAINS array, no `plugins` entry. Lines 122-123: `if (!fromDomain || !toDomain) continue`. See R-004.

**Required fix:** Move boundary checker domain updates to Task 1, before any plugin code is written.

### B5. Hot Reload Is Architecturally Impossible (HIGH)

Express route registration is append-only — `app.use()` adds middleware permanently, there is no `app.unuse()`. Hot-swapping plugin routes requires either a proxy layer, a route indirection table, restarting Express (defeating the purpose), or replacing Express with Fastify/Hapi. The plan specifies none of these mechanisms. The `onConfigChange(ctx, diff)` hook cannot re-register routes.

**Evidence:** Express 5 API has no route removal mechanism. `nodemon` achieves the same outcome (~500ms restart) with zero infrastructure.

**Required fix:** Drop dev hot reload from the plan. Revisit only with a specified mechanism.

---

## 3. Risk Register

### R-001 — Legacy Jobs Fail Immediately on Task 7 Deploy

| Field | Content |
|-------|---------|
| Severity | **CRITICAL** |
| Likelihood | High |
| Description | Existing Job schema has no `pluginId`. Task 7 adds `pluginId: { default: '' }`. Worker dispatch treats `pluginId: ''` as terminal failure. Every pre-existing QUEUED job fails immediately. |
| Trigger | Deploying Task 7 with jobs in QUEUED or RUNNING state |
| Detection | All queued jobs show FAILED with "unknown plugin id" error |
| Mitigation | Dispatch MUST fall back to legacy handler for empty `pluginId`. Backfill script for existing jobs. |
| Evidence | `queue.js:24-37`, `job.js:9-120` |

### R-002 — Double-Shutdown: registerShutdown() Called Twice

| Field | Content |
|-------|---------|
| Severity | **High** |
| Likelihood | High |
| Description | `process.on()` accumulates listeners. Task 2 adds plugin shutdown. Two closures fire simultaneously — `isShuttingDown` is per-closure with no shared state. Mongoose disconnects while plugins still run `stop()`. |
| Trigger | Task 2 calls `registerShutdown()` a second time |
| Detection | SIGTERM causes duplicate mongoose disconnect errors; `MaxListenersExceededWarning` |
| Mitigation | Refactor to ordered pipeline: plugins stop → HTTP closes → MongoDB disconnects. Never call `registerShutdown()` twice. |
| Evidence | `register-shutdown.js:1-22`, `start-api-runtime.js:32-40` |

### R-003 — Platform ID Namespace Inconsistency

| Field | Content |
|-------|---------|
| Severity | **Medium** |
| Likelihood | High (certain during implementation) |
| Description | Platform registry uses `id: 'x'`. Plugin manifest uses `id: 'platform-x'`. Job documents store one or the other. No contract enforces the relationship. |
| Trigger | Tasks 5, 6, 7 implementation |
| Detection | Third platform added with inconsistent convention |
| Mitigation | Lock convention: `pluginId = \`platform-${platform.id}\``. Add startup validation. |
| Evidence | `platforms/x/index.js:53` — `id: 'x'`. Plan Task 7: hardcoded switch. |

### R-004 — Boundary Checker Blind to Plugin Code Until Task 9

| Field | Content |
|-------|---------|
| Severity | **High** |
| Likelihood | Certain |
| Description | `getDomain()` returns null for plugin files. `evaluateImports()` skips null-domain edges. Four tasks of plugin code written with zero enforcement. |
| Trigger | Tasks 5-8 ship before Task 9 |
| Detection | Task 9 retroactively catches violations across already-written code |
| Mitigation | Add `plugins` domain to checker in Task 1. |
| Evidence | `check-module-boundaries.mjs:22-34`, lines 122-123 |

### R-005 — API Runtime MongoDB Fire-and-Forget vs Plugin start()

| Field | Content |
|-------|---------|
| Severity | **High** |
| Likelihood | Medium |
| Description | API runtime connects MongoDB without `await`. Worker runtime awaits it. If `manager.startAll()` runs before MongoDB connects, plugins querying on `start()` fail. Plugin marked degraded incorrectly. |
| Trigger | Slow MongoDB connection at API startup |
| Detection | Plugin startup errors despite healthy MongoDB |
| Mitigation | Provide `ctx.mongo.ready` promise, or enforce no-query-on-start in contract tests. |
| Evidence | `start-api-runtime.js:17-27` (fire-and-forget), `start-worker-runtime.js:22` (awaited) |

### R-006 — Static Platform Registry Incompatible With Dynamic Registration

| Field | Content |
|-------|---------|
| Severity | **High** |
| Likelihood | Certain |
| Description | Registry builds Maps at require-time. `ctx.platforms.register()` runs post-load. Race window where PLATFORMS is empty if static imports removed. |
| Trigger | Task 5/6 removing static imports |
| Detection | Valid URLs rejected as "Invalid postUrl" during startup |
| Mitigation | Keep static imports for V1. Plugin wrappers are lifecycle shells only. |
| Evidence | `registry.js:13-32`, `routes/jobs.js:9`, `process-job.js:14` |

### R-007 — processOneCycle() Has No Dispatch Seam

| Field | Content |
|-------|---------|
| Severity | **High** |
| Likelihood | Certain |
| Description | Task 7 creates dispatch table, but destination IS `processOneCycle()`. No platform logic extracted. Test passes with `dispatchJobToPlugin = () => processOneCycle()`. False sense of completion. |
| Trigger | Task 7 implementation |
| Detection | Passing tests that don't verify platform logic extraction |
| Mitigation | Extract `processOneCycle` into `legacyJobHandler` first. Test must verify `processOneCycle` is NOT called directly. |
| Evidence | `process-job.js:154-665`, line 286 |

### R-008 — Telemetry Singleton Identity Risk

| Field | Content |
|-------|---------|
| Severity | **Medium** |
| Likelihood | Medium |
| Description | `lib/telemetry.js` is a singleton. If `ctx.telemetry` creates a new EventEmitter instead of delegating to the singleton, plugin events never reach SSE stream or MongoDB sink. Split-brain telemetry. |
| Trigger | Task 2 SDK implementation |
| Detection | Plugin events in logs but not in API telemetry stream |
| Mitigation | Spec must state: `ctx.telemetry.emit` is direct alias to `publishTelemetry`. Test required. |
| Evidence | `telemetry.js:1-8` — module-level singleton |

### R-009 — Rollback Flag Is Parenthetical, Not Implemented

| Field | Content |
|-------|---------|
| Severity | **High** |
| Likelihood | High |
| Description | `ENABLE_PLUGIN_KERNEL=false` mentioned in rollback plan as a parenthetical. Not a Task 2 step, not tested, not in any config file. Rollback requires manual code revert. |
| Trigger | Regression after Task 2 with no flag implemented |
| Detection | Setting flag has no effect |
| Mitigation | Task 2 MUST include flag as first-class step with test coverage. |
| Evidence | `config/env.js:1-34` — no flag exists |

### R-010 — No Runtime Circuit Breaker for Plugin Handler Failures

| Field | Content |
|-------|---------|
| Severity | **High** |
| Likelihood | Medium |
| Description | `STRICT_PLUGINS` only applies at startup. No state transition when a plugin handler throws during job processing. Failed jobs keep dispatching to same plugin. |
| Trigger | Plugin handler throws mid-processing |
| Detection | Jobs fail repeatedly with same plugin error |
| Mitigation | Define runtime failure policy before Task 7: degrade after N failures, or let jobs fail individually. |
| Evidence | `queue.js:69-105`, `process-job.js:641-663` |

### R-011 — Boundary Checker Cannot Detect Inter-Plugin Imports

| Field | Content |
|-------|---------|
| Severity | **Medium** |
| Likelihood | High |
| Description | All plugin files share the `plugins` domain. `evaluateImports()` skips same-domain edges. Cross-plugin imports (`platform-x` → `platform-tiktok`) pass silently. Requires subtree-level detection — a checker redesign not in the plan. |
| Trigger | Task 9 as written |
| Detection | Inter-plugin imports pass boundary check |
| Mitigation | New rule type: subtree-level forbidden edges within same domain. Non-trivial redesign. |
| Evidence | `check-module-boundaries.mjs:118-139`, line 124 |

### R-012 — Degraded Plugin Creates Jobs That Silently Fail

| Field | Content |
|-------|---------|
| Severity | **High** |
| Likelihood | Medium |
| Description | `ensureEnabledPlatform()` checks config flags. Plugin manager checks runtime state. Systems are never wired together. Degraded plugin passes config check → job created → dispatch fails → user sees cryptic failure. |
| Trigger | Plugin loads but is marked degraded |
| Detection | Jobs created (201) that immediately fail at dispatch |
| Mitigation | Unify feature gates: `ensureEnabledPlatform()` must consult plugin manager state. |
| Evidence | `routes/jobs.js:99`, design doc Section 2.4 |

---

## 4. Migration Failure Scenarios

### Scenario A — Job Queue Poisoning at Task 7 Deploy

1. 10 X.com jobs in QUEUED state in MongoDB
2. Task 7 deployed: Job schema adds `pluginId`, default `''`
3. Worker restarts, `claimNextQueuedJob()` claims job with `pluginId: ''`
4. `dispatchJobToPlugin({ pluginId: '' })` hits unknown-plugin branch
5. All 10 jobs immediately fail with cryptic error
6. **Recovery:** Manual MongoDB update + re-queue, or restart with `ENABLE_PLUGIN_KERNEL=false` (if implemented — see R-009)

### Scenario B — Unsafe Deployment Order (Worker Ahead of API)

1. API on Task 5 (no pluginId written): creates jobs without `pluginId`
2. Worker on Task 7 (dispatch table active): claims job with `pluginId: ''`
3. Dispatch treats empty pluginId as terminal failure
4. **Safe direction:** API ahead of worker — worker ignores `pluginId`, runs legacy path
5. **Mitigation:** Worker must always have empty-pluginId fallback regardless of deployment order

### Scenario C — Platform Plugin Registration Race Window

1. Task 5 deployed: `platform-x` plugin wraps registration, static import removed from `registry.js`
2. API starts, `require('./platforms/registry')` runs — PLATFORMS is empty
3. First request arrives before plugin `register()` completes
4. `resolvePlatform()` iterates empty PLATFORMS, returns null
5. Valid X.com URL rejected as "Invalid postUrl"
6. **Mitigation:** Never remove static imports for V1 internal plugins

### Scenario D — Shutdown Race: Plugin stop() vs Mongoose Disconnect

1. SIGTERM received during extraction (3-minute timeout window)
2. If `registerShutdown()` called twice (see R-002): both listeners fire simultaneously
3. Plugin `stop()` attempts final telemetry flush requiring MongoDB
4. Mongoose `disconnect()` fires concurrently from second listener
5. Telemetry batch write fails silently — data loss
6. **Mitigation:** Ordered shutdown pipeline: plugins → HTTP → MongoDB

### Scenario E — Dual-Path Migration Stalls and Diverges

1. Phase 2 complete: platform plugins exist, `ENABLE_PLUGIN_KERNEL=true`
2. Phase 3 (jobs plugin) slips indefinitely
3. Bug fixed in legacy `routes/jobs.js`
4. Plugin path doesn't have the fix
5. Users on plugin path hit the unfixed bug — regression report
6. **Root cause:** No test asserts both paths have identical behavior
7. **Mitigation:** CI assertion that legacy route registrations are removed after Phase 4

---

## 5. Test Gap Analysis

### What the plan tests:

- Plugin manifest validation (id, version, capabilities)
- Manager `startAll()`/`stopAll()` lifecycle in isolation
- Runtime calls plugin manager before listen/queue
- `FEATURE_DISABLED` 503 response shape
- Telemetry envelope includes `pluginId`/`area`
- Platform plugin exports valid manifest and `register()`
- `POST /api/jobs` stores `pluginId`
- Worker dispatch calls handler by `pluginId`
- Activity UI translator includes `pluginLabel`
- Boundary checker flags inter-domain imports

### What the plan does NOT test (12 critical gaps):

| # | Gap | Related Risk |
|---|-----|-------------|
| 1 | Legacy job fallback: `pluginId: ''` processed by legacy handler, not failed | R-001 |
| 2 | Double-shutdown prevention: SIGTERM runs cleanup exactly once, in order | R-002 |
| 3 | `ENABLE_PLUGIN_KERNEL=false` rollback: plugin manager not initialized | R-009 |
| 4 | MongoDB not-ready during plugin `start()` on API runtime | R-005 |
| 5 | Platform registry functional after dynamic registration: `resolvePlatform('x.com')` works | R-006 |
| 6 | Degraded plugin → route returns 503 (not 201 with later dispatch failure) | R-012 |
| 7 | Deployment skew: Worker on Task 7, API on Task 5 (unsafe order) | Scenario B |
| 8 | Legacy path removal: CI assertion after Phase 4 cutover | Scenario E |
| 9 | Boundary checker subtree detection: `platform-x` → `platform-tiktok` flagged | R-011 |
| 10 | Telemetry singleton identity: `ctx.telemetry.emit()` produces entry in `listTelemetry()` | R-008 |
| 11 | `processOneCycle` not called directly after dispatch (negative test) | R-007 |
| 12 | Job recovery backfill: re-queued jobs get correct `pluginId` assignment | R-001 |

### Meta-pattern

The plan's acceptance criteria measure whether **new code exists**, not whether **old code is gone** or **end-to-end behavior is correct**. Passing tests for Tasks 5-8 do not verify that static imports are removed, that the registry works end-to-end, that legacy processing is no longer invoked, or that the boundary checker catches violations in the new code.

---

## 6. First-Principles Challenges

### Challenge 1: Platforms as Plugins — Category Error

| Aspect | Assessment |
|--------|-----------|
| **Plan's thesis** | Wrapping platforms as plugins gives them vertical ownership and enables the plugin contract |
| **Challenge** | `platforms/x/index.js` is 67 lines of pure data — a Set of hostnames, three pure functions, five constants. No state, no initialization, no async operations. The plugin lifecycle (register/start/stop) was designed for stateful services. Further, `ctx.platforms.register()` runs post-load, after `hostMap`/`shortHostMap` are already built. If the registry becomes dynamic, every consumer must change — unstated ripple effects across `routes/jobs.js`, `process-job.js`, `downloader-service.js`, `playwright-adapter.js`. |
| **Verdict** | Platform definitions are data, not services. Keep them as plain objects in `platforms/`. The existing registry extension pattern already works. Tasks 5 and 6 should be removed. |

### Challenge 2: Graceful Degradation — Conflated Motivations

| Aspect | Assessment |
|--------|-----------|
| **Plan's thesis** | Missing plugin doesn't crash startup; features return deterministic 503 |
| **Challenge** | This conflates two distinct requirements. (1) **Operational resilience** — TikTok extractor crashes, X downloads keep working. Real problem; current code has one worker loop where a platform failure kills both. (2) **Architectural future-proofing** — boot with zero plugins for V2 extensibility. Already solved by `ensureEnabledPlatform()` in `route-utils.js:159` and `PATCH /api/capabilities`. |
| **Verdict** | Drop the architectural case (already solved). Address the operational case by fault-isolating extraction strategies with try/catch — the isolation comes free with strategy extraction (Plan A+ Task D). |

### Challenge 3: Plugin Manager Kernel — Premature Abstraction

| Aspect | Assessment |
|--------|-----------|
| **Plan's thesis** | Stable V1 contract enables V2 external plugins |
| **Challenge** | V1 contract exists entirely to serve V2. If V2 never ships — realistic for a single-developer app with no committed timeline — all overhead (manifest validation, state machine, SDK abstraction, lifecycle hooks) is pure cost. Phase 5 says "Prepare external plugin allowlist/signing controls for V2" — future-proofing against a future that hasn't been committed. The organizational trigger for plugin architectures is team coordination between developers who don't communicate directly. With one developer, there is no coordination problem. |
| **Verdict** | Defer until V2 has a committed timeline, a third platform is added, or a second developer joins. |

### Challenge 4: Dev Hot Reload — Technically Impossible

| Aspect | Assessment |
|--------|-----------|
| **Plan's thesis** | Plugins own routes via SDK router; dev supports hot reload |
| **Challenge** | Express has no `app.unuse()`. Hot-swapping routes requires a proxy layer, route indirection table, Express restart (defeating purpose), or framework switch. Plan specifies no mechanism. `onConfigChange(ctx, diff)` cannot re-register routes. |
| **Verdict** | Drop. `nodemon` restarts in ~500ms with zero infrastructure and achieves the same outcome. |

### Challenge 5: ctx.telemetry — Underspecified, Load-Bearing

| Aspect | Assessment |
|--------|-----------|
| **Plan's thesis** | Plugins emit telemetry through SDK, unified in core bus |
| **Challenge** | "Core bus" is never defined. Existing `lib/telemetry.js` is a singleton (line 44-46 explicitly documents this). If `ctx.telemetry` creates a new EventEmitter, split-brain telemetry is guaranteed. The correct implementation is one line: `ctx.telemetry = { emit: publishTelemetry }`. If it's anything else, it must be fully specified before Tasks 1-4 are written. |
| **Verdict** | Specify explicitly that `ctx.telemetry` delegates to the existing singleton. If that's all it is, the spec costs nothing. If it isn't, the plan is unimplementable as written. |

### Challenge 6: Vertical Ownership — Unachievable Without Service Layer in ctx

| Aspect | Assessment |
|--------|-----------|
| **Plan's thesis** | Each plugin owns its business slice end-to-end |
| **Challenge** | Platform plugin worker handlers need `extractorService` (572 lines), `downloaderService` (545 lines), and `playwright-adapter` (392 lines). None are in `ctx`. The SDK provides: logger, telemetry, config, mongo, router, workerBus. A plugin with routes and a logger isn't vertical ownership — it's a namespace. True vertical ownership requires either exposing the service layer in ctx (breaking the boundary abstraction) or keeping `process-job.js` as the monolithic processor forever. |
| **Verdict** | Load-bearing design gap. Plan doesn't choose between these options. |

---

## 7. Complexity Budget

| Metric | Current State | After Full Plan | Delta |
|--------|--------------|-----------------|-------|
| Server files | 35 | ~65 | +86% |
| New abstractions | 0 | 7+ | plugin-contract, plugin-manager, plugin-sdk, register-internal-plugins, feature-disabled, worker-dispatch, per-plugin manifest+index |
| New concepts to learn | — | 8+ | manifest schema, lifecycle states, ctx SDK, plugin manager, STRICT_PLUGINS, ENABLE_PLUGIN_KERNEL, hot reload, worktree dev |
| New failure modes | 0 | 5+ | degraded state, worker misrouting, dual-path misconfiguration, hot reload divergence, registry timing |
| Estimated dev hours | — | 22-44 | One week of focused work |
| Ongoing tax per feature | 1 step | 6 steps | Determine plugin → write manifest → register via ctx → handle lifecycle → add boundary rules → update register-internal-plugins |

---

## 8. Simpler Alternatives (80% Value, 20% Complexity)

| Plan Element | Plan's Approach | Simpler Alternative | Complexity Saved |
|---|---|---|---|
| Platform isolation | Plugin manifest + lifecycle | Keep `platforms/` as data objects (already works); boundary checker enforces isolation | 95% |
| Graceful degradation | Plugin state machine | Keep `ensureEnabledPlatform()` (already works); add try/catch in strategy execution | 100% |
| Worker dispatch | pluginId + plugin manager dispatch table | `job.platform` field + `platform.workerStrategy` on existing data object | 80% |
| process-job.js coupling | Plugin vertical ownership (doesn't fix it) | Extract platform retry chains into `platforms/tiktok/worker-strategy.js` and `platforms/x/worker-strategy.js` | Fixes the actual problem |
| Telemetry visibility | Full SDK ctx.telemetry surface | Add `pluginId`/`area` to normalization in `lib/telemetry.js` — a 2-field change | 90% |
| Dev hot reload | ctx.router + onConfigChange + rollback | nodemon (already used, ~500ms restart) | 100% |

---

## 9. Hard Questions

These must be answered before ANY implementation begins — whether Plan A+ or the full plugin plan:

1. **What is one concrete feature that CANNOT be built today due to the current architecture?** Not "cleaner" — what is blocked?

2. **What is the V2 timeline and who will write external plugins?** If undefined, the entire plugin contract is serving a customer that doesn't exist yet.

3. **Why does the plan not fix `process-job.js`?** It's the only real coupling problem. After all 11 tasks, the 671-line file still exists unchanged. What does "plugin ownership" mean if the platform's actual work lives in core?

4. **Is the platform registry static or dynamic after migration?** If static, Tasks 5-6 do nothing. If dynamic, list every consumer that must change.

5. **How does a platform plugin's worker handler access `extractorService` and `downloaderService`?** Name the mechanism explicitly.

6. **Is `ctx.telemetry` exactly `{ emit: publishTelemetry }`?** If yes, say so in the spec. If no, specify the full interface before Task 1.

7. **What is the opportunity cost?** What user-facing features will not be built during the 22-44 hours this migration takes?

---

## 10. Recommendation

### Proceed: Plan A+ (5 tasks, ~8-12 hours)

| Task | Description | Delivers |
|------|-------------|----------|
| **A** | Add `pluginId`/`area` fields to telemetry envelope with `core` as default | Purely additive telemetry enrichment |
| **B** | Extend boundary checker with `plugins/` and `runtime/` domains | Enforcement scaffold before code |
| **C** | Add `pluginId` to Job schema with legacy fallback dispatch | Empty pluginId routes to `processOneCycle()` — no deploy failures |
| **D** | Extract platform worker strategies from `processOneCycle` | **The real fix.** TikTok auth retry, X 403 refresh, browser fallback — extracted into injectable per-platform strategy objects. Delivers fault isolation AND vertical ownership without plugin ceremony. |
| **E** | Activity UI plugin badge and filter | User-visible payoff using Task A's telemetry fields |

### Defer: Plan B (plugin kernel, SDK ctx, lifecycle hooks)

Trigger conditions — any one is sufficient to revisit:

1. **Third platform added** — organizational complexity justifies the abstraction
2. **`process-job.js` exceeds ~1,000 lines** — the monolith outgrows strategy extraction
3. **Second developer joins** — the coordination problem plugin architectures actually solve

### If Plan B proceeds anyway — three blockers must be resolved in the design doc FIRST:

1. **Registry sequencing:** How does `ctx.platforms.register()` integrate with the static PLATFORMS array that consumers depend on at module load time?
2. **Worker service access:** Name the mechanism by which platform plugin worker handlers reach `extractorService`, `downloaderService`, `playwright-adapter`
3. **`ctx.telemetry` spec:** Define "core bus" — specifically whether it delegates to the existing singleton and how

---

## 11. Pre-Implementation Decisions Required

Regardless of which plan variant is chosen, these three decisions must be made and documented before any code is written:

1. **Canonical ID namespace** — Pick one: `x` or `platform-x`. Enforce consistently across platform registry, plugin manifests, Job documents, telemetry events, and boundary checker domains.

2. **Shutdown ordering** — Specify the pipeline sequence explicitly: plugins stop → HTTP server closes → MongoDB disconnects. The current `register-shutdown.js` cannot accumulate ordered handlers.

3. **Feature gate unification** — Define how plugin runtime state connects to `ensureEnabledPlatform()`. Without this, a degraded plugin will accept jobs at the route layer that fail at the dispatch layer (see R-012).

---

*Review conducted by three independent agents with full codebase access. All findings cross-validated. File:line evidence provided for every risk.*
