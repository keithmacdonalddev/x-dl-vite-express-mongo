# Session Handoff 2026-02-20 Sonnet 4.6 Module Viz Prototype

## 1. Session Identity

- Date: 2026-02-20
- Model: claude-sonnet-4-6
- Session focus: Building and iterating module-map.html visualization prototype
- Prior context: context/2026-02-19_tiktok-watermark-fixes_sonnet-4-5.md

---

## 2. What Was Built This Session

The session centered on module-map.html, a self-contained interactive HTML visualization
of the project module structure, file ownership, and team boundaries.

Key work:
1. Settled on 12 modules: 10 base plus Core Kernel and Process Runtime.
2. Built initial file-tree HTML prototype.
3. Rebuilt into multi-view hub with 11 views: Top-Down, File Map, Sunburst,
   Bubble Map, Dependency Flow, Grid Matrix, Architecture Layers, File Tree,
   Mind Map, Network, Teams.
4. Added scope toggle (Full / Server / Client) to every view.
5. Found three documentation discrepancies:
   - client/src/components/CLAUDE.md had stale file references.
   - agent-teams.md missing server/src/models/ and server/src/platforms/.
   - client/src/lib/contacts.js undocumented in ownership map.
6. Full codebase audit confirmed backend restructure (a9e1940) is complete.
7. Rebuilt prototype with corrected architecture data.
8. Fixed three bugs:
   - Raw HTML leaking as text from inline onclick quote escaping.
     Fixed with tooltip registry system.
   - Server scope showing only 3 nodes (depth too shallow). Increased depth.
   - Connector lines barely visible. Increased stroke opacity.

---

## 3. Current State of module-map.html

File: module-map.html (git root, tracked, self-contained HTML, no build step)

Working correctly:
- All 11 views render
- Scope toggle functional across all views
- Tooltip registry system active (no inline onclick quote escaping)
- Architecture data matches post-restructure layout

Potentially still rough:
- File Map view: node readability at high density and auto-zoom still being tuned.
- Top-Down file-structure flavor: user requested a second Top-Down showing actual
  file paths (not just conceptual modules). Verify if shipped or still needed.

---

## 4. Codebase Architecture (Current Truth)

Backend restructured in a9e1940. Trust git tree not root CLAUDE.md for file locations.
Root CLAUDE.md still shows old flat layout in some sections.

Server layout (post-restructure):

  server/src/
    api/           HTTP route handlers only (own CLAUDE.md)
      routes/
    core/          Subdirs: config, constants, data, dispatch, domain,
                   http, lib, middleware, models, platforms, runtime, utils
      runtime/
        entrypoints/
          index.js     ACTUAL entry point (NOT server/src/index.js)
          app.js
          start-api.js
          start-worker.js
    platforms/     X and TikTok (own CLAUDE.md)
    services/      Extractor, downloader, playwright-adapter, profile-discovery
    worker/        Queue, process-job, recovery (own CLAUDE.md)

CRITICAL: server/src/index.js no longer exists.
Entry is server/src/core/runtime/entrypoints/index.js.

Client layout unchanged:

  client/src/
    App.jsx / App.css
    features/      intake, dashboard, activity
    components/    ContactProfilePage, JobsPage, etc.
    hooks/         useJobsPolling (3s poll)
    api/           jobsApi fetch wrapper
    lib/           contacts.js (needs owner in agent-teams.md)
    platforms/     client-side platform definitions

---

## 5. Rules and Skills Infrastructure (New This Session)

Built in dabdb49 (initial Claude agent infra), extended in 592d431 (PM domain dispatch).

New rules:
- .claude/rules/guardrails.md now includes Domain Dispatch rules 21-26.
- .claude/rules/coding-rules.md now includes Domain Boundaries section rules 27-31.

Domain steward skills (must invoke before any domain work):
- .claude/skills/api-work/       gate for API routes changes
- .claude/skills/core-work/      gate for core kernel changes
- .claude/skills/platforms-work/ gate for platform module changes
- .claude/skills/services-work/  gate for service layer changes
- .claude/skills/worker-work/    gate for worker changes

Other skills: accessibility-audit, add-feature, collect-metrics, confidence-check,
cto-review, debug-issue, firstpass, preflight, purge-context, review-plan,
review-ui, secondpass, security-audit, test-app, visual-verify.

Memory files:
- .claude/memory/design-principles.md (955 lines)
- .claude/memory/sonnet-prompting.md (1277 lines)
- .claude/memory/haiku-prompting.md (319 lines)
- .claude/memory/opus-prompting.md (391 lines)
- .claude/memory/post-run-update-prompt.md
- .claude/memory/team-review-playbook.md

---

## 6. Prototypes Inventory

All in prototypes/. Self-contained HTML. Immutable once committed.

Rounds: alpha (1-3), beta (1-3), gamma (1-3), delta (1-3), epsilon (1-3), zeta (1-3).

