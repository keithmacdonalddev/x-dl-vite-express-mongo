# Design System for x-dl

All UI changes MUST comply with these specifications.

## Color Palette

### CSS Custom Properties (defined in App.css on `.app`)

| Token | Hex | Usage |
|-------|-----|-------|
| --bg | #f3f5f7 | App background fallback |
| --ink | #102029 | Primary text color |
| --muted | #4d6573 | Secondary/label text |
| --card | #ffffff | Card backgrounds |
| --line | #d4dde3 | Borders, dividers |
| --accent | #0b6bcb | Primary action color, links, active states |
| --accent-strong | #0a4d92 | Hover/pressed accent |
| --warm | #ffd18c | Decorative warm highlight |

### Body Background
Radial gradient: `radial-gradient(circle at 0 0, #f4f6ff 0, #f7f7fb 35%, #f4f1ec 100%)`

### Status Colors (used in job states and activity panel)

| State | Color | Usage |
|-------|-------|-------|
| Active/Running | var(--accent) #0b6bcb | Active pulse indicator, running jobs |
| Success/Done | #41a466 / #6cb98a | Completed jobs, enabled chips |
| Failed/Error | #b62b2b / #a01f1f | Error text, danger buttons, failed job summaries |
| Queued/Neutral | #35566b / #b6c7d3 | Neutral chips, pending states |
| Disabled | #d9aaaa / #8f2f2f | Disabled chips |

### Semantic Text Colors

| Context | Color |
|---------|-------|
| Primary text | #1f1f2c (body), #0d2130 (headings), #102029 (--ink) |
| Secondary text | #4d6573 (--muted), #466072 (eyebrow), #516c83 (notes) |
| Activity text | #2c4f67 |
| Error text | #a01f1f, #8f2f2f |
| Link/accent text | #0b6bcb |

## Typography

### Font Family
- Primary: `'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`

### Font Sizes
| Usage | Size |
|-------|------|
| Page title (h1) | clamp(1.9rem, 4vw, 2.8rem) |
| Card heading (h2) | 1.08rem |
| Section heading (activity h3) | 12px uppercase |
| Body text | inherit (browser default ~16px) |
| Buttons/labels | 13px |
| Small text/eyebrow | 11-12px |
| Vault input | clamp(14px, 1.45vw, 17px) |

### Font Weights
- Regular: 400 (body)
- Medium: 450-520 (vault input, placeholder)
- Semibold: 600-620 (activity close btn, vault chips)
- Bold: 700 (headings, buttons, contact names, summaries)

### Text Transforms
- Eyebrow labels: `text-transform: uppercase; letter-spacing: 0.11em`
- Activity section headers: `text-transform: uppercase; letter-spacing: 0.08em`

## Spacing Scale

| Value | Usage |
|-------|-------|
| 6px | Compact gaps (chip rows, event rows) |
| 8px | Standard gaps (list items, form fields, button groups) |
| 10px | Card padding (compact), component internal spacing |
| 12px | List gaps (jobs, profiles), form padding |
| 14px | Panel padding, layout gaps |
| 16px | App side padding, modal padding, section spacing |
| 18px | Card padding (standard), layout margin-top |
| 24px | Hero padding, app top padding |

## Border Radius Scale

| Value | Usage |
|-------|-------|
| 8px | Small buttons (activity close) |
| 10px | Standard buttons, inputs, asset items, chips (non-pill) |
| 11px | Vault input inner |
| 12px | Job thumbnails, activity job groups |
| 14px | Cards, job rows, contact chips, modals, profile cards, vault input shell |
| 16px | Main cards (.card class) |
| 20px | Hero section |
| 999px | Pill-shaped chips (vault-chip) |

## Component Standards

### Cards
`.card`: `border-radius: 16px; border: 1px solid var(--line); background: var(--card); padding: 18px; box-shadow: 0 8px 24px rgba(15, 40, 65, 0.06)`

### Buttons
- Ghost: `border: 1px solid #b9c9d6; border-radius: 10px; background: #f6fbff; padding: 8px 12px; font-weight: 700`
- Danger: `border: 0; border-radius: 10px; background: #b62b2b; color: #fff; padding: 8px 12px; font-weight: 700`
- Accent: `border: 0; border-radius: 10px; background: var(--accent); color: #fff; padding: 8px 12px; font-weight: 700`
- Refresh: `background: #185587; color: #fff`
- Disabled: `opacity: 0.6; cursor: not-allowed`

