# Server Module Dependency Boundaries

Defines allowed and forbidden dependency edges between server/src/ domains.
Enforced by `scripts/check-module-boundaries.mjs` (run via `npm run check:boundaries`).

## Domain Definitions

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

## Allowed Edges

```
routes     → models, utils, lib, config, platforms, constants, routes/helpers
worker     → models, services, lib, config, constants, utils, platforms
services   → models, lib, config, platforms, utils, constants
models     → constants, lib
lib        → config, constants
config     → (none — leaf node)
constants  → (none — leaf node)
platforms  → config, lib, constants
utils      → constants, lib, config
middleware → lib, config
domain     → constants
```

## Forbidden Edges

These imports indicate architectural coupling violations and will fail `check:boundaries`:

| From | To | Reason |
|------|----|--------|
| `routes` | `services` | Routes must not call services directly; go through models/utils |
| `routes` | `worker` | Routes must not interact with worker internals |
| `models` | `routes` | Models must not import route logic |
| `lib` | `routes` | Shared lib must not depend on route layer |

## Rationale

### routes → services (FORBIDDEN)
Routes handle HTTP and delegate to models/utils. Calling service layer directly
(e.g., Playwright extractor, ffmpeg downloader) creates HTTP-coupled service logic
that breaks when worker runs in a separate process.

### routes → worker (FORBIDDEN)
Workers are background queue processors. Routes must only interact with the queue
via job status in MongoDB (write `status: queued`, read `status: running/completed`).
Direct worker calls prevent the API and worker from ever running as separate processes.

### models → routes (FORBIDDEN)
Models are data schemas. Importing routes from a model would create a circular
dependency and violate the dependency inversion principle.

### lib → routes (FORBIDDEN)
`lib/` contains shared infrastructure (logger, telemetry, error codes). These must
remain framework-agnostic. Importing HTTP route logic into lib couples shared
utilities to the web layer.

## Adding New Domains

1. Add an entry to the domain table above with its path prefix.
2. Define its allowed edges.
3. Update `scripts/check-module-boundaries.mjs` `DOMAINS` and `FORBIDDEN_EDGES` arrays.
4. Run `npm run check:boundaries` to verify no existing violations.
