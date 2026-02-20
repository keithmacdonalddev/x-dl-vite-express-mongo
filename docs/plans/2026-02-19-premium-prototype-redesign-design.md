# Premium Prototype Redesign Design

**Date:** 2026-02-19
**Scope:** Full redesign of three standalone web prototypes for x-dl visual presence.

## Objective
Deliver three production-contender prototypes that each excel at:

1. Engineering first impression around one dominant emotional signal in the first 50ms.
2. Reducing cognitive load through strict hierarchy, whitespace, and one primary goal per page.
3. Adding premium microinteractions that provide delight without distraction.

## Shared Design Principles
- One dominant CTA per page.
- Navigation limited to 3-4 top-level destinations.
- Secondary information visually subordinate and progressively disclosed.
- Motion serves orientation, feedback, and confidence.
- Desktop + mobile parity with intentional layout behavior.
- Full reduced-motion fallback.

## Prototype Directions

### Prototype 1: Command (Confidence)
- Emotion: Confidence and operational trust.
- IA: Overview, Jobs, Contacts, Activity.
- Visual language: Precise, high-legibility, structured surfaces.
- Microinteraction style: Crisp and tactical.
- Special feature: Clarity Mode (Essential/Standard/Expert) controls information density globally.

### Prototype 2: Sanctuary (Calm)
- Emotion: Calm and clarity.
- IA: Do, Review, Maintain.
- Visual language: Spacious editorial composition, low-noise UI.
- Microinteraction style: Gentle, reassuring transitions.
- Special feature: Focus Session mode converts workflows into guided step completion.

### Prototype 3: Pulse (Excitement)
- Emotion: Momentum and craft.
- IA: Launch, Queue, Profiles, Trace.
- Visual language: Kinetic yet disciplined high-contrast system.
- Microinteraction style: Expressive with strict hierarchy protection.
- Special feature: Momentum Replay records and replays recent interaction sequence.

## First Impression Targets
- Command: "This is reliable and under control."
- Sanctuary: "This feels simple and respectful."
- Pulse: "This is powerful and alive."

## Cognitive Load Targets
- Each page exposes one primary action only.
- Non-critical details hidden until requested.
- Repetition in labels/controls minimized.
- Information chunks constrained to scan-friendly blocks.

## Microinteraction Requirements
- Page load: staged reveal sequence to orient attention.
- Buttons/controls: tactile hover + active feedback.
- Scroll: section reveal and orientation cues.
- State transitions: explicit success/error feedback.
- Reduced motion mode: minimal transformations and no decorative motion.

## File Targets
- `prototypes/prototype-1-command/{index.html,style.css,script.js}`
- `prototypes/prototype-2-sanctuary/{index.html,style.css,script.js}`
- `prototypes/prototype-3-pulse/{index.html,style.css,script.js}`
- `prototypes/index.html` (launcher + side-by-side evaluation entry)

## Acceptance Criteria
- Three prototypes are visually and behaviorally distinct.
- All three directly embody the first-impression, cognitive-load, and microinteraction requirements.
- Each prototype includes exactly one unique special feature not shared by the others.
- All prototypes render well on desktop and mobile.
- JS validates and prototype pages open without runtime errors.
