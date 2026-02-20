# Platforms Domain

> **Owner**: platforms-steward agent | **Skill**: /platforms-work | **Team**: platforms-team

The pluggable platform definitions layer. Each supported social media platform (X, TikTok) has a self-contained definition module that declares host patterns, URL validation, handle extraction, media host detection, CDN download headers, and platform-specific behavior flags. Platform definitions are pure data modules with zero external dependencies. Adding a new platform means creating a new directory here -- nothing else in the codebase architecture changes.

## Boundary

This domain owns all files under `server/src/platforms/`. No agent outside the platforms-team may create, modify, or delete files in this directory.

## File Inventory

| File | Purpose |
|------|---------|
| `x/index.js` | X (Twitter) platform definition: hosts (`x.com`, `twitter.com`), URL validation (`/<handle>/status/<id>`), handle extraction, media host detection (twimg.com CDN), referer (`https://x.com/`), no 403 refresh, auth wall blocking enabled, no media path patterns. 67 lines. |
| `tiktok/index.js` | TikTok platform definition: hosts (`tiktok.com`, `m.tiktok.com`), short hosts (`vm.tiktok.com`, `vt.tiktok.com`), URL validation (`/@handle/video/<id>`), short URL validation, handle extraction, media host detection (byteoversea, snssdk, ibyteimg, ibytedtos, muscdn, musical.ly CDNs), download headers (origin, sec-fetch-*), referer (`https://www.tiktok.com/`), 403 refresh enabled, auth wall blocking disabled, media path patterns for browser interception. 93 lines. |

**File count:** 2 source files across 2 directories.

**Future files:** Each new platform gets `server/src/platforms/<name>/index.js`.

## Architecture

### Platform Definition Shape
Every platform module exports a single object conforming to this exact interface:

```javascript
module.exports = {
  id: string,                // Unique platform identifier ('x', 'tiktok')
  label: string,             // Human-readable name ('X', 'TikTok')
  envFlag: string,           // Environment variable name ('ENABLE_X', 'ENABLE_TIKTOK')
  hosts: Set<string>,        // Canonical hostnames
  shortHosts: Set<string>,   // Short-link hostnames (empty Set if none)
  validateUrl: (parsed: URL) => boolean,       // Validates canonical post URL structure
  validateShortUrl?: (parsed: URL) => boolean, // Validates short URL (optional)
  extractHandle: (parsed: URL) => string,      // Extracts @handle from URL
  isMediaHost: (hostname: string) => boolean,  // Identifies CDN hostnames
  downloadHeaders: object,   // Extra HTTP headers for CDN requests
  referer: string,           // Referer header value for CDN requests
  needs403Refresh: boolean,  // Whether to re-extract on 403 download error
  authWallBlocks: boolean,   // Whether login-wall text is a hard auth error
  mediaPathPatterns: RegExp[], // URL path patterns for browser network interception
}
```

### Platform Behavior Differences

| Behavior | X | TikTok |
|----------|---|--------|
| Short links | None | `vm.tiktok.com`, `vt.tiktok.com` |
| 403 refresh | No | Yes (CDN URLs expire quickly) |
| Auth wall blocking | Yes (login restricts posts) | No (login UI visible on public videos) |
| Download headers | None | Origin + sec-fetch-* headers |
| Media path patterns | None | `/video/tos/`, `/aweme/v1/play/`, `/obj/tos*/` |
| CDN detection | `.twimg.com` suffix | Multiple CDN hostnames (byteoversea, snssdk, etc.) |

### Zero Dependencies
Platform definitions import nothing -- no Core, no API, no Worker, no Services modules. They are pure data. This is by design: platforms are the foundational data layer that everything else reads through the Core registry.

## Dependencies (What We Import)

**None.** Platform definitions have zero external dependencies.

## Consumers (Who Imports Us)

| Consumer Domain | Module | What They Use |
|-----------------|--------|---------------|
| core | `core/platforms/registry.js` | Entire platform definition objects via `require('../../platforms/x')` and `require('../../platforms/tiktok')` |

**Critical path:** Platforms are consumed ONLY by the Core registry. No other domain imports from `server/src/platforms/` directly. The Core registry re-exports platform capabilities to all consumers via functions like `resolvePlatform`, `resolvePlatformByMediaHost`, `getAuthBlockingHosts`, `getAllMediaPathPatterns`, and `platformNeeds403Refresh`.

## Interface Contract

**Public exports (consumed by Core registry):**

Each `<platform>/index.js` exports the full platform definition object described above.

**Contract rule:** Every platform module MUST export this exact shape. The Core registry iterates over all platforms at startup and builds lookup maps. Missing fields cause runtime errors in the registry, downloader, or extractor. The `hosts` and `shortHosts` fields MUST be `Set` objects. The `mediaPathPatterns` field MUST be an array of `RegExp` objects (empty array if none).

## Change Protocol

1. All changes to this domain MUST go through the platforms-steward agent
2. Adding a new platform:
   a. Create `server/src/platforms/<name>/index.js` following the X/TikTok template
   b. Notify Core steward to register in `core/platforms/registry.js`
   c. Add `ENABLE_<NAME>=true` to `server/.env.example`
   d. Notify client team to add hosts to intake classifier (`client/src/features/intake/useIntake.js`)
3. Changing host sets: notify Core steward (registry rebuilds lookup maps at startup)
4. Changing `needs403Refresh` or `authWallBlocks`: notify Worker and Services stewards
5. Changing `downloadHeaders` or `referer`: notify Services steward (downloader uses these)
6. Changing `mediaPathPatterns`: notify Services steward (playwright-adapter uses these)
7. After any change, update this CLAUDE.md

## Domain Rules

- **NEVER import from other domains** -- platforms must remain pure data modules with zero dependencies
- **Every platform module MUST export the complete interface shape** -- no partial exports
- **Use `Set` for hosts and shortHosts** -- the Core registry relies on Set iteration
- **Use `RegExp` for mediaPathPatterns** -- the playwright-adapter tests patterns against URLs
- **`extractHandle` must return `@`-prefixed handle or empty string** -- consumers expect this format
- **`validateUrl` receives a pre-parsed `URL` object** -- do not re-parse inside the function
- **`isMediaHost` receives a lowercase, www-stripped hostname** -- do not normalize inside the function

## Common Mistakes

- Exporting hosts as an Array instead of a Set -- Core registry iterates with `for...of`
- Forgetting `validateShortUrl` when the platform has short links -- defaults to pathname length check
- Setting `authWallBlocks: true` for platforms that show login UI on public content (TikTok) -- causes false positive extraction failures
- Not including all CDN hostname patterns in `isMediaHost` -- causes missing download headers
- Leaving `mediaPathPatterns` as `undefined` instead of `[]` -- causes TypeError in `flatMap`

## Testing

Platform definitions are tested indirectly through:

| Test File | Covers |
|-----------|--------|
| `server/test/routes/domain-id-assignment.test.js` | Platform resolution via registry |
| `server/test/services/extractor-quality-selection.test.js` | Media host detection patterns |

Platform modules themselves are pure data and can be unit tested by verifying the exported shape:

```javascript
const platform = require('../platforms/x');
assert(platform.hosts instanceof Set);
assert(typeof platform.validateUrl === 'function');
assert(typeof platform.isMediaHost === 'function');
```

Note: Test scripts are currently disabled in package.json. Tests can be run directly with Jest.
