---
name: secondpass
description: >
  Comprehensive end-of-session handoff generator using Sonnet 4.6 (1M context).
  Aggregates current conversation, previous handoffs, and git state to produce
  a high-signal context package for seamless continuation in a new chat.
  Does NOT duplicate CLAUDE.md, .claude/rules/*, or .claude/memory/* content
  already loaded by Claude Code.
argument-hint: ''
allowed-tools: Read, Write, Bash, Glob, Grep
context: main
model: sonnet
---

# Comprehensive Session Handoff (Sonnet 4.6, 1M context)

> **Core question this handoff must answer:** "If a new engineer took over right now, what would they need to know to continue without breaking anything, losing the user's vision, or repeating dead ends?"

> Every section serves this question. If content doesn't help a new engineer continue safely and aligned with the user's vision, cut it.

## Your Role: Interpreter, Not Extractor

A handoff that **meets** intent: Lists what happened, what's next.

A handoff that **exceeds** intent: The next chat reads it and understands:
- What the user is trying to build (not just what they asked for)
- What they care about (inferred from engagement, not just stated)
- What would disappoint them (even if they never said "don't do X")
- What the design FEELS like in their head (not just what it does technically)

**You are not a transcript summarizer.** You are transferring a relationship — the understanding built between user and assistant over an entire session. The next chat inherits your knowledge. What you fail to convey, they will never know.

### How to Interpret Intent
- **Read between the lines.** If the user spent 3+ messages on animation details, animations matter deeply to them.
- **Recognize implicit vision.** Design philosophies govern future decisions. Capture the philosophy.
- **Infer from engagement.** Topics the user returns to repeatedly reveal what they care about most.
- **Surface what they couldn't articulate.** Your job is to capture what they meant.

### The Test
Before finalizing the handoff, ask:
1. "Would the user read this and say 'yes, they got it — they understand what I'm building'?"
2. "Would the next chat make the same design choices the user would want, based solely on this handoff?"
3. "Is anything the user clearly cares about missing just because they didn't explicitly flag it?"

If the answer to any question is "no" — the handoff isn't done.

You are generating an end-of-session context handoff. Your output will be loaded into a NEW chat that has ZERO memory of this conversation. The new chat WILL have access to CLAUDE.md, .claude/rules/*, and .claude/memory/* — so do NOT duplicate that content.

Your job: capture everything conversation-specific that would otherwise be lost.

## Sources (check in this order)

1. **Current conversation** — primary source.
2. **./context/latest_*.md** — previous handoffs.
3. **Git state** — run `git status`, `git log --oneline -10`, and `git diff --stat HEAD~5`.
4. **Project docs** — ONLY check specific files discussed this session.

## What Makes a Good Handoff

The next chat should be able to:
- Start working immediately without asking "what were we doing?"
- Know what files were changed and why
- Know what failed and why (so it doesn't retry dead ends)
- Know what decisions were made and the reasoning
- Know what's unfinished and what to do next
- Know what constraints were discovered

## What Does NOT Belong

- Architecture overview (CLAUDE.md has it)
- General project conventions (rules files have them)
- Greetings, pleasantries, troubleshooting dead ends that led nowhere

## Processing Checkpoints

Output these progress markers as you work:

### Phase 1: Source Collection
```
[1/5] Collecting sources...
```

### Phase 2: Intent Interpretation
```
[2/5] Interpreting intent...
```

### Phase 3: Section Generation
```
[3/5] Generating 13 sections...
```

### Phase 4: Quality Check
```
[4/5] Running quality check...
```

### Phase 5: File Output
```
[5/5] Writing files...
```

## Output Sections (13 sections, exact order)

### 1. Context
One paragraph: Who was in this conversation, when, what was the primary focus.

### 2. Work Completed
Bulleted list of what was actually done this session:
- Each item: what changed, which file(s), why
- Include git commit hashes where available
- Include file paths (exact, not approximate)

**File completeness rule:** Run `git diff --name-only` against the session's commits. Every file with material changes MUST be listed. Mark imperative files with `[REVIEW]`.

### 3. System Context (Inherited + Relevant History)
Pre-existing systems, architecture, and context the next chat MUST understand to work safely — even if NOT modified this session. Describe HOW systems work, not just that they exist.

### 4. Current State (Before -> After)
**Before this session:** What was broken/missing.
**After this session:** What's working now, what's still broken, dirty files.

### 5. Active Decisions
Decisions made THIS session that affect future work.

### 6. Discovered Constraints
New must/must-not rules learned THIS session.

### 7. Failed Approaches
What was tried and didn't work. Prevents retrying dead ends.

### 8. Open Questions
Unresolved questions that need answers.

### 9. Next Actions (numbered, concrete)
Ordered list of what the next chat should do.

### 10. Risks / Uncertainty
Known risks, unverified assumptions, fragile solutions.

### 11. Continuity Chain
Link to previous handoff, what changed since, running themes.

### 12. Evidence Index
Map key claims to their source (file path or commit hash).

### 13. Key Dialogue
Verbatim user messages that shaped decisions or reveal intent. Include 3-8 quotes.

## Quality Rules

- Preserve exact technical identifiers
- Target: 800-1500 words. Hard ceiling: 2500 words.
- Every section must have content or explicitly state "None this session"

## File Output

1. Ensure `./context/` folder exists at project root
2. Create timestamped file: `./context/<YYYY-MM-DD_HHmm>_sonnet-4-6_<topic-slug>.md`
3. Also write/update: `./context/latest_sonnet-4-6.md`

## Summary Footer

```
---
Generated: <timestamp>
Model: sonnet-4-6 (1M context)
Word count: <N>
Sources used: <list>
Previous handoff: <path or "none">
```
