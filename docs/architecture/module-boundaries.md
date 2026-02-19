# Server Module Dependency Boundaries

Defines allowed and forbidden dependency edges in `server/src/`.
Enforced by `scripts/check-module-boundaries.mjs` via `npm run check:boundaries`.

## Migration Stages

1. **Legacy stage (current code):** legacy domains remain (`routes`, `worker`, `services`, etc.) and existing forbidden edges still apply.
2. **Strict ownership stage (in migration):** `core/*` and `domains/<id>/*` paths are recognized and extra isolation rules apply.

## Legacy Domains

| Domain | Path prefix |
|--------|-------------|
| `routes` | `server/src/routes/` |
| `worker` | `server/src/worker/` |
| `services` | `server/src/services/` |
| `models` | `server/src/models/` |
| `lib` | `server/src/lib/` |
| `config` | `server/src/config/` |
| `constants` | `server/src/constants/` |
| `platforms` | `server/src/platforms/` |
| `utils` | `server/src/utils/` |
| `middleware` | `server/src/middleware/` |
| `domain` | `server/src/domain/` |

### Legacy Forbidden Edges

| From | To | Reason |
|------|----|--------|
| `routes` | `services` | Routes must not call services directly; use models/utils |
| `routes` | `worker` | Routes must not interact with worker internals |
| `models` | `routes` | Models must not import route logic |
| `lib` | `routes` | Shared lib must not depend on route layer |

## Strict Ownership Rules

### New Path Types

| Domain type | Path pattern |
|------------|--------------|
| `core` | `server/src/core/*` |
| `domains:<id>` | `server/src/domains/<id>/*` |

### Strict Forbidden Edges

1. `domains:<a> -> domains:<b>` where `<a> !== <b>` is forbidden.
2. `core -> domains:<id>` is forbidden by default and must only happen through explicit registration seams.

## Temporary Migration Allowlist

Use `scripts/module-boundary-allowlist.json` for explicit temporary exceptions during adapter migration.

Rules:

1. Entries must be exact `from` + `to` relative paths under `server/src`.
2. Keep list minimal and time-boxed.
3. Remove entries when adapter cutover is complete.
4. No permanent architecture shortcuts in allowlist.

Example entry:

```json
{
  "entries": [
    {
      "from": "core/runtime/load-domains.js",
      "to": "domains/jobs/index.js"
    }
  ]
}
```

## Updating Boundary Rules

1. Update `scripts/check-module-boundaries.mjs`.
2. Update `scripts/test/check-module-boundaries.test.mjs`.
3. Update `scripts/module-boundary-allowlist.json` only for temporary migration edges.
4. Run:
   - `node --test scripts/test/check-module-boundaries.test.mjs`
   - `npm run check:boundaries`
