# Testing Matrix

## Automated

| Area | Command | Purpose |
| --- | --- | --- |
| Server unit + integration | `npm --prefix server run test` | Validates domain rules, routes, worker flow, and recovery behavior |
| Client unit | `npm --prefix client run test` | Validates UI behavior and polling hooks |
| Client build | `npm --prefix client run build` | Ensures production bundle compiles |
| Client lint | `npm --prefix client run lint` | Enforces frontend code quality |
| Release checks | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1` | Confirms required scripts and release docs exist |

## Manual Smoke

1. Start app: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1`
2. Bootstrap login once: `npm run auth:bootstrap --prefix server`.
3. Open `http://localhost:5173`.
4. Submit a valid tweet URL (`https://x.com/<user>/status/<id>`).
5. Confirm job appears in dashboard and transitions out of `queued`.
6. Confirm server logs show processing cycle activity.
7. Restart server during a running job and confirm stale jobs are recovered to `failed`.
