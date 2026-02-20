# Premium Prototype Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace existing prototype set with three materially stronger, production-contender prototypes that maximize first impression, reduce cognitive load, and add premium microinteractions.

**Architecture:** Implement three standalone static prototype applications sharing product truth (intake/jobs/contacts/activity) while diverging in emotional thesis, information architecture, and interaction language. Use a focused CSS token system and page-state controllers per prototype to keep behavior deterministic and easy to review.

**Tech Stack:** HTML5, CSS3, Vanilla JavaScript

---

### Task 1: Re-map prototype directories and launcher

**Files:**
- Create: `prototypes/index.html`
- Create: `prototypes/prototype-1-command/index.html`
- Create: `prototypes/prototype-1-command/style.css`
- Create: `prototypes/prototype-1-command/script.js`
- Create: `prototypes/prototype-2-sanctuary/index.html`
- Create: `prototypes/prototype-2-sanctuary/style.css`
- Create: `prototypes/prototype-2-sanctuary/script.js`
- Create: `prototypes/prototype-3-pulse/index.html`
- Create: `prototypes/prototype-3-pulse/style.css`
- Create: `prototypes/prototype-3-pulse/script.js`

**Step 1: Write failing structure check**
Run:
`node -e "const fs=require('fs');['prototypes/index.html','prototypes/prototype-1-command/index.html','prototypes/prototype-2-sanctuary/index.html','prototypes/prototype-3-pulse/index.html'].forEach(p=>{if(!fs.existsSync(p)) throw new Error('Missing '+p)});"`
Expected: FAIL before files exist.

**Step 2: Create directory/file scaffolds**
- Build new folders and starter files.

**Step 3: Re-run structure check**
Run same command.
Expected: PASS.

### Task 2: Implement Prototype 1 (Command)

**Files:**
- Modify: `prototypes/prototype-1-command/index.html`
- Modify: `prototypes/prototype-1-command/style.css`
- Modify: `prototypes/prototype-1-command/script.js`

**Step 1: Write failing behavior check (Clarity Mode hook)**
Run:
`node -e "const fs=require('fs');const s=fs.readFileSync('prototypes/prototype-1-command/script.js','utf8');if(!s.includes('clarity')) throw new Error('Missing clarity control');"`
Expected: FAIL before implementation.

**Step 2: Implement HTML architecture**
- Build pages: Overview/Jobs/Contacts/Activity.
- Ensure each page has one primary CTA.

**Step 3: Implement CSS design system**
- Confidence-first visual grammar, strong hierarchy, responsive layout.
- Add motion + reduced-motion handling.

**Step 4: Implement JS interactions**
- Nav state switching.
- Clarity Mode (Essential/Standard/Expert).
- Toast feedback + reveal choreography.

**Step 5: Verify behavior check passes**
Run same command.
Expected: PASS.

### Task 3: Implement Prototype 2 (Sanctuary)

**Files:**
- Modify: `prototypes/prototype-2-sanctuary/index.html`
- Modify: `prototypes/prototype-2-sanctuary/style.css`
- Modify: `prototypes/prototype-2-sanctuary/script.js`

**Step 1: Write failing behavior check (Focus Session hook)**
Run:
`node -e "const fs=require('fs');const s=fs.readFileSync('prototypes/prototype-2-sanctuary/script.js','utf8');if(!s.includes('Focus') && !s.includes('focus')) throw new Error('Missing focus flow');"`
Expected: FAIL before implementation.

**Step 2: Implement HTML architecture**
- Build Do/Review/Maintain structure.
- Ensure one primary action per page.

**Step 3: Implement CSS design system**
- Calm visual rhythm, high whitespace, gentle hierarchy.

**Step 4: Implement JS interactions**
- Navigation transitions.
- Focus Session guided workflow.
- Subtle feedback interactions.

**Step 5: Verify behavior check passes**
Run same command.
Expected: PASS.

### Task 4: Implement Prototype 3 (Pulse)

**Files:**
- Modify: `prototypes/prototype-3-pulse/index.html`
- Modify: `prototypes/prototype-3-pulse/style.css`
- Modify: `prototypes/prototype-3-pulse/script.js`

**Step 1: Write failing behavior check (Replay hook)**
Run:
`node -e "const fs=require('fs');const s=fs.readFileSync('prototypes/prototype-3-pulse/script.js','utf8');if(!s.includes('replay')) throw new Error('Missing replay feature');"`
Expected: FAIL before implementation.

**Step 2: Implement HTML architecture**
- Build Launch/Queue/Profiles/Trace structure.
- Keep action hierarchy explicit.

**Step 3: Implement CSS design system**
- High-energy visual direction with controlled density.

**Step 4: Implement JS interactions**
- Kinetic nav and button feedback.
- Momentum Replay logger/player.

**Step 5: Verify behavior check passes**
Run same command.
Expected: PASS.

### Task 5: Build comparison launcher

**Files:**
- Modify: `prototypes/index.html`

**Step 1: Add evaluation-oriented launcher page**
- Cards linking all three prototypes.
- Summaries of emotional goal + special feature.

**Step 2: Verify links are correct**
Run:
`node -e "const fs=require('fs');const s=fs.readFileSync('prototypes/index.html','utf8');['prototype-1-command','prototype-2-sanctuary','prototype-3-pulse'].forEach(t=>{if(!s.includes(t)) throw new Error('Missing link '+t)});"`
Expected: PASS.

### Task 6: Final verification

**Files:**
- Verify: `prototypes/**/*.html`
- Verify: `prototypes/**/*.css`
- Verify: `prototypes/**/*.js`

**Step 1: Parse-check JavaScript**
Run:
`node -e "const fs=require('fs');const files=['prototypes/prototype-1-command/script.js','prototypes/prototype-2-sanctuary/script.js','prototypes/prototype-3-pulse/script.js'];for(const f of files){new Function(fs.readFileSync(f,'utf8'));console.log('OK',f);}"`
Expected: PASS for all files.

**Step 2: Confirm file presence**
Run:
`Get-ChildItem -Path prototypes -Recurse -File | Select-Object FullName`
Expected: All required files listed.

**Step 3: Manual QA checklist**
- Desktop check each prototype.
- Mobile-width check each prototype.
- Verify unique special feature in each prototype.
- Verify one primary CTA per page.
- Verify hover/load/scroll interactions.
- Verify reduced-motion fallback styles exist.

### Task 7: Change summary

**Files:**
- Modify: none

**Step 1: Produce concise implementation summary**
- List resulting prototypes, unique feature for each, and verification evidence.