### Inputs
Standard: `border: 1px solid #c4d0d8; border-radius: 10px; padding: 10px 12px; font: inherit`

### Vault Input (premium intake form)
Shell with gradient background, focus-within elevation, validation states (is-ready green, is-invalid red).

### Status Indicators
- Activity pulse: 8px circle, accent color, `animation: activity-pulse-anim 1.5s ease-in-out infinite`
- Must include text label for accessibility

### Chips
Pill-shaped (`border-radius: 999px`), gradient backgrounds, semantic color variants: is-enabled (green), is-disabled (red), is-neutral (blue-gray).

## Animation Standards

### Timing
| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| fast | 140-180ms | ease | Button hover, input focus, chip hover |
| normal | 220ms | ease | Input shell transitions |
| slow | 560ms | ease | Card pulse feedback |
| ambient | 30s | linear | Vault orbit decoration |
| shimmer | 1.05s | linear | Loading button shimmer |

### Defined Keyframes
- `vault-orbit` — 360deg rotation (30s, ambient decoration)
- `vault-card-pulse` — box-shadow pulse on submit (560ms)
- `vault-shimmer` — loading shimmer translateX sweep (1.05s)
- `vault-arrow-drift` — subtle horizontal drift (2s)
- `activity-pulse-anim` — opacity pulse for active indicators (1.5s)

### Framer Motion
Used for page transitions and component animations in React. Always guard with `useReducedMotion()`.

### Reduced Motion
All CSS animations and transitions respect `prefers-reduced-motion: reduce` — animations set to `none !important`, transitions set to `none !important`.

## Layout

### App Container
`width: min(1320px, 96vw); margin: 0 auto; padding: 24px 16px 44px`

### Main Grid
`.layout`: `grid-template-columns: 310px 1fr; gap: 14px`

### Contacts Panel
Sticky: `position: sticky; top: 12px; align-self: start; max-height: calc(100vh - 24px); overflow: auto`

### Activity Panel (slide-out)
Fixed right: `width: 380px; height: 100vh; background: #f7fafc; border-left: 1px solid #d0d9e0`

### Profile Grid
`grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px`

## Z-Index Scale

| Value | Usage |
|-------|-------|
| -1 | Vault orbit pseudo-element |
| 2 | Vault form (above pseudo-elements) |
| 1000 | Modal overlay |
| 1050 | Activity overlay backdrop |
| 1060 | Activity panel |
| 1100 | Activity toggle button |

## Responsive Breakpoints

| Breakpoint | Changes |
|------------|---------|
| <= 980px | Single-column layout, contacts panel unstickied, contacts grid fills, activity panel full-width, flex-wrap on toolbars |

## Accessibility

### Screen Reader
`.sr-only` utility class available for visually hidden but accessible text.

### Focus States
Vault input shell: visible focus-within with border color change, elevation shift, and blue ring shadow.

### Reduced Motion
All animated elements (vault, activity pulse, shimmer) respect `prefers-reduced-motion: reduce`.

### Touch Targets
Buttons have minimum 34px height (vault chips). Standard buttons are 8px+12px padding giving adequate touch area.

## Compliance Checklist

Before merging UI changes, verify:

### Colors
- [ ] Uses defined CSS custom properties or documented hex values
- [ ] No undocumented hardcoded colors
- [ ] Status colors match the documented state mapping

### Typography
- [ ] Uses Segoe UI font stack
- [ ] Font sizes match documented scale
- [ ] Uppercase + letter-spacing on eyebrow/section headers

### Spacing
- [ ] Uses documented spacing values
- [ ] Consistent padding within component types
- [ ] Proper gap in flex/grid layouts

### Accessibility
- [ ] Focus states visible on interactive elements
- [ ] Status indicators have text labels (not color-only)
- [ ] Reduced motion respected

### Animation
- [ ] Framer Motion uses useReducedMotion() guard
- [ ] CSS animations have prefers-reduced-motion override
- [ ] No animation without reduced-motion fallback
