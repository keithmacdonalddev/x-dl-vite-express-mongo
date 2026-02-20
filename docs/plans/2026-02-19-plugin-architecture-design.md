# Plugin Architecture Design

> **Superseded:** This design is superseded by `docs/plans/2026-02-19-strict-folder-ownership-implementation-plan.md` for implementation.

**Date:** 2026-02-19  
**Status:** Superseded  
**Scope:** `server/` backend modularization, plugin lifecycle, telemetry and activity visibility

## Goal

Restructure the backend into independent ownership areas where each business area is a plugin, while keeping a small non-removable core. The app must boot when plugins are missing or disabled, and disabled features must fail explicitly instead of crashing startup.

## Locked Decisions

1. Graceful degradation is required. Missing plugin does not crash startup; related features return deterministic `503 FEATURE_DISABLED`.
2. V1 is internal-only plugins using a stable contract. External npm plugins are deferred to V2.
3. Ownership model is plugin-vertical: each plugin owns routes, models, and worker handlers for its domain.
4. Plugins own their own collections/schemas by default.
5. Startup mode: prod loads plugins at startup only; dev supports plugin hot reload.
6. Internal plugin location is `server/src/plugins/*`.
7. Unified telemetry transport and stream contract remain core-owned.

## Section 1: Target Architecture

### 1.1 Core Kernel (non-removable)

Core keeps only platform concerns:
- runtime boot and process role orchestration
- plugin manager (discover, validate, load, start, stop)
- shared SDK for plugins (`logger`, `telemetry`, `mongo`, config access, worker bus)
- global security and auth baseline
- health shell and observability transport

Core must never import plugin internals directly.

### 1.2 Plugin Vertical Ownership

Each plugin is one independent responsibility area and owns its business slice end-to-end:
- API routes
- domain logic and worker handlers
- plugin-owned data schema/collections
- plugin-specific migrations/tests

Proposed plugin skeleton:

```text
server/src/plugins/<plugin-id>/
  manifest.js
  index.js
  routes/
  models/
  worker/
  migrations/
  tests/
```

### 1.3 Initial Target Plugin Areas

- `jobs`
- `contacts`
- `platform-x`
- `platform-tiktok`
- `capabilities`
- `worker-health`

## Section 2: Contracts, Data Flow, Error Handling, Testing

### 2.1 Plugin Contract

Every plugin must export:
- `manifest` with `id`, `version`, `capabilities`, `dependsOn`, `enabledByDefault`
- `register(ctx)`
- `start(ctx)`
- `stop(ctx)`
- optional `onConfigChange(ctx, diff)` for dev hot reload
- optional `getHealth()`

### 2.2 Core SDK Contract (`ctx`)

Core provides:
- `ctx.logger`
- `ctx.telemetry`
- `ctx.config`
- `ctx.mongo`
- `ctx.router`
- `ctx.workerBus`

Plugins do not use cross-plugin imports; shared behavior goes through SDK/core services.

### 2.3 Data and Job Flow

1. Core starts and loads enabled plugins from `server/src/plugins/*`.
2. Plugins register routes and worker handlers.
3. API flow: request -> plugin route -> plugin-owned storage.
4. Worker flow: queued job includes `pluginId` -> dispatch to plugin handler.
5. Shutdown: core calls `stop()` in reverse dependency order.

### 2.4 Error Model

- Plugin load failure marks plugin `degraded` in normal mode; app remains up.
- Missing/disabled/degraded feature routes return `503` and `code: FEATURE_DISABLED`.
- `STRICT_PLUGINS=true` can force startup hard-fail for CI or strict environments.
- Dev hot reload rollback uses last-known-good plugin instance on reload failure.

### 2.5 Telemetry and Activity Visibility (Core-owned)

Core owns transport, storage, and streaming:
- `plugin -> ctx.telemetry.emit -> core bus -> sinks(memory/mongo/console) -> /api/telemetry + /api/telemetry/stream`

