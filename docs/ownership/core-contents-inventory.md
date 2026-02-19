# Core Contents Inventory

Inventory of files that must remain `core`-owned under strict folder ownership.

## Why These Belong In Core

These files are cross-cutting dependencies consumed by multiple domains and runtimes.
Placing them inside any single domain would violate non-overlap ownership rules.

## Core-Owned Files and Target Paths

1. `server/src/models/job.js` -> `server/src/core/data/job-model.js`
2. `server/src/constants/job-status.js` -> `server/src/core/data/job-status.js`
3. `server/src/platforms/registry.js` -> `server/src/core/platforms/registry.js`
4. `server/src/utils/validation.js` -> `server/src/core/utils/validation.js`
5. `server/src/utils/account-profile.js` -> `server/src/core/utils/account-profile.js`
6. `server/src/middleware/request-limits.js` -> `server/src/core/http/request-limits.js`
7. `server/src/domain/job-transitions.js` -> `server/src/core/domain/job-transitions.js`
8. `server/src/routes/helpers/route-utils.js` -> `server/src/core/http/route-utils.js`

## Domain Assignment Notes

1. `server/src/routes/retry.js` and `server/src/routes/status.js` are Jobs domain behavior and move under `server/src/domains/jobs/*` ownership.
2. Platform-specific worker behavior moves to:
   - `server/src/domains/platform-x/*`
   - `server/src/domains/platform-tiktok/*`
3. Shared fallback chains that are not platform-specific remain in core worker orchestration.

## Migration Staging Rules

1. Legacy files may temporarily re-export core paths to preserve compatibility.
2. Each adapter must have an owner and planned removal step.
3. Boundary checker migration allowlist must only include explicit temporary adapters.
4. No new feature code may be added to legacy adapter files.

## Cutover Criteria

1. All imports resolve to core/domain target paths.
2. Adapter-only legacy files have zero business logic.
3. Boundary checker allowlist removed.
4. Final adapter files deleted at cutover.
