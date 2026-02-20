# Opus Prompting Guide

Real-world findings from team runs. Updated automatically after each run.

---

## Model Profile (Opus 4.6 — May 2025)

**Technical Specifications:**
- **Vision:** YES, full multimodal
- **Context window:** 200K tokens (1M beta available for extended analysis)
- **Max output:** 128K tokens (2x Haiku/Sonnet)
- **Extended thinking:** YES + Adaptive thinking (unique to Opus)
- **Tool use:** Full support, same API as all models
- **Agent-browser:** Fully supported with highest reliability
- **Speed:** Moderate (slowest of the 3 models)
- **Cost:** $5/$25 per MTok (5x Haiku, ~3x Sonnet)
- **SWE-bench:** 80.9% (highest of all Claude models)
- **Knowledge cutoff:** May 2025 | Training cutoff: Aug 2025

**Behavioral Characteristics:**
- Can improvise, explore, and recover from ambiguity
- Tends to over-engineer or over-explain when given simple tasks
- Excels at synthesis across many files or complex contexts
- Best judgment for architectural and security decisions
- Will deviate from rigid step-by-step if it sees a "better" approach
- Adaptive thinking allows deeper reasoning on complex problems

---

## Where Opus SUCCEEDS (Use It Here)

**Ideal Use Cases:**
- **Lead/orchestrator for agent teams** — judgment across multiple agent outputs
- **Plan creation and architecture design** — synthesis of complex requirements
- **Security audits and deep analysis** — cannot afford to miss critical issues
- **Complex debugging across multiple layers** — root cause analysis requiring deep reasoning
- **Verification/confirmation of other agents' work** — final quality gate
- **Tasks requiring 15+ step reasoning** — well beyond Haiku/Sonnet reliable range
- **Writing comprehensive documentation/reports** — synthesis + clarity
- **Complex multi-file integration decisions** — architectural implications
- **Narrow confirmation tests before deploying cheaper models** — validate infrastructure first

**When to Choose Opus Over Sonnet:**
- Task requires deep architectural reasoning (not just implementation)
- Security or safety implications exist (cannot afford wrong conclusions)
- Task is open-ended and requires judgment (not well-scoped execution)
- Task requires synthesizing information across 10+ files
- Task is a one-shot with no retry budget (must be right first time)
- You need a final verification layer after Sonnet/Haiku work

**When to Choose Opus Over Haiku:**
- Task requires any reasoning beyond mechanical execution
- Task has ambiguity or requires exploration
- Task is critical (security, architecture, complex debugging)
- Task requires judgment or synthesis
- Task needs to recover from unexpected conditions

---

## Where Opus FAILS (Don't Use It Here)

**Anti-Patterns:**
- Simple mechanical tasks (wasteful at 5x Haiku cost)
- Tasks with rigid output formats (Opus adds commentary and "improvements")
- Being told exactly what to do step-by-step (will deviate to "improve")
- High-volume parallel tasks (too slow and expensive)
- Tasks where speed matters more than quality
- Well-scoped tasks with clear specs that Sonnet could handle

**Cost Traps:**
- Using Opus for bulk verification (use Haiku with explicit prompts instead)
- Using Opus for simple browser clicks (use Haiku with VERIFY gates)
- Using Opus when you haven't tried Sonnet first (unless critical)
- Using Opus for every implementation task (use for architecture, Sonnet for execution)

---

## When to Use Opus (Decision Framework)

**Use Opus when:**
- You need certainty and can't afford wrong conclusions
- The task requires synthesizing information across 10+ files
- You need a narrow confirmation test before deploying cheaper models (proven pattern)
- Security or architectural implications exist
- The task is a one-shot (no retry budget)
- Task requires lead-level judgment across multiple agent outputs

**Don't use Opus when:**
- Task is mechanical and well-specified (use Haiku)
- Task is well-scoped implementation with clear spec (use Sonnet)
- Cost is a primary concern and task doesn't require deep reasoning
- Speed matters more than depth (use Sonnet/Haiku)
- Task is repetitive or template-based (use Haiku)

