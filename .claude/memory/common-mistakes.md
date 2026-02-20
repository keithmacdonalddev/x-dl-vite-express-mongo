# Common Mistakes Checklist

Check these BEFORE launching agents. Each item is a real mistake pattern for Express+Mongoose+Playwright projects.

## Express + Mongoose

- [ ] **Forgetting .lean() on read queries** — Without `.lean()`, Mongoose returns full document instances with change tracking overhead. Use `.lean()` on any query where you don't need to call `.save()` on the result.
- [ ] **Not using atomic findOneAndUpdate for job state transitions** — Reading a document, modifying in JS, then saving creates race conditions. Use `findOneAndUpdate` with conditions (e.g., `{ status: 'pending' }`) to atomically transition state. Return the updated doc with `{ new: true }`.
- [ ] **Missing AbortController timeouts on external fetches** — Every `fetch()` to an external service needs a timeout. Create `AbortController`, set `setTimeout(() => controller.abort(), 30000)`, pass `{ signal: controller.signal }`, clear timeout on completion. Check `err.name === 'AbortError'`.
- [ ] **Not handling MongoDB connection drops gracefully** — Mongoose auto-reconnects, but in-flight operations will fail. Listen for `mongoose.connection.on('disconnected')` and `'reconnected'` events. Queue or retry failed operations. Don't assume the connection is always alive.
- [ ] **Express 5 vs Express 4 async error handling** — Express 5 natively catches rejected promises from async route handlers. Express 4 does NOT — you need `express-async-errors` or manual try/catch. Know which version you're on.
- [ ] **Forgetting separate npm install in client/ vs server/** — Monorepo with separate package.json files means `npm install` in root doesn't install dependencies in subdirectories. Run `npm install` in each directory, or use workspaces.

## Playwright / Browser Automation

- [ ] **Playwright browser context leaks** — Every `browser.newContext()` or `browser.newPage()` must have a corresponding `.close()` in a finally block. Leaked contexts consume memory and can exhaust OS handles. Use try/finally or a context manager pattern.
- [ ] **Not waiting for network idle after navigation** — `page.goto(url)` with default `waitUntil: 'load'` may not wait for async content. Use `waitUntil: 'networkidle'` or explicit `page.waitForSelector()` for SPAs.
- [ ] **Hardcoded timeouts instead of waitFor** — `await page.waitForTimeout(3000)` is flaky. Use `page.waitForSelector()`, `page.waitForResponse()`, or `page.waitForFunction()` instead.
- [ ] **Not handling download/upload dialogs** — Playwright needs explicit `page.on('download')` or `page.on('filechooser')` listeners set up BEFORE triggering the action.

## General

- [ ] **Not validating environment variables at startup** — Check all required env vars exist before starting the server. Fail fast with a clear error message, not a cryptic crash 5 minutes later.
- [ ] **Storing secrets in code or config files** — API keys, tokens, passwords belong in environment variables or a secrets manager, never in committed files.
- [ ] **Missing CORS configuration** — Express doesn't enable CORS by default. If client and server are on different ports (Vite dev server vs Express), you need `cors()` middleware.

## Domain Boundary Violations

- [ ] **API importing from Worker or Services** — API routes must never import from `worker/` or `services/`. API is a thin HTTP layer that imports only from `core/`. If an API route needs to trigger background work, it creates a Job (status: queued) and the Worker picks it up.
- [ ] **Worker importing from API** — Worker must never import from `api/`. Worker reads job documents from the database; it does not call API endpoints.
- [ ] **Services importing Job model** — Services must never import from `core/models/job` or `core/data/job-model`. Services is stateless -- it receives URLs and options, returns results. Job state management belongs to Worker.
- [ ] **Platforms importing anything** — Platform definition files (`platforms/x/index.js`, `platforms/tiktok/index.js`) must have zero `require()` calls to other domains. They are pure data consumed only by Core's registry.
- [ ] **Modifying another domain's files without using the skill gate** — All server changes must go through the domain's skill (/api-work, /worker-work, /services-work, /platforms-work, /core-work). Bypassing the skill gate risks boundary violations, missing CLAUDE.md updates, and failing post-work checks.
- [ ] **Changing Core exports without notifying consumers** — Core is the foundation layer. Every other domain imports from Core. Changing an export signature, model field, or constant value without notifying all consuming domains can break the entire system. Check the "Consumers" section of `core/CLAUDE.md` before any change.
- [ ] **Not updating domain CLAUDE.md after changes** — Every domain's CLAUDE.md is the authoritative documentation. If you add a file, change an export, add a dependency, or modify an interface, update the CLAUDE.md. Stale docs are worse than no docs.
- [ ] **Using stale import paths** — Core has shim files (`constants/job-status`, `middleware/request-limits`, `models/job`) that re-export from canonical sources (`data/job-status`, `http/request-limits`, `data/job-model`). Both paths work, but new code should prefer the canonical paths within Core and the shim paths from outside Core.
