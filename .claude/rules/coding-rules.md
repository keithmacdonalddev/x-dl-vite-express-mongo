# Coding Rules (x-dl)

Critical patterns for the Vite + Express + MongoDB + Playwright stack.

---

## React / Client

1. **No Redux — use component state + polling** — `useJobsPolling` hook with 3s interval for job list updates. No global state management library.
2. **Hash-based routing via window.location.hash** — use `parseHashRoute()` in App.jsx, no react-router. Navigation via `window.location.hash = '/path'`.
3. **Framer Motion animations must respect useReducedMotion()** — wrap animated components with reduced-motion check. Never animate without the guard.
4. **API calls use fetch with consistent error shape** — always check `res.ok`, parse JSON, expect `{ ok: true/false, code?, error? }` shape from server.
5. **Vite proxy forwards /api/* to localhost:4000** — configured in vite.config.js. Never hardcode server URLs in client code.
6. **Monorepo: client/ and server/ have separate package.json** — always `npm install` in the correct directory. Never install client deps in server/ or vice versa.

## Express / Server

7. **Express 5: async route handlers auto-propagate errors** — no need for try/catch + next(err) in async handlers. Express 5 catches rejected promises automatically.
8. **API response contract: `{ ok: true/false, code?, error? }`** — every endpoint returns this shape. `ok: true` for success with data fields alongside. `ok: false` with `error` string for failures.
9. **traceId flows through the entire pipeline** — HTTP request middleware generates `req.traceId` (from `x-trace-id` header or `randomUUID()`). Stored in job doc. Used in worker logs. Returned via `x-trace-id` response header. Passed through SSE telemetry events.
10. **Log all operations via logger** — use structured logging: `logger.info('domain.action', { traceId, ...data })`. Never use bare `console.log`.
11. **Request validation happens in middleware** — `enforceTweetUrlLength`, `jsonBodyParser()`, `handleRequestLimitErrors` are middleware. Route handlers assume valid input.

## MongoDB / Mongoose

12. **Use lean() for read-only queries** — `Model.find().lean()` returns plain objects, skips Mongoose hydration overhead. Only skip lean() when you need document methods.
13. **Atomic findOneAndUpdate for job state transitions** — never read-then-write for status changes. Use `findOneAndUpdate` with filter on current status to prevent race conditions.
14. **Always include { new: true } with findOneAndUpdate** — returns the updated document, not the pre-update version.
15. **Index frequently queried fields** — status, createdAt, contactSlug. Verify with `.explain()` when adding new query patterns.

## Playwright / Worker

16. **Singleton persistent browser context** — reuse a single browser instance across jobs. Never launch a new browser per job.
17. **Non-headless is the default** — Playwright runs with UI visible. Only use headless for CI/testing environments.
18. **Never kill Playwright browser processes** — the worker manages browser lifecycle. External process killing causes orphaned state.
19. **All browser operations need timeout guards** — use Playwright's built-in timeout options. Default page timeout should be explicitly set.
20. **Clean up browser resources on worker shutdown** — close pages and contexts, but keep the browser alive for reuse during normal operation.

## SSE / Telemetry

21. **SSE endpoints must set correct headers** — `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
22. **Always clean up SSE subscriptions on client disconnect** — listen for `req.on('close')`, clear intervals, call unsubscribe.
23. **Heartbeat every 15s on SSE connections** — prevents proxy/load-balancer timeouts.

## General

24. **Server uses CommonJS (require/module.exports)** — `"type": "commonjs"` in server/package.json. Client uses ESM (import/export).
25. **Environment config via dotenv** — sensitive values in .env, never commit. Access via `process.env.KEY`.
26. **Static file serving for downloads** — Express serves `downloads/` directory at `/downloads` path. Assets are served directly, not through API routes.

## Domain Boundaries

27. **API must not import from Worker or Services** — API routes never perform background processing or browser automation. API imports only from Core.
28. **Worker must not import from API** — Worker never defines or accesses HTTP endpoints. Worker imports from Core and Services only.
29. **Services must not import from API or Worker** — Services is a stateless capability layer. It never imports the Job model or manages job status. Services imports only from Core.
30. **Platforms must not import from any domain** — Platform definitions are pure data modules with zero external dependencies. They are consumed only through Core's registry.
31. **Core changes require cross-domain notification** — Core is the foundation layer consumed by all other domains. Any change to a Core export signature or model field must be communicated to all consuming domains before implementation. See each domain's CLAUDE.md for the specific dependency map.
