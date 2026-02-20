# Media Vault - Project Memory

---

## Architecture Decisions

### Domain Governance (2026-02-20)

Server code reorganized from flat layout into 5 autonomous domains with strict ownership boundaries:
- **API** (`server/src/api/`) -- Express route handlers. Imports from Core only.
- **Worker** (`server/src/worker/`) -- Background job processing. Imports from Core + Services.
- **Services** (`server/src/services/`) -- Playwright extraction + download. Imports from Core only. Stateless.
- **Platforms** (`server/src/platforms/`) -- Platform definitions (X, TikTok). Zero dependencies.
- **Core** (`server/src/core/`) -- Foundation: config, models, runtime, middleware, lib, utils, dispatch, domain.

Each domain has:
- `CLAUDE.md` -- single source of truth for file inventory, dependencies, interface contracts
- Agent steward (`.claude/agents/<domain>-steward.md`) -- enforces boundary
- Skill gate (`.claude/skills/<domain>-work/SKILL.md`) -- procedural access control

Key rule: No agent outside a domain's team may modify files in that domain's directory. Cross-domain interface changes require steward notification and acknowledgment.

PM dispatch enforcement: The PM hook (`pm-rules.sh`) and guardrails both require the PM to route any server modification work to the correct domain steward agent (api-steward, worker-steward, services-steward, platforms-steward, or core-steward). Generic agents are never allowed to modify server/src/ files. Cross-domain tasks use a team with one steward per affected domain. Read-only agents may read any file.

Dependency flow: Platforms -> Core -> API, Worker, Services. Worker also imports Services.

### Runtime Split (2026-02-20)

Entry point moved to `server/src/core/runtime/entrypoints/index.js`. Supports three modes via `ROLE` env var:
- `combined` (default) -- API + Worker in same process
- `api` -- Express only
- `worker` -- Queue worker only

---

## Common Patterns

### Server Import Paths
Core has shim files for backward compatibility. Both paths work:
- `core/constants/job-status` -> `core/data/job-status` (canonical)
- `core/middleware/request-limits` -> `core/http/request-limits` (canonical)
- `core/models/job` -> `core/data/job-model` (canonical)

### Telemetry Sink Modes
- `memory` (default for combined) -- in-memory ring buffer only
- `mongo` (default for split api/worker) -- ring buffer + MongoDB persistence + cross-process polling

---

## Debugging Notes

*(Populated as bugs are investigated)*

---

## Team Run Lessons

*(Populated after each team run)*
