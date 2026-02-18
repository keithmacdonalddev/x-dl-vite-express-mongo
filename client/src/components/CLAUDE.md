# client/src/components/ — Context for Agents

## Structure
```
JobsPage.jsx            — Central dashboard component (201 lines). Composition layer wiring
                          intake + dashboard + activity features together.
ContactProfilePage.jsx  — Per-contact job history view (290 lines). Shows all jobs for a
                          single contact with profile header and media grid.
ConfirmModal.jsx        — Shared confirmation dialog (31 lines). Used for delete/bulk-delete
                          confirmations across the app.
ActivityPanel.jsx       — Re-export stub (1 line). Points to features/activity/ActivityPanel.jsx.
```

Note: Individual job cards, URL input, status badges, and other granular UI components
live in `client/src/features/` (intake, dashboard, activity sub-folders), NOT here.

## Props & State
Components receive props from JobsPage (lifted state). No global state library.
- Job data comes from `useJobsPolling` hook (3s interval GET /api/jobs)
- Optimistic deletions: `hiddenJobIds` Set filters jobs client-side before next poll confirms
- Loading/error states managed at JobsPage level

## API Integration Pattern
```javascript
// Components call API functions, NOT fetch() directly
// Keep fetch calls in hooks or utility modules
const handleSubmit = async (url) => {
  const res = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  })
  const data = await res.json()
  if (!data.ok) showError(data.error)
}
```

## Every Component SHOULD Have
- A loading state (skeleton or spinner while data fetches)
- An empty state (when there's no data to show)
- An error state (when something goes wrong, with retry option)

## Styling Rules
- Use CSS classes, NOT inline `style={{}}` attributes
- Framer Motion `animate` prop is the exception (inline motion values are fine)
- New interactive elements need visible focus styles
- Minimum touch target: 44px for mobile
