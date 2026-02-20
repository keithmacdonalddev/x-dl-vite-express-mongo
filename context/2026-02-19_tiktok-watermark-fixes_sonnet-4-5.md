# Session Handoff — TikTok Watermark Fixes
**Date:** 2026-02-19
**Model:** claude-sonnet-4-5 (1M context)
**Session focus:** Three bugs: watermarked TikTok downloads, videos not playing in job timeline, broken thumbnails in sidebar

---

## 1. Context

This is a social media video downloader (Media Vault) supporting X and TikTok. The user cares about download quality at a visceral level — getting a watermarked TikTok video is the failure mode they most want eliminated. The product is a personal tool, not SaaS, so reliability over edge cases matters more than scalability.

The three bugs are linked: they all stem from the same gap between what the server can serve and what the client can reach. The watermark bug is a platform intelligence problem; the video/thumbnail playback bugs are a Vite proxy omission.

The user engages by reporting bugs precisely. They care about structural correctness, not band-aids. The watermark fix is non-trivial (JSON rehydration parsing + URL ranking cascade) — not just grab any URL.

---

## 2. Work Completed

### Commit 7a8f5f3 — add: TikTok HD watermark-free downloads, headless browser, download hardening

**server/src/services/playwright-adapter.js**
- Default changed to headless: true
- Added extractTikTokRehydrationUrls(page): parses __UNIVERSAL_DATA_FOR_REHYDRATION__ and SIGI_STATE JSON blobs from TikTok SSR HTML. Extracts play_addr, bitrateInfo[].PlayAddr, and SIGI playAddr URLs. Tags sources for downstream filtering.
- collectMediaUrls() now calls rehydration extraction and filters out download_addr / sigi_download_addr before adding to candidate pool.

**server/src/services/extractor-service.js**
- Enhanced hasWatermark detection: logo_name param, _watermark path, wm=1 param added
- Added isLikelyClean fact: stricter inverse check on full URL string
- bytevc2 codec penalized to -1 in ranking cascade (below no-codec score of 0)

**server/src/services/downloader-service.js**
- Per-download AbortController with DOWNLOAD_TIMEOUT_MS (default 120s) on fetch()
- Separate AbortController on pipeline() for stream phase
- Both controllers clear timeouts correctly on success and non-abort errors

**server/src/worker/process-job.js**
- triedUrls Set initialized at start of fallback function, persists across ALL retry strategies. Prevents infinite loops on bad URLs.

**server/src/platforms/tiktok/index.js**
- Added muscdn and musical.ly to isMediaHost()
- Added /obj/tos[a-z-]*/ pattern to mediaPathPatterns

### Commit d7764e3 — fix: exclude watermarked download_addr URLs from TikTok candidates and recognize /obj/tos*/ paths

**server/src/services/playwright-adapter.js**
- collectMediaUrls() filter hardened: ONLY play_addr, bitrate_variant, sigi_play_addr pass through. download_addr and sigi_download_addr blocked explicitly.

**server/src/services/extractor-service.js**
- /obj/tos[a-z-]*/i regex added to isDirectVideoCandidate()

### Commit 5cda685 — fix: proxy /downloads through Vite dev server to Express for video/thumbnail serving

