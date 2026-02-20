# Issue Log

## 2026-02-18

- Status: Resolved (runtime + docs)
- Title: `ROLE=combined` runtime/docs mismatch
- Details: Docs and runtime disagreed on whether explicit `ROLE=combined` should be accepted.
- Fix: Runtime now accepts `ROLE=combined` explicitly, while preserving the default behavior where combined mode also works when `ROLE` is unset. Runbook note updated to match.

- Status: Resolved (docs fix)
- Title: `/api/health` response shape in runbook was wrong
- Details: The runbook documented `{ ok: true, status: "ok" }` but the actual response is `{ ok: true, service: "x-dl-api", timestamp: "<ISO>" }`.
- Fix: Runbook health-check section updated to match `server/src/app.js` line 58–63.

- Status: Resolved (docs fix)
- Title: `TELEMETRY_SINK` documented as worker-only — also required on API in split mode
- Details: In split-runtime mode the API process must also set `TELEMETRY_SINK=mongo` so it reads telemetry events from MongoDB and can serve them over SSE. Without it the SSE stream is empty for operator dashboards.
- Fix: Runbook environment table and deployment checklist updated to mark `TELEMETRY_SINK` as required on both processes in split mode.

## 2026-02-17

- Status: Open
- Title: Verification intentionally paused during intake redesign
- Details: Automated test execution was intentionally paused per user direction ("put a pause on all testing..do more logging"). Current branch includes behavior/UI changes that have not been re-verified by running client/server test suites in this session.
- Impact: Potential regressions may exist until tests are resumed and failures are resolved.
- Suggested follow-up:
  - run `npm run test --prefix server`
  - run `npm run test --prefix client`
  - run `npm run build --prefix client`

- Status: Open
- Title: Runtime capability toggles are process-memory only
- Details: `PATCH /api/capabilities` updates in-memory runtime overrides. A server restart restores values from `server/.env` defaults.
- Impact: UI toggles are immediate but not persistent across restarts.
- Suggested follow-up:
  - persist runtime overrides to disk or database
  - add auth/role checks before allowing flag mutation in production

- Status: Open
- Title: Telemetry endpoints are unauthenticated; persistence is now configurable
- Details: `/api/telemetry` and `/api/telemetry/stream` remain open to any API client. Telemetry persistence now supports `TELEMETRY_SINK=mongo` (alias `mongodb`) for cross-process history/streaming, but retention/security controls are still minimal.
- Impact: Split-runtime visibility is improved, but production deployments still need auth and tighter data-governance controls.
- Suggested follow-up:
  - enforce auth/role checks for telemetry endpoints
  - define retention policy and caps for `TelemetryEvent` collection beyond TTL default
  - add redaction rules for sensitive fields in telemetry metadata

- Status: Open
- Title: X extraction depends on manual challenge/login completion in persistent browser profile
- Details: X can present Cloudflare or auth gates. The worker now fails faster when detected and enforces extraction timeout, but successful extraction still depends on user completing the challenge/login in the Playwright persistent profile when required.
- Impact: Expected behavior for restricted/challenged X content; failures are now explicit and traceable but may still require human intervention.
- Suggested follow-up:
  - run `npm run auth:bootstrap --prefix server` to refresh profile/login session
  - keep `PLAYWRIGHT_HEADLESS=false` for visible manual solve when needed
