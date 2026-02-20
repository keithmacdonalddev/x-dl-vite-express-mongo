---
name: services-work
description: "Gate access to the Services domain. All changes to server/src/services/ must go through this skill."
user-invocable: true
argument-hint: "<task-description>"
model: sonnet
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash(node *)
  - Bash(npm *)
  - Bash(git *)
  - Bash(netstat *)
---

# Services Domain Work

> **Boundary**: `server/src/services/**`
> **Steward Agent**: `.claude/agents/services-steward.md`
> **Domain Docs**: `server/src/services/CLAUDE.md`

## Pre-Work Checks (MANDATORY)

Before ANY change to this domain:

1. **Read the domain CLAUDE.md**: `server/src/services/CLAUDE.md` -- understand current state, file inventory, dependency map, consumer map
2. **Verify boundary**: Confirm all files you plan to modify are within `server/src/services/`
3. **Check dependencies**: If your change affects exports, identify all consumers from the CLAUDE.md consumer map
4. **Read affected files**: Read every file you plan to modify BEFORE making changes

## Domain Identity

The technical capability layer. Provides browser automation (Playwright), media extraction (URL ranking, quality scoring), and file download (direct fetch, HLS/ffmpeg). Services is **stateless** relative to job state -- it receives URLs and options, returns results. It NEVER imports the Job model or manages job status.

Services is the "neutral technical layer" -- consumed by Worker but depends only on Core.

## Domain Rules

### Statelessness Contract

Services functions are pure technical operations. They:
- Receive URLs, paths, and options as input
- Return result objects (ExtractionResult, DownloadResult)
- NEVER import `Job` model
- NEVER call `job.save()` or manage job status
- NEVER import from `api/` or `worker/`

This ensures Services can be tested independently and reused without coupling to job lifecycle.

### Playwright Singleton Management

The `playwright-adapter.js` manages a **singleton persistent Chromium context**:

- `createPlaywrightPageFactory()` returns a function that creates new pages from the persistent context
- `getPersistentContext()` lazily initializes and returns the shared BrowserContext
- `closePersistentContext()` shuts down the browser -- called ONLY during graceful shutdown
- The browser profile is persisted at `PLAYWRIGHT_USER_DATA_DIR` for cookie/session persistence
- Non-headless is the default (`PLAYWRIGHT_HEADLESS=false`)

**Critical rules:**
- NEVER launch a new browser instance per job -- always reuse the singleton
- NEVER kill browser processes externally -- the adapter manages lifecycle
- ALWAYS close pages in `finally` blocks after use
- Keep pages open for manual CAPTCHA/login solve on auth challenge errors

### Network Interception Patterns

The extractor uses Playwright's network interception to capture media URLs during page navigation:

1. Navigate to the post URL
2. Collect media URLs from intercepted network requests (video files, HLS manifests)
3. Collect image URLs for thumbnails
4. Collect post metadata (author, description, etc.)
5. Pick the best media URL using quality scoring

The page object exposes: `goto()`, `collectMediaUrls()`, `collectImageUrls()`, `collectPostMetadata()`, `close()`.

### Media URL Quality Scoring

`pickMediaUrl()` ranks candidates in priority order:
1. **Direct MP4** (highest) -- scored by: no-watermark > clean > signed > area > bitrate > fps > codec > mime
2. **HLS .m3u8** (medium) -- scored by: area > bitrate
3. **Any valid HTTP URL** (lowest) -- fallback

Key scoring rules:
- Non-watermarked URLs always rank above watermarked
- `bytevc2` codec is penalized (compatibility issues), `avc1` is preferred
- Signed URLs (with expiry params) rank above unsigned
- Higher resolution (width*height area) wins

### Download Strategy Selection

`chooseDownloadMode()` picks the download strategy based on URL:
- URLs ending in `.m3u8` -> HLS mode (ffmpeg)
- Everything else -> Direct mode (fetch stream)

**Download fallback chain for 401/403 responses:**
1. Plain `fetch` with platform-specific headers
2. Authenticated download via Playwright session cookies (`downloadDirectWithPlaywrightSession`)
3. Full browser navigation download (`downloadDirectWithBrowserNavigation`)

### Timeout Guards on All Browser Operations

Every browser operation MUST have an explicit timeout:
- Page navigation: `page.goto(url, { timeout: 30000 })`
- Download events: `context.waitForEvent('download', { timeout: 120000 })`
- Never rely on default timeouts -- always set them explicitly

### Resource Cleanup on Error Paths

Pages MUST be closed in `finally` blocks:

```javascript
try {
  // ... use page
} finally {
  await page.close().catch(() => {});
}
```

Exception: On access challenge errors (AUTH_REQUIRED, BOT_CHALLENGE), keep the page open for manual solve. Set `shouldClosePage = false` before the finally block.

### Platform-Aware Download Headers

`buildDownloadHeaders()` resolves the platform from the media URL host and applies platform-specific headers (referer, origin, sec-fetch-* headers). This is critical for TikTok CDN which rejects requests without proper headers.

### Signed URL Expiry Detection

`isSignedUrlExpired()` checks URL query parameters (`expire`, `x-expires`, `X-Expires`) against current time. Expired URLs are rejected before download to avoid wasting time on dead links.

## File Inventory