---

## Opus as Verification Layer

**Pattern 1: Narrow Confirmation Before Bulk Deployment**
Proven in 2026-02-14 session:

```
Problem: Need to test feature across many scenarios
Risk: If infrastructure broken, entire Haiku team fails
Solution: Opus confirms infrastructure works FIRST (1-2 agents, 5 minutes)
Then: Deploy Haiku team with confidence (10+ agents, cost-effective)

Example:
- Opus confirmed Operation Feedback cards render in Vite (12 tool uses, 101s)
- THEN haiku-adversarial-v5 launched with explicit prompts
- Result: Haiku succeeded, completed 12+ tests, found 1 CRITICAL bug
```

**Cost justification:**
- Opus confirmation: ~$0.50 (5 minutes, narrow scope)
- Failed Haiku team: ~$2-5 (wasted tokens, retries, debugging)
- ROI: 4-10x return on Opus pre-check investment

**Sonnet as middle ground for browser testing:** The 2026-02-14 Sonnet test validates Sonnet as a viable middle ground between Opus confirmation and Haiku bulk execution. For browser testing specifically, Sonnet may be more cost-effective than Haiku when factoring in prompt engineering time. Sonnet requires 40-line goal-oriented prompts vs Haiku's 180-line step-by-step prompts (78% reduction), while maintaining equivalent test coverage and autonomous navigation capabilities.

**Pattern 2: Opus Interprets Complex Screenshots for Haiku**
When Haiku struggles with visual interpretation:

```
Haiku: Takes screenshot but can't interpret complex visual state
Opus: Receives screenshot, analyzes, returns structured findings
Haiku: Uses Opus findings to continue mechanical testing

Cost trade-off:
- Haiku interprets: May fail, requires retry, wastes time
- Opus interprets: Higher per-interpretation cost but single-pass success
```

**Pattern 3: Opus as Final Quality Gate**
After Sonnet implementation:

```
Sonnet: Completes implementation (cost-effective, fast)
Sonnet: Self-verification (tests own work)
Opus: Reviews Sonnet's work (only if critical or complex)

When to skip Opus gate:
- Task is low-risk (UI polish, refactoring with tests)
- Sonnet self-verification passed with high confidence
- Time/cost constraints exist

When Opus gate is mandatory:
- Security implications
- Architectural changes affecting multiple systems
- Complex integration with external dependencies
- No test coverage exists
```

---

## What Works (Proven Patterns)

**Structural Elements:**
- High-level objectives with room for judgment
- Complex multi-step reasoning tasks
- Tasks requiring synthesis across many files
- Verification/confirmation of other agents' work
- Can handle vague instructions and still produce good results
- "CONTEXT → OBJECTIVE → CONSTRAINTS → DELIVERABLE" structure

**Tone and Language:**
- High-level and goal-oriented, not step-by-step
- Allow room for exploration and judgment
- Specify outcomes and constraints, not exact steps
- Trust Opus to find the best path

**Effective Prompt Patterns:**
- State the problem, not the solution
- Define success criteria, not exact steps
- Provide context and constraints
- Specify deliverable format to control over-explanation tendency
- Use Opus for "what should we do?" not "do these 10 steps"

---

## What Fails (Anti-Patterns)

**Structural Anti-Patterns:**
- Simple mechanical tasks (wasteful — use Haiku or Sonnet)
- Tasks with rigid output formats (Opus adds extra commentary)
- Being told exactly what to do step-by-step (it will deviate to "improve" the approach)
- Tasks where you need speed more than depth
- High-volume parallel tasks (too slow, too expensive)

**Prompt Anti-Patterns:**
- Over-specifying the approach (Opus will deviate anyway)
- Using Opus for tasks Sonnet could handle (3x cost increase)
- Using Opus without trying cheaper models first (unless critical)
- Asking for rigid output format then getting frustrated when Opus adds context

