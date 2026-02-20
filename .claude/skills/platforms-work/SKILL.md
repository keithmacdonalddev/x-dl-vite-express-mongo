---
name: platforms-work
description: "Gate access to the Platforms domain. All changes to server/src/platforms/ must go through this skill."
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

# Platforms Domain Work

> **Boundary**: `server/src/platforms/**`
> **Steward Agent**: `.claude/agents/platforms-steward.md`
> **Domain Docs**: `server/src/platforms/CLAUDE.md`

## Pre-Work Checks (MANDATORY)

Before ANY change to this domain:

1. **Read the domain CLAUDE.md**: `server/src/platforms/CLAUDE.md` -- understand current state, file inventory, dependency map, consumer map
2. **Verify boundary**: Confirm all files you plan to modify are within `server/src/platforms/`
3. **Check the interface contract**: Every platform module MUST export the exact required shape
4. **Read affected files**: Read every file you plan to modify BEFORE making changes

## Domain Identity

The pluggable platform definitions. Each supported social media platform (X, TikTok) has a definition module that declares host patterns, URL validation, media host detection, download headers, and platform-specific behavior flags. Adding a new platform means adding a new directory here -- nothing else in the codebase changes (beyond env config and client intake classifier).

## Domain Rules

### Zero-Dependency Rule

Platform definitions are **pure data modules** with **no external dependencies**. They import nothing from Core, API, Worker, or Services. This is by design -- platforms are the foundational data layer that everything else builds on.

```javascript
// CORRECT: Pure data, no imports
const HOSTS = new Set(['example.com']);
module.exports = { id: 'example', hosts: HOSTS, ... };

// WRONG: Importing from other domains
const { logger } = require('../core/lib/logger'); // FORBIDDEN
```

### Platform Interface Contract (Required Exports)

Every platform module MUST export this exact shape. Missing fields cause runtime errors in the registry, downloader, or extractor.

```javascript
module.exports = {
  // Identity
  id: string,                // Unique platform identifier (e.g., 'x', 'tiktok')
  label: string,             // Human-readable name (e.g., 'X', 'TikTok')
  envFlag: string,           // Environment variable name (e.g., 'ENABLE_X')

  // Host matching
  hosts: Set<string>,        // Canonical hostnames (e.g., {'x.com', 'twitter.com'})
  shortHosts: Set<string>,   // Short-link hostnames (e.g., {'vm.tiktok.com'})

  // URL validation
  validateUrl: (parsed: URL) => boolean,       // Validates a canonical post URL
  validateShortUrl?: (parsed: URL) => boolean, // Validates a short URL (optional)
  extractHandle: (parsed: URL) => string,      // Extracts @handle from URL

  // Media detection
  isMediaHost: (hostname: string) => boolean,  // Identifies CDN hostnames
  mediaPathPatterns: RegExp[],                 // URL path patterns for browser interception

  // Download configuration
  downloadHeaders: object,   // Extra HTTP headers for CDN requests
  referer: string,           // Referer header value for CDN requests

  // Behavior flags
  needs403Refresh: boolean,  // Re-extract on 403 download error
  authWallBlocks: boolean,   // Login-wall text is a hard error
};
```

### Host Pattern Rules

- `hosts` contains canonical domain hostnames (without `www.` prefix)
- `shortHosts` contains URL shortener hostnames that redirect to canonical URLs
- Both must be `Set<string>` instances (not arrays)
- Hostnames are always lowercase
- Do NOT include protocol (`https://`) or paths -- just the hostname

### URL Validation Functions

`validateUrl(parsed)` receives a `URL` object and returns `boolean`:
- Must check pathname structure matches expected post URL format
- For X: `/<handle>/status/<numeric-id>`
- For TikTok: `/@<handle>/video/<numeric-id>`
- Do NOT throw errors -- return `false` for invalid URLs

`validateShortUrl(parsed)` is optional -- defaults to `pathname.length > 1`:
- Only needed if the platform has short-link URLs
- Short links will be resolved to canonical URLs before processing

### Handle Extraction

`extractHandle(parsed)` extracts the user handle from a post URL:
- Return with `@` prefix (e.g., `@username`)
- Return empty string if handle cannot be determined
- Do NOT throw errors

### Media Host Detection

`isMediaHost(hostname)` identifies CDN hostnames for this platform:
- Used during browser network interception to capture media URLs
- Must match all CDN subdomains (e.g., `*.twimg.com` for X)
- Return `true` for any hostname that serves media for this platform
- Do NOT throw errors

### Behavior Flags

- `needs403Refresh`: Set `true` if the platform's CDN URLs expire quickly (TikTok). The worker will re-extract a fresh URL on 403.
- `authWallBlocks`: Set `true` if login-wall text should be treated as a hard error (X). Set `false` if login prompts appear on public content (TikTok).

## How to Add a New Platform (Step by Step)

