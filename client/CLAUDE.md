# client/ — Context for Agents

## Architecture
- `main.jsx` — React 19 StrictMode entry point
- `App.jsx` — Central component, no router (hash-based navigation if needed)
- `src/components/` — UI components (see components/CLAUDE.md)
- `src/hooks/` — Custom hooks (useJobsPolling, useReducedMotion)
- `src/index.css` — Global styles
- `vite.config.js` — Vite 7 config, proxies `/api/*` to `localhost:4000`

## State Management Rules
- No Redux, no Zustand, no state library — React state + hooks only
- `useState` / `useReducer` at the component level
- Shared state lives in the top-level component (App.jsx or JobsPage)
- Polling pattern: `useJobsPolling` hook fetches `GET /api/jobs` every 3s
- Optimistic UI: deletions use `hiddenJobIds` set to hide items before next poll confirms removal

## API Communication Pattern
```javascript
// All API calls go through /api/* which Vite proxies to :4000
const res = await fetch('/api/jobs', { method: 'POST', ... })
const data = await res.json()
if (!data.ok) {
  // Show error to user — data.error has the message, data.code has the error code
}
```

## Animation Rules
- Framer Motion for all animations
- ALWAYS check `useReducedMotion()` — skip or reduce animations when true
- Animations serve communication (progress, transitions, feedback), not decoration
- Layout animations for list reordering (AnimatePresence + layoutId)

## Polling Safety
- `useJobsPolling` uses `useRef` for the interval to prevent stale closures
- Clear interval on unmount
- Skip poll if a previous poll is still in-flight (prevent request stacking)
- Poll immediately on mount, then every 3s

## When Editing App.jsx / JobsPage
- JobsPage is the central component — URL submission, job list, status display
- No prop drilling for deeply nested state — lift to JobsPage level
- Framer Motion AnimatePresence wraps the job list for enter/exit animations

## Build & Dev
- `npm run dev` — Vite dev server on :5173, proxies /api to :4000
- `npm run build` — Production build to dist/
- `npm run lint` — ESLint
- Hash routing: use `window.location.hash` if multi-page needed, not react-router