Required event envelope fields:
- `ts`, `level`, `event`, `pluginId`, `area`, `jobId`, `traceId`, `attempt`, `runtimeRole`, `sourceProcessId`, `message`, `data`

UI behavior target:
- keep current summary-first Activity behavior
- add plugin/area visual badge per event
- add filter by plugin/area
- add raw stream view for full technical details per job

### 2.6 Required Test Categories

1. Plugin contract tests (manifest and lifecycle validation)
2. Boundary tests (no cross-plugin internals imports)
3. Boot matrix tests (zero plugin, one plugin, missing plugin)
4. Worker dispatch tests by `pluginId`
5. Telemetry schema tests (required correlation fields)
6. Activity UI tests (plugin badge/filter/raw stream behavior)
7. Prod mode tests asserting hot reload disabled

## Section 3: Rollout and Migration Plan

### Phase 0: Prep (no behavior change)

- Add plugin contract types and validator
- Add plugin manager scaffold
- Add optional telemetry envelope fields (`pluginId`, `area`)
- Keep existing legacy paths intact

Exit criteria:
- Existing behavior and tests remain stable

### Phase 1: Kernel Activation

- Enable kernel startup path with internal plugin loading
- Keep legacy parallel fallback path
- Add `STRICT_PLUGINS` policy and deterministic degrade behavior

Exit criteria:
- App boots with kernel path enabled
- Missing plugin does not crash boot
- Disabled routes return `503 FEATURE_DISABLED`

### Phase 2: Low-Risk Plugin Extraction

- Move `platform-x` and `platform-tiktok` logic into plugins
- Keep existing API response contracts stable
- Route worker dispatch through `pluginId` for these platforms

Exit criteria:
- No user-facing regression in platform flows
- plugin-tagged telemetry appears for platform steps

### Phase 3: Core Business Extraction

- Move jobs domain into `jobs` plugin
- Move contacts domain into `contacts` plugin
- Replace legacy direct shared imports with SDK calls

Exit criteria:
- Business ownership primarily in plugins, not legacy core
- Boundary rules block cross-plugin internals imports

### Phase 4: Operational Plugin Extraction and Cleanup

- Move capabilities and worker-health to plugins
- Remove legacy fallback route/worker registrations
- Enforce plugin-only business registration path

Exit criteria:
- Core is runtime/platform only
- Business features are plugin-delivered

### Phase 5: Hardening and V2 Readiness

- Enable dev hot reload for plugins
- Assert prod startup-only loading
- Prepare external plugin allowlist/signing controls for V2

Exit criteria:
- Dev hot reload works safely
- Prod hot reload is off and enforced
- Controls ready before external plugin support

## Section 4: Risks, Guardrails, Acceptance Criteria

### 4.1 Major Risks

1. Boundary drift recreates cross-area overlap
2. Logging divergence across plugins
3. Startup instability when plugin states vary
4. Worker misrouting without explicit ownership tags
5. Regression during dual legacy/plugin coexistence

### 4.2 Guardrails

1. CI import rules prevent cross-plugin internal imports
2. Startup validates plugin manifests and lifecycle exports
3. Missing/disabled plugin behavior is explicit, never silent
4. Core enforces telemetry correlation fields
5. Worker refuses unknown plugin jobs and emits terminal failure telemetry
6. Feature flags protect dual-path migration until cutover
7. Dev-only hot reload, prod-off assertion at startup
8. External plugin support blocked until V2 supply-chain policy exists

### 4.3 Go/No-Go Acceptance Criteria

1. App boots with zero plugins and still serves health/telemetry endpoints
2. Disabled plugin features return deterministic `503 FEATURE_DISABLED`
3. Contract, boundary, and boot-matrix tests pass
4. Activity stream visually identifies plugin/area per event
5. Split runtime (API + worker) stream continuity is verified
6. Final state removes legacy business routing from core

## Implementation Handoff

Next step is a task-level implementation plan aligned to this design:
- create plugin kernel and contract enforcement first
- migrate platform plugins before jobs/contacts
- migrate observability fields and UI visibility in parallel
- cut over only after acceptance gates pass per phase
