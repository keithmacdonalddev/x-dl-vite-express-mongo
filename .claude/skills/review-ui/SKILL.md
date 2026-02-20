---
name: review-ui
description: Perform comprehensive UI/UX review of the web app including product experience analysis, design compliance, and accessibility audit. Use for design compliance checks, accessibility audits, and product enhancement discovery.
allowed-tools: Read Grep Glob Bash(agent-browser *) Bash(netstat *) Bash(tasklist *)
context: fork
agent: general-purpose
---

# Review UI

Comprehensive UI/UX review with two required lenses:
- **Product experience**: How does the app feel? What's confusing? What could be better?
- **Verification**: Is everything working correctly? What's broken?

## Step 1: Open the App

```bash
agent-browser open http://localhost:5173
```

If the app doesn't load, stop and report that the dev server isn't running.

## Step 2: Product Experience (do this FIRST)

Use the app as a first-time user. Don't read any code yet.

Navigate every major flow:
```bash
agent-browser snapshot
agent-browser screenshot ./review-evidence/01-initial-load.png
```

For each page/view:
- What's your first impression? Is the purpose clear?
- How many clicks to reach common actions?
- Does the visual hierarchy guide your attention?
- What feedback do you get during loading, errors, empty states?
- What's confusing or missing?
- What would delight a user? What would frustrate them?

Click through every interactive element:
```bash
agent-browser click @e1
agent-browser screenshot ./review-evidence/02-after-click.png
```

Record enhancement ideas — not just bugs, but opportunities to make the product better.

## Step 3: Keyboard and Focus Audit

Tab through every view:
```bash
agent-browser press Tab
```

Repeat through each page. For every interactive element, note:
- Does it receive focus? (should it?)
- Is the focus ring visible?
- Can you activate it with Enter/Space?
- Is the tab order logical?

Screenshot any missing focus rings:
```bash
agent-browser screenshot ./review-evidence/focus-missing.png
```

## Step 4: Accessibility Audit

Run snapshot on each major view to check the accessibility tree:
```bash
agent-browser snapshot
```

Verify:
- ARIA roles present where needed
- `aria-label` on inputs without visible labels
- Clickable `<div>` elements that should be `<button>` (snapshot reveals these)
- `aria-live` regions for dynamic content updates (job status changes, download progress)

## Step 5: Design Compliance

Read client CSS files.

Use agent-browser to verify computed styles:
```bash
agent-browser get styles @e1 font-size
agent-browser get styles @e1 padding
agent-browser get styles @e1 border-radius
agent-browser get styles @e1 color
```

Check:
- [ ] Colors use CSS variables from :root
- [ ] Font sizes are consistent
- [ ] Spacing is consistent
- [ ] Transitions are smooth
- [ ] Animations respect `prefers-reduced-motion`

Screenshot each view for visual evidence:
```bash
agent-browser screenshot ./review-evidence/main-page.png
```

## Step 6: Animation and Motion

- Loading/progress animations work correctly
- Framer Motion animations respect `useReducedMotion()`
- Hover states transition smoothly
- Check: does `prefers-reduced-motion` media query exist?

## Report Format

```markdown
# UI/UX Review Report

## Product Experience Findings
(Friction, missing affordances, enhancement ideas — with screenshots)

## Accessibility Issues
(Missing focus, ARIA, keyboard traps — with evidence)

## Design Compliance
(Token violations, raw values, inconsistencies — with computed style evidence)

## Positive Findings
(What works well — preserve these)

## Prioritized Recommendations
(Ordered by impact x effort)
```