| File | Purpose | Key Exports |
|------|---------|-------------|
| `extractor-service.js` | Playwright-based media extraction, URL quality ranking | `{ extractFromTweet, pickMediaUrl, listCandidateMediaUrls, getMediaCandidateFacts }` |
| `downloader-service.js` | Direct fetch, ffmpeg HLS, Playwright auth/browser downloads | `{ downloadMedia, downloadDirect, downloadDirectWithPlaywrightSession, downloadDirectWithBrowserNavigation, isSignedUrlExpired, ... }` |
| `playwright-adapter.js` | Singleton persistent Chromium context management | `{ createPlaywrightPageFactory, getPersistentContext, closePersistentContext }` |

## Data Shapes

### ExtractionResult (returned by extractFromTweet)

```javascript
{
  mediaUrl: string,           // Best candidate media URL
  sourceType: 'direct' | 'hls' | 'unknown',
  candidateUrls: string[],    // All valid candidate URLs (ranked)
  imageUrls: string[],        // Thumbnail/image URLs
  metadata: {
    thumbnailUrl?: string,
    selectedMediaUrl: string,
    selectedMediaType: string,
    selectedMedia: CandidateFacts,
    candidateCount: number,
    candidateSummaries: CandidateFacts[],
    ...postMetadata,
  },
}
```

### DownloadResult (returned by downloadMedia/downloadDirect)

```javascript
{
  outputPath: string,   // Absolute path to saved file
  mode: 'direct' | 'hls',
  bytes: number,        // File size in bytes
  contentType?: string, // Response content-type header
}
```

### CandidateFacts (returned by getMediaCandidateFacts)

```javascript
{
  host: string, isDirect: boolean, isHls: boolean,
  width: number, height: number, area: number,
  br: number, bt: number, fps: number,
  hasWatermark: boolean, isLikelyClean: boolean, isSigned: boolean,
  mimeType: string, codec: string,
}
```

## Dependency Map (I Import From)

| Source | What | Used In |
|--------|------|---------|
| `core/constants/job-status` | `SOURCE_TYPES` | extractor-service |
| `core/lib/logger` | `logger` | extractor-service, downloader-service, playwright-adapter |
| `core/utils/validation` | `isSupportedPostUrl` | extractor-service |
| `core/platforms/registry` | `resolvePlatformByMediaHost`, `getAuthBlockingHosts`, `getAllMediaPathPatterns` | downloader-service, playwright-adapter |

## Consumer Map (Who Imports From Me)

| Consumer | What |
|----------|------|
| `worker/process-job.js` | `extractFromTweet`, `downloadMedia`, `downloadDirect`, `downloadDirectWithPlaywrightSession`, `downloadDirectWithBrowserNavigation`, `isSignedUrlExpired`, `createPlaywrightPageFactory` |
| `core/runtime/start-worker-runtime.js` | `closePersistentContext` (for graceful shutdown) |

## Forbidden Imports

- NEVER import from `api/` -- Services does not handle HTTP requests
- NEVER import from `worker/` -- Services does not manage jobs or the queue
- NEVER import `Job` model -- Services is stateless relative to job state
- NEVER import from `platforms/` directly -- always go through `core/platforms/registry`

## Work Steps

1. Read `server/src/services/CLAUDE.md` for current domain state
2. Read the specific files you need to modify
3. Implement changes following domain rules above
4. Verify no imports from forbidden domains were introduced
5. Verify statelessness -- no Job model imports, no job.save() calls
6. Verify all browser operations have timeout guards
7. Verify all pages are closed in finally blocks
8. Run post-work checks

## Post-Work Checks (MANDATORY)

After ANY change to this domain:

- [ ] Server starts: `node server/src/core/runtime/entrypoints/index.js` (quick startup, Ctrl+C after boot)
- [ ] No imports from `api/`, `worker/`, or `platforms/` directly
- [ ] No `Job` model imports -- Services must be stateless
- [ ] All browser operations have explicit timeout values
- [ ] All pages closed in `finally` blocks (except auth challenge pages)
- [ ] Download functions validate URL before fetching
- [ ] Platform-specific headers applied via `buildDownloadHeaders()`
- [ ] Data shapes match documented ExtractionResult / DownloadResult contracts
- [ ] Interface contract unchanged (or Worker consumer notified)
- [ ] Update `server/src/services/CLAUDE.md` -- file inventory, deps, exports if changed
- [ ] Git commit the domain changes

## Cross-Domain Notification

If your change affects the domain's interface contract (exported function signatures or return shapes):

1. Primary consumer is `worker/process-job.js` (Worker domain)
2. Message the Worker steward agent
3. If changing `closePersistentContext`, also notify Core steward (used in shutdown)
4. If changing ExtractionResult or DownloadResult shapes, Worker code must be updated to handle new shapes

## Common Mistakes to Avoid

- Importing `Job` model -- breaks the statelessness contract
- Forgetting to close pages in finally blocks -- leaks browser memory
- Missing timeout on browser operations -- job hangs forever
- Not checking `isSignedUrlExpired()` before download -- wastes time on dead URLs
- Hardcoding platform headers instead of using `buildDownloadHeaders()` with registry
- Returning inconsistent data shapes -- Worker depends on exact field names
- Not handling the `shouldClosePage = false` case for auth challenges
- Spawning new browser instances instead of using the singleton context

## Forbidden Actions

- NEVER modify files outside `server/src/services/`
- NEVER add imports from undocumented sources without updating CLAUDE.md
- NEVER change an export shape without notifying the Worker steward
- NEVER skip updating the domain CLAUDE.md after changes
- NEVER import or manage Job documents -- that is Worker territory
- NEVER define HTTP routes -- that is API territory
- NEVER launch new browser instances -- use the singleton from playwright-adapter