---

## Prompt Template (General Purpose)

```
CONTEXT:
- [situation and what we know]
- [prior attempts, if any]
- [constraints: time, scope, risk tolerance]

OBJECTIVE:
- [what needs to be determined/done]
- [why this matters (helps Opus prioritize)]

CONSTRAINTS:
- [boundaries: what's in scope, what's out of scope]
- [time limits, if any]
- [risk tolerance: can we retry, or must we get it right first time?]

DELIVERABLE:
- [exact output format]
- [required sections/structure]
- [target audience: technical depth, length]
```

---

## Prompt Template (Narrow Confirmation Test)

```
CONTEXT:
- About to deploy [N] Haiku agents to test [feature]
- Risk: If infrastructure broken, all agents fail
- Need: Quick confirmation that infrastructure works

OBJECTIVE:
Confirm [feature] renders/functions correctly in current environment.

CONSTRAINTS:
- Time: 5 minutes max
- Scope: ONLY infrastructure validation, not exhaustive testing
- Evidence: Screenshot + snapshot showing [specific elements]

DELIVERABLE:
PASS/FAIL determination with evidence.
- PASS = Feature confirmed working, proceed with Haiku deployment
- FAIL = Infrastructure issue found, details for debugging

SUCCESS CRITERIA:
[Specific elements that must be present/functional]
```

**Proven in 2026-02-14:** This pattern validated infrastructure before haiku-adversarial-v5, enabling Haiku team success.

---

## Prompt Template (Architectural Review)

```
CONTEXT:
- [describe system/codebase]
- [proposed change or decision]
- [what's driving this: user request, tech debt, refactor]

OBJECTIVE:
Review [proposed approach] for architectural soundness.

REVIEW THROUGH THESE LENSES:
1. Integration: How does this affect existing systems?
2. Maintainability: Future developer burden?
3. Performance: Bottlenecks or scale issues?
4. Security: New attack surface or vulnerabilities?
5. Alternatives: Better approaches we haven't considered?

CONSTRAINTS:
- In scope: [what to review]
- Out of scope: [what NOT to review]
- Time: [is this urgent or can we take time to explore?]

DELIVERABLE:
- RECOMMENDATION: Approve / Approve with changes / Reject
- REASONING: Why? (synthesis across all 5 lenses)
- RISKS: What could go wrong if we proceed?
- ALTERNATIVES: If rejecting, what instead?
```

---

## Opus for Lead/Orchestrator Role

**Why Opus for Lead:**
- Can synthesize outputs from multiple agents
- Can make judgment calls when agents disagree
- Can adapt plans when unexpected issues arise
- Can write comprehensive reports from disparate findings

**Effective Lead Prompts:**
```
CONTEXT:
- Leading a team of [N] agents working on [task]
- Agents: [list with brief role descriptions]
- Timeline: [how long do we have?]

YOUR ROLE:
- Coordinate agent work (spawn, assign, monitor)
- Resolve conflicts when agents disagree
- Make judgment calls on blockers
- Compile final deliverable from agent outputs

DELIVERABLE:
[Final report/implementation/decision that synthesizes all agent work]

CONSTRAINTS:
- Delegate execution to agents (don't do the work yourself)
- Use cheapest viable model for each task (Haiku where possible)
- Monitor for diminishing returns (stop team if stalled)
```

**Cost management as lead:**
- Spawn Haiku for mechanical tasks (exploration, simple verification)
- Spawn Sonnet for implementation and moderate complexity
- Spawn Opus only for critical judgment or verification
- Monitor team cost and shut down if exceeding budget

---

## Cost Optimization (When Using Opus)

**Pricing Structure:**
- **Base:** $5 input, $25 output per MTok
- **Batch API:** 50% off ($2.50/$12.50) for non-time-sensitive tasks
- **Prompt caching:** $0.50/MTok for cache reads (10x cheaper than base input)

