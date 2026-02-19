# Strict Folder Responsibility Map

Defines ownership boundaries for `server/src` in the strict folder model.

## Ownership Areas

1. `server/src/core/*` — Core Platform
2. `server/src/domains/jobs/*` — Jobs Lifecycle (includes retry/status behavior)
3. `server/src/domains/contacts/*` — Contacts
4. `server/src/domains/platform-x/*` — Platform X
5. `server/src/domains/platform-tiktok/*` — Platform TikTok
6. `server/src/domains/capabilities/*` — Capabilities/Admin
7. `server/src/domains/worker-health/*` — Worker Health/Recovery

## Hard Rules

1. A domain may not import another domain's internals.
2. Shared behavior may only be imported from `core/*`.
3. Core may expose contracts/services to domains, but must not depend on domain internals.
4. Business logic must live in one owning domain folder only.
5. Legacy adapter files are temporary and must be removed at final cutover.

## Canonical ID Contract

1. Platform IDs: `x`, `tiktok`
2. Domain IDs: `platform-x`, `platform-tiktok`
3. Mapping rule: `domainId = platform-${platformId}`

## Domain Runtime Contract

```js
module.exports = {
  id: 'jobs',
  runtimeTargets: ['api', 'worker'], // allowed: api, worker, both
  mountRoutes(app, ctx) {},
  startWorker(ctx) {},
  stopWorker(ctx) {},
};
```

`ctx` contract:

1. `ctx.logger`
2. `ctx.telemetry.emit` (alias to `publishTelemetry` singleton)
3. `ctx.config`
4. `ctx.mongo`
5. `ctx.core` (core services only)

## Migration Staging Notes

1. During migration, legacy paths may re-export core/domain modules as adapters.
2. Boundary checker allowlist entries must be explicit and time-boxed.
3. New code must import target ownership paths (`core/*`, `domains/*`) immediately.
4. Adapter removal is mandatory at final cutover after equivalence tests pass.
