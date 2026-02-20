# Testing Matrix

## Current Status

Both client and server test scripts are stubs — `npm run test` prints `"Tests disabled"` in both packages.

## Test Command Pattern

Tests use Node's built-in test runner (`node:test`). Run a specific test file:

```bash
npm --prefix server exec node -- --test server/test/<path>
```

Example:
```bash
npm --prefix server exec node -- --test server/test/config/runtime-role.test.js
```

## Test Files

| Test File | Covers |
|-----------|--------|
| `server/test/config/runtime-role.test.js` | `getRuntimeRole()`, `chooseRuntime()` in `config/env.js` |
| `server/test/runtime/runtime-lifecycle.test.js` | Runtime module existence and exports |
| `server/test/runtime/entrypoint-contract.test.js` | `start-api.js`, `start-worker.js`, and npm scripts |

## Notes

- No test framework dependency — uses `node:test` and `node:assert/strict` (built-in since Node 18)
- Tests verify module contracts (existence, exports, config shape) rather than spawning child processes
- Integration tests (full process lifecycle) are deferred — see `docs/plans/` for future work

## 2026-02-19 Split Remediation Verification

Automated verification gate passed with the following commands:

1. `npm run check`
2. `npm run check:boundaries`
3. `node --test scripts/test/check-module-boundaries.test.mjs`
4. `npm --prefix server exec node -- --test server/test/config/runtime-role.test.js`
5. `npm --prefix server exec node -- --test server/test/runtime/runtime-lifecycle.test.js`
6. `npm --prefix server exec node -- --test server/test/runtime/entrypoint-contract.test.js`
7. `npm --prefix server exec node -- --test server/test/lib/telemetry-contract.test.js`
8. `npm --prefix server exec node -- --test server/test/routes/telemetry-stream.test.js`
9. `npm --prefix server exec node -- --test server/test/routes/worker-health.test.js`

Manual split smoke test status:

- Not yet recorded in this file. Run API + worker + client in split mode and verify worker health + telemetry stream behavior end-to-end.

## Regression IDs

| ID | Description | Test File | Frequency |
|----|-------------|-----------|-----------|
| REG-UI-001 | Contact chip without thumbnail does not overlap text | `client/src/lib/contactChipPresentation.test.js` | Pre-merge + CI |
| REG-UI-002 | Failed job row shows failure reason/fallback failed text | `client/src/features/dashboard/jobPresentation.test.js` | Pre-merge + CI |
| REG-SRV-001 | Extractor rejects placeholder playback media and emits unavailable/no-media failure codes | `server/test/services/extractor-quality-selection.test.js`, `server/test/services/extractor-failure-classification.test.js` | Pre-merge + CI |
| REG-SRV-002 | Worker persists typed extractor failure outcomes to job metadata | `server/test/worker/process-job-failure-outcome.test.js` | Pre-merge + CI |

## Unified Regression Command

Run the full regression pack with one command:

```bash
npm run test:regression
```

**Expected:** All server extractor/worker regression tests pass (node:test), followed by all client Vitest regression tests passing.

**Pass criteria:**
- Server: 0 failures across extractor-quality-selection, extractor-failure-classification, process-job-failure-outcome, process-job-failure-identity
- Client: 0 failures across jobPresentation, contactChipPresentation