**Cost-Effective Patterns:**
- Use Opus for narrow confirmation, then deploy Haiku (proven ROI)
- Use prompt caching for repetitive architectural reviews
- Use Batch API for non-urgent deep analysis
- Limit Opus output length with explicit deliverable constraints
- Use Opus for judgment, not execution (execution = Sonnet/Haiku)

**Cost Traps to Avoid:**
- Using Opus for bulk testing (use Haiku with explicit prompts)
- Using Opus for simple verification (use Sonnet or well-prompted Haiku)
- Using Opus as default without trying cheaper models first
- Letting Opus over-explain when a short answer would suffice

**When Opus Cost is Justified:**
- Security-critical decisions (cost of breach >> cost of Opus review)
- Architectural decisions affecting months of work (cost of wrong decision >> cost of Opus analysis)
- One-shot critical tasks (cost of retry >> cost of Opus first-time-right)
- Lead role for complex teams (cost of failed coordination >> cost of Opus orchestration)

---

## Run Log

| Date | Team | Task | Result | Lesson |
|------|------|------|--------|--------|
| 2026-02-14 | solo | Confirm cards render in Vite | SUCCESS — confirmed in 12 tool uses, 101s | Opus reliable for narrow confirmation tests. Found exact card text and behavior. This test validated infrastructure before haiku-adversarial-v5 launched, enabling Haiku team success. Pattern proven: Opus confirms infrastructure (5 min, $0.50) → Haiku executes bulk tests (cost-effective, reliable). ROI: 4-10x return on Opus pre-check. |

---

## Decision Matrix: When to Use Opus

| Scenario | Use Opus? | Rationale |
|----------|------------|-----------|
| Lead agent for complex team | YES | Judgment across agents requires Opus-level synthesis |
| Architectural review | YES | Deep reasoning, synthesis, risk analysis = Opus strength |
| Security audit | YES | Cannot afford to miss issues — Opus reliability critical |
| Plan creation | YES | Synthesis of requirements, judgment on approach |
| Complex debugging (unknown root cause) | YES | Deep multi-layer reasoning required |
| Simple code search | NO | Wasteful — use Haiku (5x cheaper, just as effective) |
| Well-scoped implementation | NO | Use Sonnet (3x cheaper, fast enough) |
| Bulk verification | NO | Use Haiku with explicit prompts (5x cheaper) |
| Narrow confirmation before Haiku deploy | YES | Proven ROI — validates infrastructure, enables bulk deployment |
| Final verification after Sonnet work | MAYBE | If critical/complex: YES. If low-risk: Sonnet self-verify sufficient. |
| Screenshot interpretation for Haiku | MAYBE | If Haiku struggling: YES. If simple visual check: Sonnet sufficient. |
| Writing comprehensive report | YES | Synthesis + clarity = Opus strength |
| Post-run transcript analysis | NO | Use Sonnet (fast enough, cheap enough, capable enough) |

---

## Summary: Opus's Niche

**Opus is the expert consultant for critical decisions and complex synthesis.** Use it when you need certainty, depth, or judgment across complex contexts. Don't use it for tasks Sonnet or Haiku can handle.

**The narrow confirmation pattern is proven:** Opus validates infrastructure (5 min, low cost) → enables confident deployment of cheaper models (high ROI).

**The lead role is natural:** Opus excels at coordinating, synthesizing, and making judgment calls across agent outputs.

**The cost is justified when the stakes are high:** Security, architecture, one-shot critical tasks, complex debugging. In these scenarios, the cost of getting it wrong >> the cost of Opus getting it right.

**The over-explanation tendency is real:** Control it with explicit deliverable constraints. "In 200 words or less" or "Bullet points only" can save significant output costs.

**The adaptive thinking advantage:** Unique to Opus, enables deeper reasoning on complex problems. Use it when you need Opus to "think harder" about genuinely difficult questions.
