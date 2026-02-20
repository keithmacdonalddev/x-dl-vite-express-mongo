# Haiku Prompting Guide

Real-world findings from team runs. Updated automatically after each run.

---

## Model Profile (Haiku 4.5 — February 2026)

**Technical Specifications:**
- **Vision:** YES, full multimodal (first Haiku with vision), ~1,334 tokens per 1000×1000px image
- **Context window:** 200K tokens (NO 1M beta access currently)
- **Max output:** 64K tokens
- **Extended thinking:** YES, 128K budget
- **Tool use:** Full support, same API as all models
- **Agent-browser:** Fully supported, 50.7% OSWorld benchmark
- **Speed:** Fastest Claude model, 4-5x faster than Sonnet
- **Cost:** $1/$5 per MTok (3x cheaper than Sonnet, 5x cheaper than Opus)
- **SWE-bench:** 73.3%
- **Knowledge cutoff:** Feb 2025 | Training cutoff: Jul 2025

**Behavioral Characteristics:**
- Follows sequences well, does NOT improvise
- Gives up quickly when confused — states incorrect conclusions with confidence
- Cannot recover from ambiguity without explicit instructions
- Reliable for 3-5 steps, degrades after 6+ sequential steps
- Fills assumptions instead of asking clarifying questions
- May claim tool unavailability when tool exists (prompt more explicitly)

---

## Where Haiku SUCCEEDS (Use It Here)

**Ideal Use Cases:**
- Parallel task execution (multiple workers doing bounded tasks)
- Code exploration and search (Glob/Grep/Read)
- Simple code modifications (1-2 files, clear spec)
- Accessibility tree parsing (`agent-browser snapshot -i`)
- Status checks and verification of specific conditions
- Template-based operations
- File reading and content extraction
- Sub-agent tasks with clear inputs/outputs
- Tasks with 3-5 steps max
- Cost-sensitive bulk operations

**When to Choose Haiku Over Sonnet:**
- Task is mechanical, not reasoning-heavy
- Task has 3-5 steps or less
- Cost optimization is critical (3x cheaper)
- Speed matters (4-5x faster)
- Task is well-bounded with clear success criteria

**Prompting tax note:** Haiku's prompting tax (180 lines per agent) is 4.5x more verbose than Sonnet (40 lines) for equivalent test coverage. The cost savings from Haiku ($1/$5 vs $3/$15) must be weighed against the prompting investment. For tasks requiring extensive guardrails, Sonnet may be more cost-effective when factoring in prompt engineering time.

**When to Choose Haiku Over Opus:**
- Task doesn't require architectural judgment
- Task is repetitive or template-based
- Cost matters (5x cheaper)
- Speed matters (significantly faster)

---

## Where Haiku FAILS (Don't Use It Here)

**Anti-Patterns:**
- Complex multi-file refactoring (needs too many retries)
- Deep architectural reasoning (lower quality, requires rework)
- Security-critical analysis (too likely to miss issues)
- Tasks requiring 6+ sequential steps without gates
- Visual design review (use Sonnet minimum)
- Lead/coordinator roles (use Sonnet or Opus)
- Tasks requiring uncertainty expression (Haiku states wrong things with confidence)
- Complex multi-step reasoning chains
- Open-ended troubleshooting without explicit recovery steps

---

## Known Failure Patterns (Documented + Observed in v3/v5)

| Pattern | Symptom | Fix |
|---------|---------|-----|
| **1. Agentic laziness** | Quits early, drops steps | 5-step phases with completion gates |
| **2. Overconfident wrong conclusions** | "Electron-only" stated as fact | "DO NOT [wrong conclusion]" preambles |
| **3. Tool availability claims** | "No agent-browser access" | Explicit "Run via Bash: agent-browser open URL" |
| **4. Step skipping** | Jumps past intermediate steps | VERIFY gate after every 2-3 steps |
| **5. Multi-step ceiling** | Reliable 3-5 steps, degrades after | Break into phases |
| **6. Parameter inference** | Fills assumptions instead of asking | State all expected values inline |
| **7. Computer use ~50%** | May click wrong elements | Build retry into click sequences |
| **8. Context drift** | Loses earlier instructions | Repeat critical facts in each phase |
| **9. Screenshot confusion** | CAN see images but may claim it can't | "You CAN see images. Describe what you see." |
| **10. Give-up behavior** | Concludes "not possible" instead of troubleshooting | Troubleshooting IF/THEN sections |

---

## Screenshot vs Snapshot Strategy

**Use `snapshot -i` (interactive elements only) for DATA GATHERING:**
- 93% less context than full tree
- Extracts buttons, links, inputs for verification
- Fast, cheap, reliable for mechanical checks

**Use `screenshot` ONLY for evidence files:**
- Creates permanent artifact for review
- Required for visual analysis by human or Opus
- Necessary for bug reports and documentation

**When Haiku must interpret a screenshot:**
- Add: "You CAN see this image. Count elements. Read text. Describe what you see."
- Provide expected values: "You should see 3 cards with titles DEMO, FORMAT, AI SUMMARY"
- For complex visual analysis, prefer Sonnet or Opus

