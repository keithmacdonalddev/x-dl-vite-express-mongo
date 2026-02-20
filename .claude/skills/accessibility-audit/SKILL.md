---
name: accessibility-audit
description: Comprehensive accessibility audit using agent-browser for keyboard navigation, ARIA verification, and focus management. Runs in an isolated fork.
context: fork
agent: general-purpose
allowed-tools: Read Grep Glob Bash(agent-browser *) Bash(netstat *)
---

# Accessibility Audit

Systematic accessibility review combining live browser testing with code analysis.

## Step 1: Open the App

```bash
agent-browser open http://localhost:5173
```

If the app doesn't load, stop and report that the dev server isn't running.

## Step 2: Keyboard Navigation Audit

### Main Page
```bash
agent-browser snapshot
agent-browser press Tab
```

Repeat Tab presses through the entire page. For EVERY interactive element, record:

| Element | Receives Focus | Focus Ring Visible | Activates on Enter/Space | Tab Order Logical |
|---------|---------------|-------------------|-------------------------|-------------------|
| ... | yes/no | yes/no | yes/no | yes/no |

Screenshot any missing focus rings:
```bash
agent-browser screenshot ./a11y-evidence/main-focus.png
```

### Modal/Dialog Views (if any)
Open any modal, verify focus is trapped inside:
```bash
agent-browser press Tab
```
Tab should cycle within the modal, never escape to background content.

## Step 3: ARIA Verification

Run snapshot on each major view to inspect the accessibility tree:

```bash
agent-browser snapshot
```

### Required ARIA Attributes
Check for presence and correctness of:

- **Form inputs**: `aria-label` or associated `<label>` for URL input
- **Status indicators**: `aria-live="polite"` for job status updates
- **Progress**: `role="progressbar"` with `aria-valuenow` for download progress
- **Buttons**: Proper button elements (not clickable divs)
- **Job list**: Proper list semantics
- **Error messages**: `role="alert"` or `aria-live="assertive"`
- **Loading states**: `aria-busy="true"` during loading

### Enumerate Every Instance
For each missing ARIA attribute, list:
- Element selector or description
- File and line number where it's defined
- What attribute is needed
- Fix code

## Step 4: Semantic HTML Audit

Read component source files and check:

- [ ] Clickable `<div>` elements that should be `<button>` — enumerate ALL
- [ ] `<div>` used for lists that should be `<ul>/<ol>`
- [ ] Missing `<main>`, `<nav>`, `<header>` landmarks
- [ ] Headings skip levels (e.g., h1 -> h3 with no h2)
- [ ] Images/icons missing alt text or aria-label
- [ ] Form inputs missing associated labels

## Step 5: Color and Contrast

Read client CSS files and check:

- [ ] Text colors meet WCAG AA contrast ratios (4.5:1 for normal text)
- [ ] Status colors used alone without text labels
- [ ] Disabled states distinguishable from enabled

Use agent-browser to verify computed styles:
```bash
agent-browser get styles @element color
agent-browser get styles @element background-color
```

## Step 6: Motion and Animation

Read client CSS/component files for:

- [ ] Framer Motion respects `useReducedMotion()` hook
- [ ] CSS animations have `@media (prefers-reduced-motion: reduce)` applied
- [ ] No auto-playing animations that could cause seizures

## Step 7: Screen Reader Compatibility

From the snapshots collected in Step 3, verify:

- Page has a meaningful `<title>`
- Main content area has `<main>` element
- Dynamic content changes announced via `aria-live` regions
- Error messages associated with their form fields

## Report Format

```markdown
# Accessibility Audit Report

## Keyboard Navigation
(Per-page table of focus behavior — with screenshot evidence)

## Missing ARIA Attributes
(Enumerated list with file:line, required attribute, fix code)

## Semantic HTML Issues
(Clickable divs, missing landmarks, heading hierarchy)

## Color/Contrast Issues
(Specific values that fail WCAG AA)

## Motion/Animation
(prefers-reduced-motion status, problematic animations)

## Positive Findings
(What's already accessible — preserve these)

## Prioritized Fixes
(Ordered by impact, with effort estimates)

## Summary Statistics
- Interactive elements audited: N
- Elements with proper focus: N/M (X%)
- Missing ARIA attributes: N
- Semantic HTML violations: N
- Contrast failures: N
```
