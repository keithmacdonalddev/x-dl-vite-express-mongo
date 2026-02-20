# Services Domain

> **Owner**: services-steward agent | **Skill**: /services-work | **Team**: services-team

The technical capability layer. Provides browser automation (Playwright persistent context), media URL extraction (network interception + DOM scraping + quality ranking), and file download (direct fetch, authenticated Playwright session, browser navigation, ffmpeg HLS). Services is stateless relative to job state -- it receives URLs and options, returns results. It never imports the Job model or manages job status.

## Boundary

This domain owns all files under `server/src/services/`. No agent outside the services-team may create, modify, or delete files in this directory.

## File Inventory

| File | Purpose |
|------|---------|
| `extractor-service.js` | Playwright-based media URL extraction: navigates to post URL, intercepts network responses for video/image URLs, scrapes DOM for TikTok rehydration data, ranks candidates by quality (resolution, bitrate, watermark, codec). Exports `{ extractFromTweet, pickMediaUrl, listCandidateMediaUrls, getMediaCandidateFacts }`. ~454 lines. |
| `downloader-service.js` | Media download: direct HTTP fetch with stream pipeline, ffmpeg HLS download, Playwright-authenticated download (cookies), browser navigation download (full TLS fingerprint). Includes signed URL expiry detection. Exports `{ isAuthBlockedStatus, isSignedUrlExpired, chooseDownloadMode, downloadDirect, downloadDirectWithPlaywrightSession, downloadDirectWithBrowserNavigation, downloadHlsWithFfmpeg, downloadMedia }`. ~571 lines. |
| `playwright-adapter.js` | Singleton persistent Chromium context management: launch with recovery, page factory (creates pages with network interception for media/image URLs), access state assessment (bot challenge, auth wall), manual solve polling, TikTok rehydration URL extraction. Exports `{ createPlaywrightPageFactory, getPersistentContext, closePersistentContext, getAdapterConfig, assessAccessState, extractTikTokRehydrationUrls }`. ~700 lines. |
| `profile-discovery-service.js` | TikTok profile discovery: scrapes a user's profile page for video posts, deduplicates against existing Jobs and DiscoveredPosts, creates DiscoveredPost documents, downloads thumbnails. **Exception to statelessness rule**: imports `Job` model for deduplication queries (read-only `distinct()`) and `DiscoveredPost` model for persistence. Exports `{ triggerProfileDiscovery, scrapeProfileVideos, extractHandleFromTikTokUrl }`. ~255 lines. |

**File count:** 4 source files in 1 directory.

## Architecture

### Extraction Flow
```
extractFromTweet(tweetUrl, { pageFactory, telemetryContext })
  -> pageFactory() creates Playwright page with network interception
  -> page.goto(tweetUrl) navigates with domcontentloaded + settle wait
  -> waitForManualSolveIfNeeded() checks for bot challenge / auth wall
  -> page.collectMediaUrls() returns network-intercepted + DOM-scraped video URLs
  -> page.collectImageUrls() returns intercepted image URLs
  -> page.collectPostMetadata() reads meta tags (og:*, twitter:*, author, etc.)
  -> pickMediaUrl(mediaUrls) ranks candidates: direct MP4 > HLS, scored by:
       1. Non-watermarked preference
       2. Clean URL preference (no watermark params)
       3. Signed URL preference
       4. Resolution area (width * height)
       5. Bitrate (br, bt)
       6. FPS
       7. Codec preference (avc1 > h265 > vp9, bytevc2 deprioritized)
       8. MIME type preference (video_mp4 > video_*)
  -> Returns { mediaUrl, sourceType, candidateUrls, imageUrls, metadata }
```

### Download Strategies
```
downloadMedia(mediaUrl, { targetPath, telemetryContext })
  -> chooseDownloadMode(mediaUrl): 'hls' if .m3u8, else 'direct'
  -> HLS: downloadHlsWithFfmpeg (spawns ffmpeg -y -i url -c copy targetPath)
  -> Direct: downloadDirect:
       1. Check isSignedUrlExpired -> throw if expired
       2. fetch(mediaUrl) with platform-specific headers
       3. On 401/403: fallback to downloadDirectWithPlaywrightSession
       4. On Playwright auth failure: fallback to downloadDirectWithBrowserNavigation
       5. Stream pipeline to file, return { outputPath, mode, bytes, contentType }
```