---

## Optimal Task Sizing

**Per Phase:**
- 3-5 steps per phase (Haiku's reliable range)
- Each step has VERIFY gate with expected result
- Phase ends with: "Report Phase N findings via SendMessage before proceeding to Phase N+1"

**Per Agent:**
- Max 3-4 phases per agent (15-20 steps total with gates)
- If a task needs 20+ steps, split across 2 agents or use Sonnet

**Phase Gating Pattern:**
```
=== PHASE 1: SETUP (steps 1-4) ===
1. [action] — VERIFY: [expected result]. If not, [recovery].
2. [action] — VERIFY: [expected result].
3-4. [more steps]
Report Phase 1 status before proceeding.

=== PHASE 2: TEST (steps 5-9) ===
5-9. [test steps with VERIFY gates]
Report Phase 2 findings before proceeding.
```

---

## What Works (Proven Patterns)

**Structural Elements:**
- **Numbered steps with VERIFY gates every 2-3 steps**
- **Expected outputs stated inline** ("you should see X" or "Expected: GENERATING SUMMARY")
- **Exact CSS selectors, exact button text, exact element locations** (e.g., `.op-card`, `.demo-btn`, `.op-card-title`)
- **Decision trees for failure recovery** ("If X, do Y. If Y fails, do Z.")
- **Short prompts** — every word must earn its place
- **"DO NOT" instructions for known failure modes** (e.g., "DO NOT claim Electron-only")
- **Spatial directions** ("scroll UP", "look at the TOP of the page") — Haiku does NOT explore viewport on its own
- **"CRITICAL FACTS" preamble** to prevent known give-up behaviors ("Cards have been PROVEN to render")
- **Troubleshooting sections with IF/THEN recovery steps** prevent giving up
- **Expected values inline** give Haiku a reference to compare against
- **Explicit tool commands** ("Run via Bash: `agent-browser open http://localhost:5173`")

**Tone and Language:**
- Directive, not suggestive ("Click DEMO" not "Try clicking DEMO")
- Concrete, not abstract ("Scroll UP to top of page" not "Find the cards")
- Anticipatory, not reactive (state expected results BEFORE each step)

---

## What Fails (Anti-Patterns)

**Structural Anti-Patterns:**
- Abstract instructions ("find the panel", "locate the buttons")
- Open-ended troubleshooting ("if something goes wrong, investigate")
- Prompts written for Opus/Sonnet level reasoning
- Assuming it will explore or try alternatives on its own
- Trusting its self-reported blockers without verification
- May claim "no agent-browser access" even when tool exists — lead must correct immediately via message

**Cognitive Overload:**
- More than 5 sequential steps without a gate
- Complex conditional logic without explicit IF/THEN
- Assuming context from earlier in the prompt (repeat critical facts)

---

## Prompt Template (Browser Testing — Proven in v5)

```
CRITICAL FACTS (read first):
- [Feature] has been PROVEN to work. Do NOT claim otherwise.
- [Elements] appear at [EXACT LOCATION]. Scroll [DIRECTION] to see them.
- Do NOT give up. If you can't find something, troubleshoot — don't conclude it's broken.
- You CAN see images. Describe what you see in screenshots.
- Run agent-browser via Bash: `agent-browser open http://localhost:5173`

=== PHASE 1: SETUP (steps 1-4) ===
1. Start dev server verification
   Run: `netstat -ano | findstr LISTENING | findstr :5173`
   VERIFY: Output shows LISTENING. If not, STOP and report.

2. Open application
   Run via Bash: `agent-browser open http://localhost:5173`
   VERIFY: Page loads. If not, check console errors and report.

3. Take baseline snapshot
   Run: `agent-browser snapshot -i`
   VERIFY: You see buttons like [EXACT BUTTON TEXT]. If not, [recovery].

4. Navigate to [FEATURE]
   Run: `agent-browser click "[CSS SELECTOR]"`
   VERIFY: [EXPECTED RESULT]. If not, scroll UP/DOWN and retry.

Report Phase 1 status via SendMessage before proceeding.

=== PHASE 2: TEST [FEATURE] (steps 5-9) ===
5. Trigger [ACTION]
   Run: `agent-browser click "[SELECTOR]"`
   VERIFY: You should see [EXACT TEXT/ELEMENT].
   SCROLL UP if not visible — cards appear at TOP of page.

6. Capture evidence
   Run: `agent-browser screenshot`
   Save to: [FILENAME].png
   VERIFY: Screenshot shows [SPECIFIC THING].

7-9. [Additional test steps with VERIFY gates]

Report Phase 2 findings via SendMessage before proceeding.

=== TROUBLESHOOTING ===
- If "no agent-browser access": You DO have access. Run via Bash: `agent-browser open URL`
- If element not found: Scroll UP to top of page first. Cards render at top.
- If click fails: Use exact selector from CRITICAL FACTS section.
- If screenshot shows nothing: Elements may be outside viewport. Scroll first.
- NEVER conclude a feature is broken. Report what you DO see and ask for guidance.
```

---

## Cost Optimization

**Pricing Structure:**
- **Base:** $1 input, $5 output per MTok
- **Batch API:** 50% off ($0.50/$2.50) for non-time-sensitive tasks
- **Prompt caching:** $0.10/MTok for cache reads (10x cheaper than base input)
- **Image cost:** ~$0.0013 per 1000×1000 image

**Cost-Effective Patterns:**
- Use `snapshot -i` instead of full tree (93% smaller)
- Use screenshot only for evidence files (not for every step)
- Leverage prompt caching for repetitive prompts across agents
- Use Batch API for bulk verification tasks
- A typical agent-browser session with text snapshots costs pennies

**When Cost Matters Most:**
- Parallel verification across 10+ agents
- Bulk code exploration tasks
- Repetitive test runs during development
- Non-time-sensitive research or analysis

---

## Haiku as Verification Layer

**Opus confirms infrastructure → Haiku executes bulk tests:**
- Use Opus for narrow confirmation test (1-2 agents, 5 minutes, high confidence)
- If Opus confirms feature works, spawn Haiku team with explicit prompts (10+ agents, parallel execution, cost-effective)
- Proven pattern from 2026-02-14: Opus confirmed cards render → Haiku v5 completed 12+ tests successfully

**Haiku validates Sonnet findings:**
- Sonnet finds issues during review
- Haiku verifies each finding with explicit steps (cheaper, faster for mechanical checks)
- Proven pattern from 2026-02-14: Haiku validated 6 of Sonnet's 12 findings

---

## Lead Correction Protocol

**When Haiku claims tool unavailability:**
1. DO NOT accept claim without verification
2. Run `which agent-browser` or equivalent tool check
3. If tool exists, send message to agent: "You DO have access to agent-browser. Run via Bash: `agent-browser open http://localhost:5173`"
4. Haiku will immediately correct and proceed (proven in v5 — Blue agent)

**When Haiku gives up:**
1. Check if CRITICAL FACTS preamble exists in prompt
2. Check if troubleshooting section exists
3. If missing, add and respawn
4. If present, send message: "Feature has been PROVEN to work. Report what you DO see, do not conclude broken."

---

## Run Log

| Date | Team | Task | Result | Lesson |
|------|------|------|--------|--------|
| 2026-02-14 | haiku-adversarial-v3 | Browser test op cards | FAILED — all 3 agents claimed "Electron-only" | Prompts too abstract, no verification gates, no scroll instructions, no "DO NOT give up" preambles. |
| 2026-02-14 | haiku-adversarial-v5 | Browser test op cards (retry) | SUCCESS — 12+ tests completed, 1 CRITICAL bug found | v5 prompt improvements worked. CRITICAL FACTS preamble, exact CSS selectors, VERIFY gates, SCROLL UP instructions, expected values inline, troubleshooting sections. Blue initially claimed "no agent-browser" — lead corrected immediately via message, then Blue succeeded. Green couldn't interpret screenshots (prompting issue, not capability — needed explicit "You CAN see images" instruction). Red degraded after step 10 (too many sequential steps without phase break). v3→v5: prompts rewritten with all 10 failure patterns addressed = 0 tests → 12+ tests completed. |

---

## Decision Matrix: When to Use Haiku

| Scenario | Use Haiku? | Rationale |
|----------|------------|-----------|
| Simple code search (Glob/Grep) | YES | Haiku's sweet spot — mechanical, bounded, fast |
| 3-file refactor with clear spec | YES | Within 3-5 step range with VERIFY gates |
| 10-file architectural refactor | NO | Needs Sonnet/Opus reasoning |
| Browser testing with explicit steps | YES | Proven in v5 — works with detailed prompts |
| Visual design review | NO | Use Sonnet minimum (screenshot interpretation) |
| Security audit | NO | Use Opus (too critical for Haiku's confidence failures) |
| Lead/coordinator role | NO | Use Sonnet/Opus (Haiku needs direction, can't provide it) |
| Parallel verification of 20 items | YES | Cost-effective, fast, reliable with gates |
| Complex debugging across layers | NO | Use Sonnet/Opus (needs reasoning, not sequence-following) |
| Reading 50 files to extract data | YES | Mechanical, bounded, cheap |

---

## Summary: Haiku's Niche

**Haiku is the workhorse model for bounded, mechanical tasks.** It excels when you can specify EXACTLY what to do, in what order, with explicit verification gates. It fails when you need reasoning, exploration, or recovery from ambiguity.

**The 3-5 step rule is hard:** Break tasks into phases. Gate every phase. Repeat critical facts.

**The cost advantage is real:** 3x cheaper than Sonnet, 5x cheaper than Opus. Use Haiku for bulk work, use Sonnet/Opus for judgment.

**The prompting tax is worth it:** Investing time in explicit prompts pays off in reliability and cost savings. A well-prompted Haiku team can match Sonnet output at 1/3 the cost.