Masterwork series (highest fidelity, user selects from these):
- masterwork-3.html  Chronicle (narrative UI, four chapters)
- masterwork-6.html  Chromatic Lens (color-navigation design)
- masterwork-7.html  Slate Workshop (physical material constraint UI)
- masterwork-8.html  Chronoscape (temporal sky UI) -- most recent this session

Also: prototypes/index.html (gallery), prototypes/research-sources.md

---

## 7. Ownership Map (Current Plus Gaps)

Source: .claude/rules/agent-teams.md -- but it has stale paths needing correction.

Domain              | Path                       | Steward skill
--------------------|----------------------------|---------------
API routes          | server/src/api/routes/     | api-work
Core kernel         | server/src/core/           | core-work
Platforms           | server/src/platforms/      | platforms-work
Services            | server/src/services/       | services-work
Worker              | server/src/worker/         | worker-work
Client shell        | client/src/App.jsx+App.css | none yet
Client features     | client/src/features/       | none yet
Client components   | client/src/components/     | none yet
Client lib          | client/src/lib/            | UNASSIGNED

---

## 8. Outstanding Issues

1. module-map.html File Map view: node density readability and auto-zoom not resolved.
2. Top-Down file-structure flavor: verify if shipped or still outstanding.
3. agent-teams.md: update server/src/models/ to server/src/core/models/;
   add client/src/lib/ with an owner.
4. Root CLAUDE.md: correct entry point reference and Key Files server paths.
   Old: server/src/index.js
   Correct: server/src/core/runtime/entrypoints/index.js
   Old server/src/routes/jobs.js etc. no longer exist at those flat paths.
5. profile-discovery-service.js: had active bug fixes in d1437cf and abb900e
   (CAPTCHA handling, discovery trigger placement). Needs functional test.
6. Uncommitted working tree: git status at session start showed M and D files
   including client/src/api/jobsApi.js, server/src/services/ files, server/src/models/job.js.
   Run git status and commit what is ready.

---

## 9. What NOT to Break

1. Server entry: server/src/core/runtime/entrypoints/index.js only.
   Do not create or restore server/src/index.js.
2. Domain steward gates: invoke appropriate skill before any domain work.
3. module-map.html: single self-contained file. Preserve self-containment.
4. Prototype files: immutable once committed. No retroactive edits.
5. Playwright singleton: worker manages lifecycle. Never kill Playwright processes.
6. CommonJS/ESM split: server = require(), client = import. Never mix.
7. No npm workspaces: install in client/ or server/ separately.

---

## 10. User Intent and Working Style

- Accuracy first: caught incorrect module counts (12 vs 15 vs 17).
  Every architectural claim must be verified against git, not CLAUDE.md.
- module-map.html is a live reference tool, not a demo.
  Must stay correct and readable at all times.
- Strict domain ownership is intentional and enforced. Never bypass steward gates.
- Fast iteration: multiple masterworks in one session. Move quickly once direction is set.
- Small frequent commits plus push after every commit (git policy in CLAUDE.md).

---

## 11. Context Files

File                                                       | Contents
-----------------------------------------------------------|--------------------
context/latest_sonnet-4-5.md                               | 2026-02-19 TikTok fixes
context/2026-02-19_tiktok-watermark-fixes_sonnet-4-5.md    | Same timestamped
context/latest_sonnet-4-6.md                               | This session
context/2026-02-20_0130_sonnet-4-6_module-viz-prototype.md  | This file

---

## 12. Key File Paths Quick Reference

Visualization:
  module-map.html  (project root)

Server entry (CHANGED, old path gone):
  server/src/core/runtime/entrypoints/index.js

Domain CLAUDE.md files:
  server/src/api/CLAUDE.md
  server/src/core/CLAUDE.md
  server/src/platforms/CLAUDE.md
  server/src/services/CLAUDE.md
  server/src/worker/CLAUDE.md

Rules:
  .claude/rules/guardrails.md     (domain dispatch rules 21-26)
  .claude/rules/coding-rules.md   (domain boundary rules 27-31)

Steward skills:
  .claude/skills/api-work/
  .claude/skills/core-work/
  .claude/skills/platforms-work/
  .claude/skills/services-work/
  .claude/skills/worker-work/

Design:
  .claude/memory/design-principles.md
  design-principles.md  (root copy)
  docs/plans/2026-02-19-plugin-architecture-design.md
  docs/ownership/folder-responsibility-map.md  (may be stale)

---

## 13. Immediate Next Actions

1. Open module-map.html in a browser. Verify all 11 views with all 3 scope toggles.
   Check File Map view node density. Check if file-structure Top-Down exists.
2. Run git status. Stage and commit ready changes from the working tree.
3. Update .claude/rules/agent-teams.md: fix server/src/models/ to
   server/src/core/models/ and add client/src/lib/ with an owner.
4. Update root CLAUDE.md Key Files table and entry point reference.
5. Before any backend work, invoke the appropriate domain steward skill gate.