### Playwright Singleton
- `getPersistentContext()` returns a shared promise for one `chromium.launchPersistentContext`
- Automatic recovery: if launch fails with "browser closed" error, clears singleton lock files and retries
- Browser close event resets the promise, allowing automatic relaunch on next usage
- `createPlaywrightPageFactory()` wraps pages with network interception listeners
- Page factory returns an object with `goto`, `collectMediaUrls`, `collectImageUrls`, `collectPostMetadata`, `close`

### Access State Detection
- `assessAccessState()` checks page content for bot challenges (Cloudflare, captcha) and auth walls
- Auth wall blocking is platform-specific: only platforms with `authWallBlocks: true` (X) trigger auth errors
- `waitForManualSolveIfNeeded()` polls for manual solve completion with configurable timeout

### TikTok Rehydration
- `extractTikTokRehydrationUrls(page)` scrapes `__UNIVERSAL_DATA_FOR_REHYDRATION__` and `SIGI_STATE` script tags
- Extracts `play_addr` (non-watermarked) and `bitrateInfo` (quality variants)
- Excludes `download_addr` and `sigi_download_addr` (watermarked)

## Dependencies (What We Import)

| Source Domain | Module | What We Use |
|---------------|--------|-------------|
| core | `core/constants/job-status` | `SOURCE_TYPES` (in extractor-service.js) |
| core | `core/lib/logger` | `logger` structured logging (all 3 files) |
| core | `core/utils/validation` | `isSupportedPostUrl` (in extractor-service.js) |
| core | `core/platforms/registry` | `resolvePlatformByMediaHost` (downloader), `getAuthBlockingHosts`, `getAllMediaPathPatterns` (playwright-adapter) |
| core | `core/data/discovered-post-model` | `DiscoveredPost` model (profile-discovery-service) |
| core | `core/models/job` | `Job` model -- read-only `distinct()` for dedup (profile-discovery-service) |
| core | `core/utils/account-profile` | `sanitizeAccountSlug` (profile-discovery-service) |

**Critical observation:** Services does NOT import from Worker or API. It depends only on Core. The `profile-discovery-service.js` file is a controlled exception to the strict statelessness rule -- it uses `Job` model for read-only deduplication, never for status transitions.

## Consumers (Who Imports Us)

| Consumer Domain | Module | What They Use |
|-----------------|--------|---------------|
| worker | `worker/process-job.js` | `extractFromTweet`, `downloadMedia`, `downloadDirect`, `downloadDirectWithPlaywrightSession`, `downloadDirectWithBrowserNavigation`, `isSignedUrlExpired` (from downloader), `createPlaywrightPageFactory` (from adapter) |
| core | `core/runtime/start-worker-runtime.js` | `closePersistentContext` (from adapter, for shutdown) |
| core | `core/runtime/entrypoints/index.js` | `closePersistentContext` (for monolithic shutdown) |
| api | `api/routes/jobs.js` | `triggerProfileDiscovery` (fire-and-forget after job creation) |
| api | `api/routes/discovery.js` | `triggerProfileDiscovery` (manual refresh endpoint) |

**Note:** Worker and Core runtime consume the extraction/download services. API consumes only `triggerProfileDiscovery` from `profile-discovery-service.js` for fire-and-forget profile scraping.

## Interface Contract

**Public exports:**

```javascript
// extractor-service.js
module.exports = {
  extractFromTweet,        // async (tweetUrl, { pageFactory, telemetryContext }) => ExtractionResult
  pickMediaUrl,            // (urls: string[]) => { mediaUrl, sourceType, candidateUrls }
  listCandidateMediaUrls,  // (urls: string[]) => string[]
  getMediaCandidateFacts,  // (url: string) => CandidateFacts
}

// downloader-service.js
module.exports = {
  isAuthBlockedStatus,                   // (status: number) => boolean
  isSignedUrlExpired,                    // (url: string, nowMs?: number) => boolean
  chooseDownloadMode,                    // (url: string) => 'hls' | 'direct'
  downloadDirect,                        // async (url, opts) => DownloadResult
  downloadDirectWithPlaywrightSession,   // async (url, opts) => DownloadResult
  downloadDirectWithBrowserNavigation,   // async (url, opts) => DownloadResult
  downloadHlsWithFfmpeg,                 // (url, opts) => Promise<DownloadResult>
  downloadMedia,                         // async (url, opts) => DownloadResult
}

// playwright-adapter.js
module.exports = {
  createPlaywrightPageFactory, // (options?) => async () => PageWrapper
  getPersistentContext,        // async (options?) => BrowserContext
  closePersistentContext,      // async () => void
  getAdapterConfig,            // (input?) => AdapterConfig
  assessAccessState,           // ({ title, visibleText, content, finalUrl }) => string
  extractTikTokRehydrationUrls, // async (page) => Array<{ url, source }>
}

// profile-discovery-service.js
module.exports = {
  triggerProfileDiscovery,     // async ({ tweetUrl, accountSlug, traceId }) => void
  scrapeProfileVideos,         // async (handle, { traceId }) => Array<{ postUrl, canonicalUrl, thumbnailUrl, title, videoId }>
  extractHandleFromTikTokUrl,  // (tweetUrl: string) => string
}
```

