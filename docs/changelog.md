# Changelog

## 2026-02-17

- Added server-side platform feature flags: `ENABLE_X` and `ENABLE_TIKTOK`.
- Added `GET /api/capabilities` for frontend capability discovery.
- Split URL handling to detect platform explicitly (`x` vs `tiktok`) before job creation/update.
- Enforced platform-disabled checks on `POST /api/jobs` and `PATCH /api/jobs/:id`.
- Added `PLATFORM_DISABLED` API error code for disabled-site submissions.
- Updated intake UI:
  - icon-only Paste/Go action inside the input shell,
  - removed low-value intake tagline,
  - converted source pills into explicit enabled/disabled status chips.
- Added richer intake logging for capability load, URL classification, clipboard behavior, and submit outcomes.
- Refined intake motion to feel less forced: reduced whole-card movement, softer hover/focus transitions, and subtler success pulse.
- Enlarged inline paste/send action to near input height and width for stronger input-action connection.
- Enabled automatic focus + text selection on the intake input when dashboard loads.
- Expanded README with a concrete env-flag request/response walkthrough.
- Added `PATCH /api/capabilities` so frontend/admin UI can toggle X/TikTok availability at runtime while server enforcement remains authoritative.
- Updated intake chips to compact labels (`X.com`, `TikTok`) with bright status dots and clickable toggle behavior.
- Reduced chip size and removed `enabled` wording per UI pass; state now communicates via color/dot + tooltip.
- Adjusted the inline paste/send button to be hard-aligned to the input shell edge (minimal top/bottom/right gap).
- Added structured telemetry pipeline with in-memory history and SSE streaming:
  - `GET /api/telemetry`
  - `GET /api/telemetry/stream`
- Added request/worker correlation IDs (`traceId`) so intake request logs can be followed through queue, extraction, download, and final save.
- Added deep stage-level logging across extractor/downloader/worker with durations, byte counts, status codes, and artifact paths.
- Added "Live Pipeline Logs" card in the frontend that streams telemetry in near real time.
- Improved X challenge detection (`Just a moment`, browser check interstitials) to avoid silent hangs and surface actionable challenge-required failures.
- Added extraction hard timeout support via `EXTRACTION_TIMEOUT_MS` (default `180000ms`) to prevent jobs from remaining in `running` indefinitely.