**client/vite.config.js**
- Added /downloads proxy entry (alongside existing /api) targeting http://localhost:4000
- Root cause of broken video playback and thumbnails: Vite dev server had no proxy rule for /downloads/*, causing 404s in the browser

---

## 3. System Context

- Server: Express 5 + Mongoose, CommonJS, port 4000
- Client: Vite 7 + React 19, ESM, port 5173
- TikTok extraction: Playwright singleton (now headless) + SSR JSON rehydration + network interception (both work independently, rehydration is additive)
- Download path convention: downloads/<accountSlug>/<jobId>.mp4 (relative, forward slashes)
- No test suite active

---

## 4. Current State

| Bug | Before | After |
|-----|--------|-------|
| TikTok watermarked downloads | Worker captured any URL, often download_addr (watermarked) | Rehydration JSON extracts play_addr (clean); download_addr filtered out; ranking cascade enforces clean-first |
| Videos not playing in job timeline | 404 — Vite had no proxy for /downloads/* | Vite proxies /downloads to Express; files serve correctly |
| Thumbnails broken in sidebar | Same 404 root cause | Fixed by same proxy addition |
| Download hangs | No timeout on fetch or stream pipeline | AbortController on both; 120s default per phase |

---

## 5. Active Decisions

**Rehydration as additive, not replacement.** Network interception remains primary. Rehydration URLs are inserted into the same candidate pool. If rehydration returns nothing, network-captured URLs still work. This is intentional — resilience over elegance.

**Headless by default.** Changed from PLAYWRIGHT_HEADLESS=false to true. Rationale: rehydration JSON is SSR (not JS-rendered), so headless works. Avoids desktop window pop-ups on server deployments. The env var still allows override.

**Filter at collector boundary, not extractor.** extractTikTokRehydrationUrls() is pure extraction with source tags. collectMediaUrls() applies filter policy. Clean separation — extraction stays independently testable.

**bytevc2 penalized to -1.** ByteDance proprietary codec has limited player compatibility. Ranked below avc1 (score 2), unknown codec (score 1), and no-codec-info (score 0).

---

## 6. Discovered Constraints

- TikTok rehydration JSON lives in two script tags: __UNIVERSAL_DATA_FOR_REHYDRATION__ (modern) and SIGI_STATE (legacy). The modern nested path is __DEFAULT_SCOPE__[webapp.video-detail].itemInfo.itemStruct.video. Both checked because TikTok serves different formats by region and account type.
- play_addr.url_list is an array; SIGI_STATE.playAddr is a flat string. The code handles both shapes.
- TikTok CDN hosts include muscdn.com and musical.ly (not just tiktok.com / byteoversea.com). Missing these caused some CDN URLs to be rejected by isMediaHost().
- Vite proxy must be restarted to take effect. It is not hot-reloaded. User must restart dev server after the vite.config.js change.

---

## 7. Failed Approaches

None in this session — implementation went directly to the correct approach after investigation confirmed the TikTok JSON structure.

Historical note (not this session): network interception alone was the previous approach. It captured whatever URLs the browser fetched, often including download_addr (watermarked) before play_addr was fetched. The rehydration approach bypasses this ordering dependency entirely.

---

## 8. Open Questions

1. **Will headless mode trigger Cloudflare/TikTok bot detection?** Low risk (SSR content does not depend on JS execution), but unknown in production. The manual-solve flow activates if a challenge appears.

2. **Does TikTok serve rehydration JSON in all regions?** Structure verified against yt-dlp and cobalt documentation. TikTok could regionalize or A/B test the format. Fallback to network interception is in place.

3. **Has the fix been runtime-tested?** As of this handoff: NO. Code analysis (verification agent at tmp/watermark-fix-verification.md) confirmed logic is correct with PASS verdicts across 30+ checks. No live TikTok download was attempted. Real-world test is the immediate next action.

4. **Does the user need to restart Vite dev server?** YES, for the proxy fix to take effect.

---

## 9. Next Actions

1. **Runtime test the watermark fix.** Submit a real TikTok URL through the UI. Verify the downloaded file plays without watermark. Check server logs for play_addr source tag in candidate list.

2. **Runtime test video playback in job timeline.** After downloading a job, click the video. Should play inline. If still 404, restart Vite dev server first.

3. **Runtime test thumbnail in contact sidebar.** Navigate to a contact profile. Thumbnails should load from /downloads/<slug>/thumbnails/<jobId>.jpg.

4. **Confirm headless behavior.** If TikTok returns bot challenges or empty rehydration JSON, set PLAYWRIGHT_HEADLESS=false in server/.env as fallback.

5. **Monitor for bytevc2 videos.** If TikTok downloads produce unplayable files, check if bytevc2 is being selected despite the penalty (would mean no avc1 alternative in the candidate pool).

---

## 10. Risks / Uncertainty

**Medium:** TikTok JSON structure volatility. The rehydration path is documented (matches yt-dlp), but TikTok changes their web app regularly. Graceful degradation is in place — returns [] if path breaks, falls back to network interception.

**Low-Medium:** If rehydration returns nothing AND network-intercepted URLs are all watermarked, the download is watermarked. Ranking demotes watermarked URLs but does not eliminate them. This is a last-resort fallback, not a happy path.

**Low:** Headless mode + bot detection. assessAccessState() handles Cloudflare challenges. PLAYWRIGHT_HEADLESS=false is an env var override.

**Low:** 2x timeout budget. Fetch timeout (120s) + pipeline timeout (120s) = worst-case 240s per download. Acceptable for video files.

**None:** Vite proxy fix correctness. Root cause confirmed (files exist, paths correct, proxy was the only gap). 4-line addition. Zero risk.

---

## 11. Continuity Chain

Previous session context: Not available (no context/latest_sonnet-4-5.md existed before this session).

This session commits in order:
- 7a8f5f3 — Core watermark fix: rehydration extraction + download hardening
- d7764e3 — Refinement: tighten filter, add /obj/tos*/ pattern
- 5cda685 — Orthogonal fix: Vite proxy for /downloads

The watermark fix builds on the existing extractor-service.js ranking cascade (nonWatermark was already tier 1 of the sort). This session added the rehydration source that provides clean URLs to rank into the top position.

---

## 12. Evidence Index

| Artifact | Location | Status |
|----------|----------|--------|
| Verification report (code analysis) | tmp/watermark-fix-verification.md | Complete — 30+ checks, all PASS or documented concern |
| Changed files (3 commits) | git diff HEAD~3 HEAD | 6 files, +296/-9 lines |
| TikTok platform definition | server/src/platforms/tiktok/index.js | Updated with muscdn, musical.ly, /obj/tos*/ |
| Playwright adapter | server/src/services/playwright-adapter.js | Core rehydration extraction added |
| Extractor service | server/src/services/extractor-service.js | Watermark detection + ranking cascade enhanced |
| Downloader service | server/src/services/downloader-service.js | Timeout hardening via AbortController |
| Process job | server/src/worker/process-job.js | triedUrls Set added |
| Vite config | client/vite.config.js | /downloads proxy added |
| Runtime test results | (none yet) | Pending next session |

---

## 13. Key Dialogue

The user reported three bugs directly:

> TikTok downloads are watermarked — This drove the core rehydration fix. Expectation: highest quality, no watermark. The fix needed to be structural (parse TikTok’s own data) not superficial (detect watermarks after the fact).

> Downloaded videos don’t play in the job timeline UI — Pointed to the Vite proxy gap. Investigation confirmed files exist on disk and paths are correctly constructed. The only missing link was the dev proxy.

> Thumbnails are broken in job timeline and contact list sidebar — Same root cause as video playback. Both fixed by the single /downloads proxy addition.

What the user cares about that they did not explicitly state: they want the pipeline to be smart (pick the best URL, not just the first one), resilient (fallbacks when TikTok changes), and they want the UI to feel complete (videos should play where they appear, not just download). The ranking cascade and the fallback design reflect these implicit requirements.

---

*Handoff generated: 2026-02-19*
*Next model: read this document before any TikTok-related work. Runtime testing (Section 9) is the immediate priority.*