**Data shapes:**

```javascript
// ExtractionResult
{
  mediaUrl: string,
  sourceType: 'direct' | 'hls' | 'unknown',
  candidateUrls: string[],
  imageUrls: string[],
  metadata: {
    title, description, author, thumbnailUrl, canonicalUrl, pageUrl,
    siteName, locale, publishedAt, videoWidth, videoHeight, durationSeconds,
    keywords, twitterCreator, twitterSite,
    selectedMediaUrl, selectedMediaType, selectedMedia, candidateCount, candidateSummaries
  },
}

// DownloadResult
{
  outputPath: string,
  mode: 'direct' | 'hls',
  bytes: number,
  contentType?: string,
}

// CandidateFacts
{
  host, isDirect, isHls, width, height, area, br, bt, fps,
  hasWatermark, isLikelyClean, isSigned, mimeType, codec,
}
```

**Contract rules:**
- Services MUST be stateless relative to job state -- no `job.save()` calls for status transitions
- **Exception:** `profile-discovery-service.js` imports `Job` model for read-only deduplication (`Job.distinct('canonicalUrl', ...)`) and `DiscoveredPost` model for persistence. This is a controlled exception -- it never modifies Job documents or manages job status.
- Services MUST NOT import from `api/` or `worker/`
- All functions accept a `telemetryContext` object for traceId propagation
- Download functions accept dependency injection params (`fetchImpl`, `spawnImpl`, `getPersistentContextImpl`) for testability

## Change Protocol

1. All changes to this domain MUST go through the services-steward agent
2. Changes to `ExtractionResult` or `DownloadResult` shapes: notify Worker steward (consumer)
3. Changes to Playwright adapter lifecycle: notify Core steward (shutdown integration)
4. New download strategies: update this inventory and notify Worker steward
5. Platform-specific extraction changes (TikTok rehydration): coordinate with Platforms steward
6. After any change, update this CLAUDE.md

## Domain Rules

- **Do not import `Job` model or manage job status** except in `profile-discovery-service.js` which uses read-only `Job.distinct()` for deduplication. No other Services file may import the Job model.
- **NEVER import from `api/` or `worker/`** -- Services is consumed, not a consumer
- **Always close Playwright pages in finally blocks** -- leaked pages exhaust browser memory
- **Always include telemetryContext in log calls** -- enables end-to-end tracing
- **Timeout all page operations** using Playwright's built-in timeout options
- **Use dependency injection** for external dependencies (fetch, spawn, getPersistentContext) to enable testing
- **Platform-specific logic** (headers, referer, media host detection) should use Core's platform registry, not hardcoded values
- **Validate media URLs** before download -- check signed URL expiry, validate HTTP scheme

## Common Mistakes

- Not closing Playwright pages on error paths -- causes memory leaks
- Hardcoding platform-specific headers instead of using `resolvePlatformByMediaHost`
- Not checking `isSignedUrlExpired` before attempting download of a previously extracted URL
- Forgetting to set `acceptDownloads: true` on browser context launch
- Not handling the case where `page.content()` throws (page may have navigated away)
- Using `response.body` without checking `response.ok` first
- Not clearing download timeouts on success/error paths (causes AbortError later)

## Testing

Tests are located in `server/test/services/`:

| Test File | Covers |
|-----------|--------|
| `server/test/services/downloader-fallback.test.js` | Download fallback chain (direct -> auth -> browser nav) |
| `server/test/services/extractor-quality-selection.test.js` | Media URL quality ranking and selection |

Run tests: `cd server && npx jest test/services/`

Note: Test scripts are currently disabled in package.json. Tests can be run directly with Jest.
