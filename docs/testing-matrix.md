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
