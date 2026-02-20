# ⛔ DO NOT USE THIS DIRECTORY AS A WORKING DIRECTORY

This is NOT a valid working directory. Agents must use one of the 5 domain directories:

- `server/src/api/` — API domain (api-steward, /api-work skill)
- `server/src/core/` — Core domain (core-steward, /core-work skill)
- `server/src/platforms/` — Platforms domain (platforms-steward, /platforms-work skill)
- `server/src/services/` — Services domain (services-steward, /services-work skill)
- `server/src/worker/` — Worker domain (worker-steward, /worker-work skill)

Each domain directory has its own CLAUDE.md with file inventory, dependency map, and coding rules. Using `server/src/` as a working directory bypasses all domain-level context.

If you are an agent and your working directory is `server/src/`, you are misconfigured. Report this to the lead and stop work.