1. **Create directory**: `server/src/platforms/<name>/`
2. **Create definition**: `server/src/platforms/<name>/index.js` following the interface contract above
3. **Register in Core**: Add `require('../../platforms/<name>')` to `core/platforms/registry.js`
4. **Add env flag**: Add `ENABLE_<NAME>=true` to `server/.env.example`
5. **Add client intake**: Add hosts to `client/src/features/intake/useIntake.js` platform classifier
6. **Update domain CLAUDE.md**: Add the new file to the inventory in `server/src/platforms/CLAUDE.md`
7. **Test**: Verify platform resolves correctly via the registry

**Important**: Steps 3-5 are cross-domain changes. Notify Core steward (step 3) and client team (step 5).

## File Inventory

| File | Purpose | Key Exports |
|------|---------|-------------|
| `x/index.js` | X (Twitter) platform definition | Full platform interface |
| `tiktok/index.js` | TikTok platform definition | Full platform interface |

## Dependency Map (I Import From)

**None.** Platform definitions are pure data modules with zero external dependencies.

## Consumer Map (Who Imports From Me)

| Consumer | What |
|----------|------|
| `core/platforms/registry.js` | Entire platform definition objects via `require('../../platforms/<name>')` |

**Critical path:** Platforms are consumed ONLY by the Core registry. No other domain imports from `server/src/platforms/` directly. The Core registry re-exports platform capabilities to all consumers.

## Work Steps

1. Read `server/src/platforms/CLAUDE.md` for current domain state
2. Read the specific files you need to modify
3. Implement changes following the interface contract exactly
4. Verify zero dependencies -- no imports from any other domain
5. Verify all required fields are exported
6. Run post-work checks

## Post-Work Checks (MANDATORY)

After ANY change to this domain:

- [ ] Server starts: `node server/src/core/runtime/entrypoints/index.js` (quick startup, Ctrl+C after boot)
- [ ] Zero imports from any other domain (no `require` statements except Node.js built-ins)
- [ ] All required interface fields are exported (check against contract above)
- [ ] `hosts` and `shortHosts` are `Set<string>` instances (not arrays)
- [ ] `validateUrl`, `extractHandle`, `isMediaHost` are functions that never throw
- [ ] `downloadHeaders` is a plain object (not null/undefined)
- [ ] `mediaPathPatterns` is an array of RegExp
- [ ] `id` is lowercase, unique across all platforms
- [ ] `envFlag` follows `ENABLE_<UPPERCASE_ID>` convention
- [ ] Interface contract unchanged (or Core registry consumer notified)
- [ ] Update `server/src/platforms/CLAUDE.md` -- file inventory if changed
- [ ] Git commit the domain changes

## Cross-Domain Notification

If your change affects the platform interface:

1. The only consumer is `core/platforms/registry.js` (Core domain)
2. Message the Core steward agent
3. If adding a new platform, Core must update `registry.js` to require it
4. If changing the interface shape, ALL platform definitions must be updated simultaneously
5. If adding new hosts, the client intake classifier must be updated (notify client team)

## Existing Platform Reference

### X (Twitter) -- `x/index.js`
- Hosts: `x.com`, `twitter.com`
- URL pattern: `/<handle>/status/<numeric-id>`
- CDN: `*.twimg.com`, `*.x.com`, `*.twitter.com`
- No short hosts, no 403 refresh, auth wall blocks

### TikTok -- `tiktok/index.js`
- Hosts: `tiktok.com`, `m.tiktok.com`
- Short hosts: `vm.tiktok.com`, `vt.tiktok.com`
- URL pattern: `/@<handle>/video/<numeric-id>`
- CDN: `*tiktok*`, `*byteoversea*`, `*snssdk*`, `*ibyteimg*`, `*ibytedtos*`, `*muscdn*`, `*musical.ly*`
- Needs 403 refresh (CDN URLs expire fast), auth wall does NOT block
- Has `mediaPathPatterns` for browser interception: `/video/tos/`, `/aweme/v1/play/`, `/obj/tos*/`
- Has custom `downloadHeaders` (origin, sec-fetch-*)

## Common Mistakes to Avoid

- Importing modules from other domains -- breaks the zero-dependency rule
- Using arrays instead of Sets for `hosts`/`shortHosts` -- registry uses `.has()` method
- Forgetting to export `mediaPathPatterns` (even if empty array) -- causes undefined errors
- Making validation functions that throw instead of returning false
- Missing `@` prefix in `extractHandle` return value
- Not testing that `isMediaHost` catches all CDN subdomains for the platform
- Adding a new platform without registering it in Core registry

## Forbidden Actions

- NEVER modify files outside `server/src/platforms/`
- NEVER add imports from any other domain (zero-dependency rule)
- NEVER change the interface contract shape without coordinating with Core steward
- NEVER skip updating the domain CLAUDE.md after changes
- NEVER use the platform definition to store runtime state -- platforms are pure data
