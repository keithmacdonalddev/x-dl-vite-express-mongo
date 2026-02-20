# Animation & Spatial Navigation Design Principles

Comprehensive reference extracted from the published design systems of the top 10 tech companies, plus universal principles from Disney, academic research, and modern web standards.

Last updated: 2026-02-14

---

## Table of Contents

1. [Apple - Human Interface Guidelines](#1-apple--human-interface-guidelines)
2. [Google - Material Design 3](#2-google--material-design-3)
3. [Microsoft - Fluent Design System 2](#3-microsoft--fluent-design-system-2)
4. [Meta - React Native Animated / Reanimated](#4-meta--react-native-animated--reanimated)
5. [Amazon - Prime Video / Amplify UI](#5-amazon--prime-video--amplify-ui)
6. [Netflix - Hawkins Design System](#6-netflix--hawkins-design-system)
7. [Spotify - Encore (formerly GLUE)](#7-spotify--encore-formerly-glue)
8. [Airbnb - Design Language System (DLS)](#8-airbnb--design-language-system-dls)
9. [Linear - Performance-First Design](#9-linear--performance-first-design)
10. [Stripe - Polished Micro-Interactions](#10-stripe--polished-micro-interactions)
11. [Disney's 12 Principles Applied to UI](#11-disneys-12-principles-applied-to-ui)
12. [UI Animation Anti-Patterns](#12-ui-animation-anti-patterns)
13. [Spatial UI Navigation Patterns (2025-2026)]co(#13-spatial-ui-navigation-patterns-2025-2026)
14. [View Transition API Principles](#14-view-transition-api-principles)
15. [Synthesized Universal Principles](#15-synthesized-universal-principles)
16. [Recommended Token System for Session Viewer](#16-recommended-token-system-for-session-viewer)

---

## 1. Apple - Human Interface Guidelines

**Source:** [Apple HIG - Motion](https://developer.apple.com/design/human-interface-guidelines/motion)

### Core Principles

1. **Quick and precise** - Prefer animations that combine brevity and precision. They feel lightweight, less intrusive, and convey information more effectively.
2. **Purposeful motion** - Use motion to communicate how things change, what will happen when people act, and what they can do next.
3. **Realistic and credible** - Motion that follows physical laws helps people understand how something works. Motion that contradicts physics causes disorientation.
4. **Spatial metaphor** - The push transition (new content slides in from the right, old content slides left) establishes that "deeper" content exists to the right. This spatial model helps users build a mental map.

### Timing & Easing

| Context             | Duration   | Notes                              |
| ------------------- | ---------- | ---------------------------------- |
| Standard transition | 0.25-0.35s | Default UIView animation           |
| Spring animation    | 0.3-0.6s   | Using duration + bounce parameters |
| Navigation push/pop | 0.35s      | System default                     |
| Modal presentation  | 0.35s      | System default                     |
| Quick feedback      | 0.15-0.2s  | Button taps, toggles               |

### Spring Animation Model (WWDC23)

Apple replaced traditional cubic-bezier curves with a **two-parameter spring model**:

- **Duration** - Perceptual duration (how long it appears to take)
- **Bounce** - Amount of overshoot (0 = no bounce, 1 = max bounce)

Conversion to physics: `mass = 1, stiffness = (2pi / duration)^2, damping = ((1 - bounce) * 4pi) / duration`

Recommended defaults:

- **Subtle UI** - duration: 0.35, bounce: 0 (critically damped)
- **Playful feedback** - duration: 0.5, bounce: 0.15-0.25
- **Attention-getting** - duration: 0.6, bounce: 0.3

### Easing Curves (Legacy)

| Name          | Curve                          | Use Case            |
| ------------- | ------------------------------ | ------------------- |
| easeInEaseOut | cubic-bezier(0.42, 0, 0.58, 1) | General transitions |
| easeIn        | cubic-bezier(0.42, 0, 1, 1)    | Elements leaving    |
| easeOut       | cubic-bezier(0, 0, 0.58, 1)    | Elements entering   |

### Spatial Navigation & Depth

- Navigation hierarchy flows **left-to-right** (back = left, forward/deeper = right)
- Modals rise from below, dismiss downward
- Sheets slide up from bottom edge
- Z-axis layering communicates elevation and priority
- visionOS extends this to true 3D spatial computing

### What Makes Apple Feel Premium

- Spring physics over cubic-bezier (organic, natural feel)
- Every animation serves navigation comprehension
- Consistent spatial model across all apps
- Reduced motion mode fully supported (not an afterthought)
- Gestures are interruptible - animations blend smoothly when user changes direction mid-gesture

---

## 2. Google - Material Design 3

**Source:** [Material Design 3 - Motion](https://m3.material.io/styles/motion/overview/how-it-works), [Easing & Duration Tokens](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs)

### Core Principles

1. **Informative** - Motion shows spatial relationships, functionality, and intent
2. **Focused** - Motion draws attention to what matters without distraction
3. **Expressive** - Motion celebrates moments and adds character

### Duration Token Scale (Exact Values)

| Token       | Value  | Use Case                           |
| ----------- | ------ | ---------------------------------- |
| short1      | 50ms   | Micro-interactions, ripple start   |
| short2      | 100ms  | Simple state changes, icon swaps   |
| short3      | 150ms  | Small component transitions        |
| short4      | 200ms  | Button state changes, chip toggles |
| medium1     | 250ms  | Card expansion start               |
| medium2     | 300ms  | Navigation transitions             |
| medium3     | 350ms  | Shared axis transitions            |
| medium4     | 400ms  | Container transforms               |
| long1       | 450ms  | Large area transitions             |
| long2       | 500ms  | Full-screen transitions            |
| long3       | 550ms  | Complex choreographed sequences    |
| long4       | 600ms  | Dramatic emphasis transitions      |
| extra-long1 | 700ms  | Page-level transitions             |
| extra-long2 | 800ms  | Onboarding sequences               |
| extra-long3 | 900ms  | Celebration animations             |
| extra-long4 | 1000ms | Maximum duration                   |

### Easing Curves (Exact Cubic-Bezier Values)

| Token                     | Cubic-Bezier        | Use Case                           |
| ------------------------- | ------------------- | ---------------------------------- |
| **standard**              | (0.2, 0, 0, 1)      | Default for most transitions       |
| standard-accelerate       | (0.3, 0, 1, 1)      | Elements exiting the screen        |
| standard-decelerate       | (0, 0, 0, 1)        | Elements entering the screen       |
| **emphasized-accelerate** | (0.3, 0, 0.8, 0.15) | Dramatic exits, important removals |
| **emphasized-decelerate** | (0.05, 0.7, 0.1, 1) | Dramatic entrances, hero moments   |
| linear                    | (0, 0, 1, 1)        | Color/opacity fades only           |
| legacy                    | (0.4, 0, 0.2, 1)    | M2 compatibility                   |
| legacy-accelerate         | (0.4, 0, 1, 1)      | M2 compatibility                   |
| legacy-decelerate         | (0, 0, 0.2, 1)      | M2 compatibility                   |

### Transition Types

| Pattern                 | Description                              | Typical Duration            |
| ----------------------- | ---------------------------------------- | --------------------------- |
| **Container transform** | Seamless morph between two containers    | medium3-medium4 (350-400ms) |
| **Shared axis**         | Navigating between related views (x/y/z) | medium2-medium3 (300-350ms) |
| **Fade through**        | Unrelated views cross-fade via opacity   | medium1-medium2 (250-300ms) |
| **Fade**                | Simple opacity transition                | short3-short4 (150-200ms)   |

### Spatial Navigation & Depth

- **Container transform** - Elements morph from one layout to another, maintaining spatial continuity
- **Shared axis** - Forward navigation slides along the x-axis (left-to-right), backward reverses
- **Elevation** - z-axis shadow changes communicate interactive state and hierarchy
- **Persistent elements** - Shared elements between views anchor the transition and reduce cognitive load

### What Makes Material Feel Premium

- Token system ensures consistency across an entire product
- Emphasized easing creates moments of delight at key interactions
- Container transform maintains spatial awareness during navigation
- Choreography: elements animate in sequence, not all at once

---

## 3. Microsoft - Fluent Design System 2

**Source:** [Fluent 2 - Motion](https://fluent2.microsoft.design/motion), [Timing & Easing](https://learn.microsoft.com/en-us/windows/apps/design/motion/timing-and-easing)

### Core Principles

1. **Physical** - Motion follows physical laws (inertia, gravity, weight, velocity)
2. **Functional** - Motion has purpose; it guides, informs, and reinforces
3. **Continuous** - Motion creates a flowing experience; elements don't just appear/disappear
4. **Contextual** - Motion responds to the user's context and intent

### Duration Tokens

| Token                          | Value | Use Case               |
| ------------------------------ | ----- | ---------------------- |
| ControlFasterAnimationDuration | 83ms  | Micro state changes    |
| ControlFastAnimationDuration   | 167ms | Quick feedback, hover  |
| ControlNormalAnimationDuration | 250ms | Standard transitions   |
| Fade out                       | 150ms | Element removal        |
| Slide + fade                   | 300ms | Navigation transitions |

### Easing Curves

| Name                               | Cubic-Bezier     | Use Case                    |
| ---------------------------------- | ---------------- | --------------------------- |
| **Fast Out, Slow In (Decelerate)** | (0, 0, 0, 1)     | Elements entering the scene |
| **Slow Out, Fast In (Accelerate)** | (1, 0, 1, 1)     | Elements exiting the scene  |
| Standard ease-in-out               | (0.8, 0, 0.2, 1) | On-screen movement          |

### Connected Animations

- **Definition**: An element appears to "fly" between two views, creating visual continuity
- **Forward navigation**: Element expands/moves to destination with decelerate easing
- **Back navigation**: Element contracts/returns with accelerate easing
- **Key rule**: The connected element must exist in both the source and destination views

### Depth & Layering

- **Five pillars**: Light, Depth, Motion, Material, Scale
- **Elevation via shadows**: Z-depth layering indicates hierarchy
- **Acrylic material**: Semi-transparent layers show spatial depth
- **Reveal lighting**: Light follows cursor to show interactive affordances
- **Drop shadows**: Larger shadow = higher elevation = more importance

### What Makes Fluent Feel Premium

- Connected animations create a seamless narrative between views
- Depth through actual material effects (acrylic, reveal)
- Extreme deceleration on entry makes objects feel like they have physical weight
- Aggressive acceleration on exit clears the stage quickly for new content

---

## 4. Meta - React Native Animated / Reanimated

**Source:** [React Native Animations](https://reactnative.dev/docs/animations), [Reanimated](https://docs.swmansion.com/react-native-reanimated/)

### Core Principles

1. **Declarative relationships** - Define inputs and outputs; the system handles the animation
2. **Physics-based** - Objects have inertia, momentum, and mass
3. **Native thread performance** - Animations run on the UI thread, independent of JavaScript
4. **Gesture-driven** - Animations respond directly to touch input, not just triggers

### Animation Types

| Type                  | Use Case                           | Performance              |
| --------------------- | ---------------------------------- | ------------------------ |
| **Spring**            | Natural bouncing transitions       | Native thread, 60-120fps |
| **Timing**            | Precise duration-based animations  | Native thread            |
| **Decay**             | Momentum-based (flings, scrolls)   | Native thread            |
| **Layout animations** | Automatic entry/exit of list items | UI thread                |

### Recommended Approach

- Use `useNativeDriver: true` for transform and opacity animations
- Spring animations preferred over timing for physical feel
- Reanimated 3 runs animations on UI thread by default (120fps capable)
- Gesture-interruptible: user can grab an animating element mid-motion

### Spatial Navigation

- Navigation stack uses horizontal slide (push right, pop left)
- Tab bar uses cross-fade (unrelated contexts)
- Bottom sheets use vertical spring (drag up/down with velocity-based settle)
- Shared element transitions via `react-native-shared-element`

### What Makes Meta's Approach Premium

- 120fps animations on native thread (no JS bridge bottleneck)
- Spring physics feel natural without manual tuning
- Gesture interruptibility means animations never feel like they're "in the way"
- Declarative API lets developers describe the end state; framework figures out the motion

---

## 5. Amazon - Prime Video / Amplify UI

**Source:** [Amazon Prime Video UI Updates](https://variety.com/2024/digital/news/amazon-prime-video-interface-update-whats-new-1236081109/)

### Core Principles

1. **Frictionless browsing** - Transitions should never slow down content discovery
2. **Content-first** - Animations serve the content; the chrome recedes
3. **Progressive reveal** - Hero content auto-plays on hover/focus to reduce click friction
4. **Cross-device consistency** - Same patterns work on TV, mobile, web, and Fire devices

### Animation Patterns

| Pattern              | Implementation                              | Duration                         |
| -------------------- | ------------------------------------------- | -------------------------------- |
| **Super carousel**   | Portrait cards transition to video on hover | 200-300ms fade, continuous video |
| **Hero rotator**     | Auto-plays featured content as user browses | Immediate on focus               |
| **Card zoom**        | Hovered content scales up with preview info | ~200ms scale transform           |
| **Page transitions** | Snappy slide-fade between sections          | ~250ms                           |
| **Content bar**      | New navigation bar slides in on scroll      | 150-200ms                        |

### Spatial Navigation

- TV interface uses D-pad focus model with visible focus rings
- Focus moves content carousel horizontally
- Vertical movement switches between rows/sections
- Hero area occupies top 60% of viewport, navigation below

### Amplify UI (Web SDK)

- Design token-based theming (colors, typography, spacing)
- Animation not heavily tokenized in public API
- Relies on standard CSS transitions for component state changes
- Focus on accessibility and responsive design over animation

### What Makes Amazon's Approach Work

- Video preview on hover eliminates the need for click-to-preview
- Snappy transitions (under 250ms) keep browsing momentum
- Auto-play content reduces cognitive load of "should I click this?"
- Consistent carousel patterns across all surfaces

---

## 6. Netflix - Hawkins Design System

**Source:** [Netflix TechBlog - Hawkins](https://netflixtechblog.com/hawkins-diving-into-the-reasoning-behind-our-design-system-964a7357547)

### Core Principles

1. **Performance above all** - Only animate `transform` and `opacity` (composited properties)
2. **Content is the hero** - UI chrome should recede; animations highlight content
3. **Browse momentum** - Never interrupt the user's browsing flow with slow animations
4. **Scale from mobile to TV** - Same patterns at different speeds/sizes per device

### Animation Patterns

| Pattern               | Implementation                             | Notes                                  |
| --------------------- | ------------------------------------------ | -------------------------------------- |
| **Card hover zoom**   | `transform: scale(1.2-1.5)`                | Only uses transform (GPU-accelerated)  |
| **Card expansion**    | Scale + overlay fade + sibling translation | Three simultaneous animations          |
| **Content overlay**   | `opacity: 0 -> 1` on hover                 | Info text appears over zoomed card     |
| **Row scroll**        | `transform: translate3d()`                 | Hardware-accelerated horizontal scroll |
| **Slider navigation** | Translate with momentum easing             | Chunked page scrolling                 |

### Timing Values (Observed)

| Animation             | Duration | Easing           |
| --------------------- | -------- | ---------------- |
| Card scale on hover   | ~300ms   | ease-out         |
| Card overlay fade     | ~200ms   | ease             |
| Row slide             | ~500ms   | ease-in-out      |
| Modal/dialog entrance | ~350ms   | decelerate       |
| Hero banner crossfade | ~600ms   | linear (opacity) |

### Design Token Structure

- **Foundations**: color, typography, spacing, motion
- **Tokens**: Portable variables across CSS, iOS, Android, TV
- **Components**: Reusable parts built from foundations + tokens
- Two flavors: **Hawkins Consumer** (streaming) and **Hawkins Professional** (internal tools)

### Spatial Navigation

- TV uses focus-based navigation (D-pad)
- Hover on web triggers preview expansion
- Horizontal browsing through carousels (spatial: content is "to the right")
- Detail pages push in from the right (spatial: deeper = right)
- Dismissing goes back left

### What Makes Netflix Feel Premium

- Only animating composited properties (zero layout thrashing)
- Card zoom creates a "physical" feeling of pulling content toward you
- Sibling cards politely make room (not just covered up)
- Short durations maintain browsing momentum
- Smooth 60fps even with 20+ visible cards

---

## 7. Spotify - Encore (formerly GLUE)

**Source:** [Spotify Design - Reimagining Design Systems](https://spotify.design/article/reimagining-design-systems-at-spotify), [Encore Three Years On](https://spotify.design/article/can-i-get-an-encore-spotifys-design-system-three-years-on)

### Core Principles

1. **Move with purpose** - Motion provides orientation and invites interaction
2. **Provide feedback** - Animations show the interface is responding; encourage exploration
3. **Add delight** - Little touches and attention to detail bring the interface alive
4. **Musical rhythm** - Motion is inspired by the beat and rhythm of music (pulses, flourishes, glow)

### Motion System

- **Encore Foundation** includes motion tokens alongside color, type, spacing
- Motion tokens encapsulate easing + duration pairs that convey intent
- Each animation requires four parts: **trigger, duration, easing, property**
- Choreography is the designer's job; tokens handle consistency

### Animation Patterns

| Pattern       | Context                       | Character               |
| ------------- | ----------------------------- | ----------------------- |
| **Pulse**     | Now Playing indicator         | Rhythmic, music-linked  |
| **Flourish**  | Achievement unlocked, Wrapped | Celebratory, expressive |
| **Glow**      | Active/focused elements       | Warm, inviting          |
| **Slide**     | Navigation between views      | Spatial, directional    |
| **Crossfade** | Content switching             | Smooth, unobtrusive     |

### Wrapped Motion Design (2022 Case Study)

- Used scroll-driven animations tied to audio playback
- Parallax layers create depth
- Particle effects respond to musical beat
- Transitions synchronized to BPM of highlighted tracks

### Spatial Navigation

- Tab bar for top-level sections (Home, Search, Library)
- Navigation within sections uses horizontal slide
- Now Playing bar persists at bottom (spatial anchor)
- Full-screen player slides up from bottom

### What Makes Spotify Feel Premium

- Motion feels musical (not just mechanical)
- Now Playing animations create emotional connection to content
- Wrapped showcases that animation CAN be expressive without being distracting
- Consistent "pulse of life" throughout the app (nothing feels static)

---

## 8. Airbnb - Design Language System (DLS)

**Source:** [Airbnb DLS](https://karrisaarinen.com/dls/), [Motion Engineering at Scale](https://medium.com/airbnb-engineering/motion-engineering-at-scale-5ffabfc878)

### Core Principles

1. **Unified** - One cohesive experience across all touchpoints
2. **Universal** - Accessible and intuitive for all users globally
3. **Iconic** - Memorable, distinctive visual identity
4. **Conversational** - Motion communicates with users naturally, like a conversation

### Engineering Approach: Declarative Transitions

Airbnb developed a declarative animation framework where you:

1. Define the **initial state** and **final state**
2. Provide a **transition definition** for each element
3. The framework handles everything else automatically

This approach enabled non-animation-specialists to build rich transitions on tight timelines.

### Lottie (Airbnb's Gift to the Industry)

- Renders After Effects animations natively on mobile and web
- JSON-based animation format (exported via Bodymovin plugin)
- Dramatically reduced the gap between designer intent and developer implementation
- Used for: loading animations, success states, onboarding, empty states, micro-interactions

### Animation Patterns

| Pattern                        | Use Case                 | Character                                      |
| ------------------------------ | ------------------------ | ---------------------------------------------- |
| **Parent-to-child transition** | List -> Detail view      | Shared element morphs to new layout            |
| **Shared element**             | Photo grid -> Full photo | Image animates between positions               |
| **Conversational response**    | Search -> Results        | Quick response reinforcing guest-host exchange |
| **Loading with Lottie**        | Data fetching            | Branded, delightful, communicates progress     |
| **Map interaction**            | Pin hover -> Preview     | Spatial connection between map and listing     |

### Spatial Navigation

- Search flow moves left-to-right (Where -> When -> Who -> Results)
- Map and list are spatially linked (hover on list highlights map pin)
- Listing detail pushes in from right
- Photo gallery is full-screen overlay (z-axis elevation)
- Booking flow uses step-by-step forward progression

### What Makes Airbnb Feel Premium

- Shared element transitions maintain spatial continuity (photos don't "jump")
- Declarative system means ANY engineer can add polished transitions
- Lottie animations feel handcrafted and branded (not generic spinners)
- Conversational tone: the app feels like it's responding to you, not executing commands

---

## 9. Linear - Performance-First Design

**Source:** [Linear Features](https://linear.app/features/level-up), [60fps.design/apps/linear](https://60fps.design/apps/linear)

### Core Philosophy

Linear is not just a product with good animations -- it's a product where **speed IS the design language**. Every design decision optimizes for perceived and actual performance.

### Design Principles

1. **Keyboard-first** - Nearly every action available via keyboard; Cmd+K opens command palette
2. **Instant feedback** - Actions complete in milliseconds; the UI never waits
3. **Minimal chrome** - Less UI means less to animate; focus on content
4. **Optimistic updates** - UI updates immediately, syncs in background
5. **No loading spinners** - Content appears instantly or uses skeleton screens

### Performance Techniques

| Technique                     | Impact                                   |
| ----------------------------- | ---------------------------------------- |
| **Code splitting**            | Only load what's needed for current view |
| **Virtualization**            | Long lists render only visible items     |
| **Optimistic rendering**      | UI updates before server confirms        |
| **WebSocket sync**            | Real-time updates without polling        |
| **Transform-only animations** | GPU-accelerated, never trigger layout    |

### Animation Patterns (Observed)

| Pattern               | Duration | Easing         | Notes                          |
| --------------------- | -------- | -------------- | ------------------------------ |
| Command palette open  | ~150ms   | decelerate     | Scale + fade from center       |
| Sidebar collapse      | ~200ms   | ease-out       | Width transition               |
| Issue detail slide-in | ~200ms   | decelerate     | Slides from right              |
| Status change         | ~100ms   | ease           | Instant color transition       |
| Context menu          | ~100ms   | ease-out       | Scale from origin point        |
| Drag and drop         | Spring   | Spring physics | Follows cursor with slight lag |
| Toast notification    | ~200ms   | decelerate     | Slides in from bottom-right    |

### Spatial Navigation

- Sidebar: workspace navigation (always visible or collapsed)
- Main area: list/board/timeline views
- Detail panel: slides in from right (deeper = right)
- Command palette: overlays center (z-axis elevation)
- Keyboard shortcuts: spatial hints shown on hover after delay

### What Makes Linear Feel Premium

- **Speed is the animation**: when everything is instant, you don't need elaborate transitions
- Short durations (100-200ms) mean the UI is never "in between" states for long
- Decelerate easing on entrances creates a feeling of "arriving" at the destination
- Optimistic updates eliminate the gap between action and result
- Keyboard discoverability (shortcut hints) reduces friction without cluttering the UI
- The ABSENCE of animation where it would slow things down is a deliberate choice

---

## 10. Stripe - Polished Micro-Interactions

**Source:** [Stripe Blog - Connect Front-End](https://stripe.com/blog/connect-front-end-experience), [Improve Payment Experience with Animations](https://medium.com/bridge-collection/improve-the-payment-experience-with-animations-3d1b0a9b810e)

### Core Principles

1. **Animations should never get in the way** - The goal is making the UI feel responsive, harmonious, enjoyable, and polished
2. **Animation buys time** - Stripe uses animations to mask backend latency; by the time the animation ends, the operation has completed
3. **Animations replace copy** - Stripe's animations tell the story so well you don't need to read the text to understand what the product does
4. **Humanize the interface** - Subtle physical metaphors (shaking head for errors) make the app feel alive

### Animation Techniques

| Technique             | Implementation                                          | Purpose                          |
| --------------------- | ------------------------------------------------------- | -------------------------------- |
| **Morphing dropdown** | Background container smoothly resizes between nav items | Spatial continuity in navigation |
| **Error shake**       | Horizontal oscillation on invalid input                 | Communicates "no" without text   |
| **Success checkmark** | Animated SVG stroke drawing                             | Celebrates completion            |
| **Gradient mesh**     | WebGL with Simplex noise + FBM                          | Living, breathing background     |
| **Perspective cards** | CSS 3D transforms on hover                              | Depth and interactivity          |
| **Payment flow**      | Sequential reveal of form -> processing -> confirmation | Builds confidence                |

### Timing Guidelines

| Context            | Duration                  | Notes                                            |
| ------------------ | ------------------------- | ------------------------------------------------ |
| Hover effects      | CSS transitions (fastest) | No JS overhead                                   |
| Micro-interactions | 150-300ms                 | Quick enough to not interrupt flow               |
| Payment processing | Up to 500ms animation     | Masks actual processing time                     |
| Page transitions   | Under 500ms total         | Hard limit for all durations                     |
| Error animations   | ~400ms with oscillation   | Long enough to notice, short enough to not annoy |

### Navigation Patterns

- **Morphing dropdown**: Instead of hide/show, the dropdown container smoothly animates width, height, and position when switching menu items
- Uses `transform: scaleX() scaleY()` for performance (not width/height)
- Arrow indicator smoothly follows the active menu item
- Content cross-fades within the morphing container

### Technical Implementation

- CSS transitions for simple interactions (fastest, most efficient)
- CSS animations for multi-step sequences
- Web Animations API for interactive/chainable sequences
- WebGL for background gradient (GPU-rendered)
- SVG line drawing for success/progress indicators

### What Makes Stripe Feel Premium

- **Morphing dropdown** is iconic - the navigation feels alive, not mechanical
- Error shake is physically intuitive (the form shakes its head at you)
- Gradient mesh makes the background feel like a living surface
- Payment animations build trust by visualizing the process
- Every animation serves a functional purpose (no gratuitous motion)
- Discipline: under 500ms for everything

---

## 11. Disney's 12 Principles Applied to UI

**Source:** [IxDF - Disney's 12 Principles in UI Design](https://www.interaction-design.org/literature/article/ui-animation-how-to-apply-disney-s-12-principles-of-animation-to-ui-design)

### The 6 Most Important Principles for Software UI

Ranked by applicability to desktop/web interfaces:

#### 1. Timing (Most Critical)

- Controls the **personality** of every animation
- Too fast = missed, too slow = frustrating
- Different timings communicate different weights and importance
- **Rule**: 100-300ms for most UI; 300-500ms for emphasis; never >1000ms

#### 2. Easing (Slow In / Slow Out)

- Nothing in the real world moves at constant speed
- **Ease-out** for entrances (decelerating arrival)
- **Ease-in** for exits (accelerating departure)
- **Ease-in-out** for on-screen movement
- **Never use linear** for UI transitions (feels robotic)

#### 3. Anticipation

- Prepare the user for what's about to happen
- Hover states, button depressions, loading indicators
- A small "wind up" before a big action (button depresses 1px before the action fires)
- Reduces surprise and disorientation

#### 4. Staging

- Use motion to direct the user's attention
- Only ONE thing should be commanding attention at a time
- Choreograph multiple animations so they don't compete
- Stagger entry: most important element animates first

#### 5. Follow Through & Overlapping Action

- Elements don't all stop at the same time
- A card slides into place, then its content settles a moment later
- Creates organic, layered feeling
- In UI: stagger child element animations by 30-50ms

#### 6. Secondary Action

- Supporting animations that reinforce the primary action
- Button click triggers the action AND a ripple effect
- Toast enters AND its icon subtly pulses
- Adds depth without demanding attention

### The 6 Less Critical (But Still Useful) Principles

| Principle                         | UI Application                                                           |
| --------------------------------- | ------------------------------------------------------------------------ |
| **Squash & Stretch**              | Subtle scale changes on buttons/cards (use sparingly in professional UI) |
| **Straight Ahead / Pose-to-Pose** | Keyframe-based animations (pose-to-pose dominates in UI)                 |
| **Arcs**                          | Curved motion paths for moving elements (more organic than linear paths) |
| **Exaggeration**                  | Drawing attention to critical UI states (errors, alerts)                 |
| **Solid Drawing**                 | 3D perspective transforms maintaining consistent depth                   |
| **Appeal**                        | The overall charisma and personality of the interface                    |

---

## 12. UI Animation Anti-Patterns

**Source:** [Smashing Magazine](https://www.smashingmagazine.com/2019/02/animation-design-system/), [Trevor Calabro - Most UI Animations Shouldn't Exist](https://trevorcalabro.substack.com/p/most-ui-animations-shouldnt-exist), [Val Head - Common Animation Mistakes](https://valhead.com/2019/02/18/common-animation-mistakes/)

### What Makes Animation Feel Mechanical

| Anti-Pattern                       | Why It Feels Wrong                                                     | Fix                                           |
| ---------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| **Linear easing**                  | Constant speed has no physical equivalent                              | Use ease-out for enter, ease-in for exit      |
| **All elements move together**     | Nothing in the real world moves in lockstep                            | Stagger by 30-50ms per element                |
| **Symmetric timing**               | Enter and exit at same speed feels robotic                             | Exit faster than enter (exit = clear the way) |
| **Same duration for all**          | A small toggle and a full-page transition should NOT be the same speed | Scale duration with distance/area of change   |
| **Abrupt start/stop**              | No acceleration/deceleration = mechanical                              | Always use easing curves                      |
| **Animation for animation's sake** | Motion without purpose is noise                                        | If removing it doesn't hurt UX, remove it     |

### What Makes Animation Feel Alive

| Pattern                   | Why It Feels Natural                                           |
| ------------------------- | -------------------------------------------------------------- |
| **Deceleration on entry** | Objects arrive and settle, like placing something on a table   |
| **Staggered children**    | Elements cascade in, like a wave (30-50ms offset per item)     |
| **Spring overshoot**      | Subtle bounce communicates elasticity and responsiveness       |
| **Follow-through**        | Content settles 50-100ms after container arrives               |
| **Velocity matching**     | Animation speed matches the physical gesture that triggered it |
| **Asymmetric timing**     | Exits are 30-50% faster than entrances                         |

### The 7 Deadly Anti-Patterns

1. **Over-animation** - Too much motion overwhelms users and creates visual clutter
2. **Autoplay animation** - Untriggered motion reduces usability and breaks accessibility
3. **Slow animation** - UI animations over 500ms feel sluggish; most should be 200-300ms
4. **Blocking animation** - Forcing users to wait for an animation to complete before they can act
5. **Inconsistent timing** - Same type of transition with different speeds feels broken
6. **No reduced-motion support** - Failing to respect `prefers-reduced-motion` is an accessibility failure
7. **Layout-triggering animation** - Animating width/height/top/left causes jank; use transform/opacity only

### The Litmus Test

> "If you remove the animation and the interface still makes sense, the animation was probably decoration. If you remove it and users get confused, the animation was serving a purpose."

---

## 13. Spatial UI Navigation Patterns (2025-2026)

**Source:** [Pixelmatters - UI Design Trends 2026](https://www.pixelmatters.com/insights/7-UI-design-trends-to-watch-in-2026), [Index.dev - UX Trends 2026](https://www.index.dev/blog/ui-ux-design-trends)

### Current Trends

1. **Depth without VR** - Even 2D interfaces use elevation, shadows, and layering to communicate structure
2. **Spatial cues reduce cognitive load** - Position, overlap, and distance communicate relationships
3. **Floating panels** - Content panels float above the base layer, creating a workspace feel
4. **Atmospheric shadows** - Shadows respond to cursor position, creating a dynamic sense of depth
5. **Dimensional transitions** - Elements move in 3D space (not just x/y) during navigation
6. **Liquid Glass** - Apple's evolution of glassmorphism: dynamic refraction, translucency, and depth response

### Sidebar Navigation Patterns

| Pattern                    | When to Use                | Transition                               |
| -------------------------- | -------------------------- | ---------------------------------------- |
| **Fixed sidebar (210px+)** | Desktop, >1100px           | Always visible, no transition            |
| **Collapsible sidebar**    | Medium desktop, 768-1100px | Width transition, 200-250ms, ease-out    |
| **Icon-only rail (64px)**  | Tablet landscape           | Collapse to icons, expand on hover/click |
| **Hamburger overlay**      | Mobile, <768px             | Slide from left + backdrop, 250-300ms    |
| **Bottom tab bar**         | Mobile apps                | Tab switch uses crossfade, 150-200ms     |

### Recommended Sidebar Collapse Animation

```css
.sidebar {
  width: 210px;
  transition: width 200ms cubic-bezier(0, 0, 0, 1); /* standard-decelerate */
  overflow: hidden;
}

.sidebar.collapsed {
  width: 64px;
}

/* Labels fade out faster than sidebar collapses */
.sidebar-label {
  opacity: 1;
  transition: opacity 100ms ease;
}

.sidebar.collapsed .sidebar-label {
  opacity: 0;
}
```

### Progressive Disclosure

- Show essential controls immediately
- Reveal secondary controls on hover/focus
- Use contextual menus that adapt to user intent
- Scroll-based storytelling for onboarding flows

---

## 14. View Transition API Principles

**Source:** [MDN - View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API), [Chrome Developers](https://developer.chrome.com/docs/web-platform/view-transitions)

### How It Works

1. Browser takes snapshots of old and new states
2. DOM updates while rendering is suppressed
3. CSS Animations power the transition between snapshots
4. Individual elements can opt-in via `view-transition-name`

### Design Principles

1. **Reduce cognitive load** - Transitions help users understand what changed
2. **Maintain spatial continuity** - Elements that persist between views should animate, not jump
3. **Progressive enhancement** - App works without transitions; they're an enhancement
4. **Respect user preferences** - Always honor `prefers-reduced-motion`

### Implementation Tips

- Keep animation durations short for micro-interactions
- Each `view-transition-name` must be unique per page
- Start with basic fade, then add slide/morph as needed
- Same-document transitions for SPAs, cross-document for MPAs
- Accessible by default: screen readers announce content changes regardless of animation

### Relevance to Electron Apps

While the View Transition API is primarily a web standard, its PRINCIPLES apply to any UI:

- Snapshot the before state
- Apply changes
- Animate to the after state
- Use CSS animations/transforms for 60fps performance

---

## 15. Synthesized Universal Principles

Distilled from all 10 companies' design systems:

### The 10 Universal Laws of UI Animation

#### 1. Purpose Over Polish

Every animation must serve a function: guide attention, show relationships, provide feedback, or maintain spatial awareness. If removing it doesn't hurt comprehension, remove it.

#### 2. The 200ms Rule

Most UI animations should complete in 150-300ms. Under 100ms appears instant (no animation needed). Over 500ms feels sluggish. The sweet spot for "fast but visible" is 200ms.

#### 3. Ease Out for Entrances, Ease In for Exits

Elements entering the screen should decelerate (ease-out / decelerate). Elements leaving should accelerate (ease-in / accelerate). This matches real-world physics: objects arrive and settle, objects depart and accelerate away.

#### 4. Exit Faster Than Enter

Exits should be 30-50% shorter than entrances. The user already knows what was there; they need to see what's NEW. Clear the stage quickly.

#### 5. Transform and Opacity Only

Never animate `width`, `height`, `top`, `left`, `margin`, or `padding`. Only animate `transform` (translate, scale, rotate) and `opacity`. These are composited by the GPU and never cause layout recalculation.

#### 6. Stagger, Don't Synchronize

When multiple elements animate, offset them by 30-50ms each. Synchronized movement looks mechanical. Staggered movement looks organic and draws the eye along a path.

#### 7. Spring Physics > Cubic Bezier

Spring-based animations feel more natural than duration-based ones. Apple, Meta, and Linear all favor spring physics. If using cubic-bezier, emphasized-decelerate `(0.05, 0.7, 0.1, 1)` is the most premium-feeling curve.

#### 8. Spatial Consistency

Establish a spatial model and never break it. "Deeper" content comes from the right. Modals rise from below. Dismissals reverse the entry animation. Users build mental maps; inconsistency destroys them.

#### 9. Choreography Over Simultaneous Motion

Plan the sequence: which element moves first, which follows, which waits. The most important element animates first. Supporting elements follow. Never have everything move at once.

#### 10. Respect Reduced Motion

Every animation must have a `prefers-reduced-motion: reduce` fallback. Reduced doesn't mean none -- it means simpler (crossfade instead of slide, instant instead of spring). This is accessibility, not optional.

### Duration Quick-Reference

| Category | Duration   | Use Case                                                 |
| -------- | ---------- | -------------------------------------------------------- |
| Micro    | 50-100ms   | Color changes, opacity toggles, icon swaps               |
| Fast     | 100-200ms  | Button states, hover effects, tooltips                   |
| Standard | 200-300ms  | Navigation transitions, panel slides, card expansion     |
| Emphasis | 300-500ms  | Modal entrances, shared element transforms, celebrations |
| Dramatic | 500-1000ms | Onboarding, first-run experiences (use very sparingly)   |

### Easing Quick-Reference

| Name                      | Cubic-Bezier        | When to Use                                   |
| ------------------------- | ------------------- | --------------------------------------------- |
| **Standard**              | (0.2, 0, 0, 1)      | Default for most transitions                  |
| **Decelerate (ease-out)** | (0, 0, 0, 1)        | Elements entering the screen                  |
| **Accelerate (ease-in)**  | (0.3, 0, 1, 1)      | Elements exiting the screen                   |
| **Emphasized Decelerate** | (0.05, 0.7, 0.1, 1) | Premium entrances, hero moments               |
| **Emphasized Accelerate** | (0.3, 0, 0.8, 0.15) | Dramatic exits                                |
| **Linear**                | (0, 0, 1, 1)        | ONLY for opacity fades or continuous rotation |

---

## 16. Recommended Token System for Session Viewer

Based on synthesis of all 10 companies' systems, mapped to Session Viewer's existing design system:

### Duration Tokens

```css
:root {
  /* Micro - icon swaps, color changes */
  --duration-instant: 50ms;
  --duration-micro: 100ms;

  /* Fast - hover states, button feedback, tooltips */
  --duration-fast: 150ms; /* Current: 0.15s (matches) */

  /* Standard - navigation transitions, panel slides */
  --duration-normal: 250ms; /* Current: 0.25s (matches) */

  /* Emphasis - modals, toasts, shared elements */
  --duration-emphasis: 350ms; /* Current: 0.35s (matches) */

  /* Dramatic - onboarding only (use sparingly) */
  --duration-dramatic: 500ms;
}
```

### Easing Tokens

```css
:root {
  /* Standard - default for most transitions */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);

  /* Enter - elements appearing on screen */
  --ease-decelerate: cubic-bezier(0, 0, 0, 1);

  /* Exit - elements leaving the screen */
  --ease-accelerate: cubic-bezier(0.3, 0, 1, 1);

  /* Premium enter - hero moments, important reveals */
  --ease-emphasized-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1);

  /* Premium exit - dramatic departures */
  --ease-emphasized-accelerate: cubic-bezier(0.3, 0, 0.8, 0.15);

  /* Linear - opacity fades only, never for movement */
  --ease-linear: linear;
}
```

### Application Map

| Component             | Duration            | Easing                       | Notes                      |
| --------------------- | ------------------- | ---------------------------- | -------------------------- |
| Button hover          | --duration-fast     | --ease-standard              | Match current 0.15s        |
| Card hover (lift)     | --duration-fast     | --ease-standard              | translateY(-1px)           |
| Sidebar collapse      | --duration-normal   | --ease-decelerate            | Width transition           |
| Sidebar label fade    | --duration-micro    | --ease-linear                | Faster than sidebar width  |
| Modal open            | --duration-emphasis | --ease-emphasized-decelerate | Premium entrance           |
| Modal close           | --duration-normal   | --ease-accelerate            | Exit 30% faster than enter |
| Toast enter           | --duration-emphasis | --ease-decelerate            | Slide in                   |
| Toast exit            | --duration-normal   | --ease-accelerate            | Clear stage quickly        |
| Navigation transition | --duration-normal   | --ease-standard              | Panel content swap         |
| Progress bar          | 1200ms (custom)     | linear                       | Continuous sweep           |
| Status light pulse    | 2000ms (custom)     | ease-in-out                  | Infinite, organic          |
| Stagger offset        | 40ms per item       | --                           | For list item entry        |

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## Sources

### Company Design Systems

- [Apple HIG - Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [Material Design 3 - Motion](https://m3.material.io/styles/motion/overview/how-it-works)
- [Material Design 3 - Easing & Duration](https://m3.material.io/styles/motion/easing-and-duration)
- [Material Design 3 - Transitions](https://m3.material.io/styles/motion/transitions)
- [Material Foundation Motion Tokens (JSON)](https://github.com/material-foundation/material-tokens/blob/json/json/motion.json)
- [Fluent 2 - Motion](https://fluent2.microsoft.design/motion)
- [Microsoft Learn - Timing & Easing](https://learn.microsoft.com/en-us/windows/apps/design/motion/timing-and-easing)
- [Microsoft Learn - Connected Animation](https://learn.microsoft.com/en-us/windows/apps/design/motion/connected-animation)
- [React Native - Animations](https://reactnative.dev/docs/animations)
- [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/)
- [Netflix TechBlog - Hawkins](https://netflixtechblog.com/hawkins-diving-into-the-reasoning-behind-our-design-system-964a7357547)
- [Spotify Design - Reimagining Design Systems](https://spotify.design/article/reimagining-design-systems-at-spotify)
- [Spotify Design - Encore Three Years On](https://spotify.design/article/can-i-get-an-encore-spotifys-design-system-three-years-on)
- [Spotify Design - Motion for Wrapped](https://spotify.design/article/making-moves-designing-motion-for-2022-wrapped)
- [Airbnb DLS](https://karrisaarinen.com/dls/)
- [Airbnb - Motion Engineering at Scale](https://medium.com/airbnb-engineering/motion-engineering-at-scale-5ffabfc878)
- [Airbnb - Introducing Lottie](https://medium.com/airbnb-engineering/introducing-lottie-4ff4a0afac0e)
- [Linear Features](https://linear.app/features/level-up)
- [Stripe Blog - Connect Front-End](https://stripe.com/blog/connect-front-end-experience)
- [Stripe - Payment Animations](https://medium.com/bridge-collection/improve-the-payment-experience-with-animations-3d1b0a9b810e)

### Disney & Animation Theory

- [IxDF - Disney's 12 Principles in UI Design](https://www.interaction-design.org/literature/article/ui-animation-how-to-apply-disney-s-12-principles-of-animation-to-ui-design)
- [Disney's Principles Exemplified in UX](https://uxdesign.cc/disneys-12-principles-of-animation-exemplified-in-ux-design-5cc7e3dc3f75)
- [Apple WWDC23 - Animate with Springs](https://developer.apple.com/videos/play/wwdc2023/10158/)

### Anti-Patterns & Best Practices

- [Val Head - Common Animation Mistakes](https://valhead.com/2019/02/18/common-animation-mistakes/)
- [Trevor Calabro - Most UI Animations Shouldn't Exist](https://trevorcalabro.substack.com/p/most-ui-animations-shouldnt-exist)
- [LogRocket - Motion Design Mistakes](https://blog.logrocket.com/ux-design/motion-design-mistakes-and-fixes/)

### Spatial UI & Trends

- [Pixelmatters - UI Trends 2026](https://www.pixelmatters.com/insights/7-UI-design-trends-to-watch-in-2026)
- [Index.dev - UX Design Trends 2026](https://www.index.dev/blog/ui-ux-design-trends)

### Web Standards

- [MDN - View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- [Chrome Developers - View Transitions](https://developer.chrome.com/docs/web-platform/view-transitions)
- [Josh W. Comeau - Springs in CSS](https://www.joshwcomeau.com/animation/linear-timing-function/)

### Additional Design Systems (Supplementary)

- [IBM Carbon - Motion](https://carbondesignsystem.com/elements/motion/overview/)
- [Stripe Navigation Tutorial](https://lokeshdhakar.com/dev-201-stripe.coms-main-navigation/)
- [Netflix CSS Animation Case Study](https://css-tricks.com/how-to-re-create-a-nifty-netflix-animation-in-css/)
