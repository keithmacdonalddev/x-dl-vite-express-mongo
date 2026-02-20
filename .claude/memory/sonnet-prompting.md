# Sonnet Prompting Guide

Evidence-backed strategy for deploying Sonnet 4.5 in agent workflows. Updated from research 2026-02-14.

---

## 1. Model Profile (Sonnet 4.5)

### Technical Specifications

**Context & Output:**
- **Context window:** 200K tokens (default), 1M tokens available for tier 4 organizations
- **Output capacity:** 64K tokens (2x useful for rich code generation and planning)
- **Extended thinking:** YES — interleaved thinking allows reasoning between tool calls
- **Context awareness:** Tracks remaining window and receives updates after each tool call

**Capabilities:**
- **Vision:** Full multimodal — charts, diagrams, screenshots, UI analysis
- **Tool use:** Superior tool selection and error correction
- **Computer use:** 61.4% OSWorld benchmark (best in class as of Sept 2025)
- **Agent-browser:** Fully supported with strong performance

**Performance:**
- **SWE-bench Verified:** 77.2% standard / 82.0% with parallel compute
- **Speed:** Faster than Opus, slower than Haiku (4-5x slower than Haiku)
- **Cost:** $3 input / $15 output per MTok (3x Haiku, 1/3 Opus)

**Knowledge cutoff:** January 2025 | **Training cutoff:** July 2025

### Behavioral Characteristics

**Strengths:**
- Can maintain focus for 30+ hours on complex tasks
- Handles 7-10 step reasoning sequences reliably
- Strong multi-file editing and integration coordination
- Interprets screenshots without extensive prompting (unlike Haiku)
- Recovers from moderate ambiguity with guardrails
- Excels at cross-agent collaboration and synthesis

**Weaknesses:**
- **Context anxiety** — takes shortcuts when it believes it's running out of space (even with room left)
- **Scope creep** — tries to do too much at once, leading to incomplete implementations
- **Premature completion** — marks features complete without proper testing
- **Error propagation** — doesn't consistently self-correct; compounds errors in multi-step workflows
- **Instruction following** — 22-30% failure rate on frontier model benchmarks
- **Hallucination** — 48% rate (lower than competitors but significant)

### Comparison to Haiku and Opus

| Metric | Haiku 4.5 | Sonnet 4.5 | Opus 4.5 |
|--------|-----------|------------|----------|
| **SWE-bench** | 73.3% | 77.2% / 82% parallel | 80.9% |
| **Cost** | $1/$5 | $3/$15 | $5/$25 |
| **Speed** | Fastest (4-5x Sonnet) | Moderate | Slowest |
| **Reliable step range** | 3-5 steps | 7-10 steps | 15+ steps |
| **Failure mode** | Gives up (under-reaches) | Scope creep (over-reaches) | Over-engineers |
| **Vision strength** | Needs explicit prompting | Can interpret without hand-holding | Strongest interpretation |
| **Best for** | Mechanical tasks | Implementation & review | Architecture & security |

**Recommended hybrid workflow:**
1. Sonnet creates plan and breaks into subtasks
2. Multiple Haiku instances execute subtasks in parallel
3. Sonnet integrates results and validates

---

## 2. Sonnet's Sweet Spot

### Task Types Where Sonnet is OPTIMAL

**Implementation:**
- Multi-file changes (3-5 files) with clear integration points
- Refactoring with moderate complexity
- Debugging requiring 7-10 step reasoning chains
- Feature development with cross-boundary coordination

**Review:**
- Code quality audits (5-10 files)
- Visual UI/UX review via agent-browser
- Integration verification across IPC/Redux/component boundaries
- Monitor agent role (proven: 100% true positive rate in 2026-02-07 run)

**Testing:**
- Agent-browser functional testing with visual analysis
- Screenshot interpretation and comparison
- Lifecycle verification (timers, state, cleanup)
- Responsive design testing across breakpoints

**Coordination:**
- Cross-agent synthesis (proven: styles agent sent 8 messages, 100% useful)
- Plan-to-implementation verification
- Intent drift detection
- Report generation from distributed findings

### Complexity Ceiling

**Too simple for Sonnet (use Haiku):**
- Mechanical file operations (glob, grep, read)
- Line counting and inventory tasks
- Simple template-based operations
- Tasks with 3-5 steps or fewer
- Cost-sensitive bulk operations

**Too complex for Sonnet (use Opus):**
- Security-critical analysis
- Architectural decisions across 10+ files
- Lead/orchestrator for complex teams
- One-shot critical decisions with no retry budget
- Tasks requiring 15+ step reasoning chains

**Sonnet's range:**
- 7-10 step reasoning sequences
- 3-5 files with integration concerns
- Moderate ambiguity with defined success criteria
- Cross-agent coordination within a team
- Implementation that needs verification, not judgment

### The 7-10 Step Reliable Range

**Evidence:** Team metrics (2026-02-06, 2026-02-07) show Sonnet completed 2-6 tasks per run with 81-100% accuracy. Haiku prompts use 5-step phases; Sonnet can handle 7-10 steps before checkpoint.

**Implication for prompts:**
- Phases should contain 7-10 steps (not Haiku's 3-5)
- Fewer phase boundaries = less prompt overhead
- Checkpoint at END of phase (not VERIFY gates every 2-3 steps)
- Trust Sonnet to execute longer sequences before needing confirmation

**Phase gating pattern:**
```
PHASE 1: [Goal] (7-10 steps)
STEPS:
1-7. [Actions with expected outcomes]
CHECKPOINT: [Expected state. If checkpoint fails, report and stop.]

PHASE 2: [Goal] (7-10 steps)
STEPS:
8-15. [Actions with expected outcomes]
CHECKPOINT: [Expected state.]
```

### File Count Limits

**Reliable range:** 3-5 files with clear relationships
**Warning zone:** 6-9 files (may miss integration points)
**Use Opus instead:** 10+ files or complex dependency chains

**From team metrics:** Components agent (2026-02-07) touched 4 files, completed in 8 minutes. Styles agent touched 2 files with cross-boundary messaging to 4 other agents. Both succeeded first-pass.

---

## 3. Known Failure Patterns (Sonnet-Specific)

### Failure 1: Context Anxiety

**Trigger:** When Sonnet believes it's running out of context (even with capacity remaining)

**Symptoms:**
- Takes shortcuts and leaves tasks incomplete
- Rushes through final steps without verification
- Marks features complete prematurely
- Quality degradation in later phases

**Root cause:** Sonnet exhibits "context anxiety" — underestimates remaining tokens with remarkable precision and panics, even when 50K+ tokens remain.

**Workaround (from Cognition AI):**
- Enable 1M token context window if available
- Cap actual usage at 200K
- Model believes it has plenty of runway, eliminates anxiety

**Prompt mitigation:**
```
CRITICAL: You have adequate context window remaining. Do not rush or take shortcuts.
Focus on completing THIS task fully before considering scope expansion.
Mark complete ONLY when all verification steps pass, not when code is written.
```

**Recovery during run:**
If Sonnet starts rushing:
- Message: "You have 150K+ tokens remaining. No need to rush. Complete verification steps."
- Break remaining work into smaller, explicitly-scoped phases
- Add explicit completion criteria (not just "when done")

**Source:** [Cognition AI devin-sonnet-4-5-lessons](https://cognition.ai/blog/devin-sonnet-4-5-lessons-and-challenges)

### Failure 2: Scope Creep (Over-Reaching)

**Trigger:** Task with adjacent work or related features visible in codebase

**Symptoms:**
- Attempts too many changes simultaneously
- Runs out of context mid-implementation
- Leaves features half-implemented and undocumented
- Marks work complete without end-to-end testing

**Root cause:** Sonnet sees related work and tries to "help" by extending scope beyond assignment.

**Prompt mitigation:**
```
SCOPE:
Complete X, Y, Z. Do NOT attempt A, B, C (even if related).
After completing your assigned task, STOP and report. Do not continue to adjacent work.

OUT OF SCOPE (explicitly prohibited):
- [List related features NOT to touch]
- [List files NOT to modify]
- [List refactorings NOT to attempt]
```

**Recovery during run:**
If Sonnet drifts:
- Message: "Task X is out of scope. Complete assigned tasks [list], then stop."
- Reassign drifted work to separate agent if legitimately valuable
- Monitor agent should flag scope drift as INTENT DRIFT (critical severity)

**Source:** [Anthropic effective-harnesses-for-long-running-agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

### Failure 3: Error Propagation

**Trigger:** Early error in multi-step sequence

**Symptoms:**
- Builds subsequent steps on faulty foundation
- Compounds initial mistake instead of self-correcting
- Confidently reports success despite broken implementation
- Fails to recognize end-to-end feature doesn't work

**Root cause:** Sonnet has superior error correction in tool use but does NOT consistently self-correct in logic/implementation. Errors propagate through workflow.

**Prompt mitigation:**
```
VERIFICATION PROTOCOL:
After each step, verify it worked before proceeding to the next step.
If you encounter an error, STOP and report — do not continue building on faulty foundation.
Test each function/component individually before integrating.

CHECKPOINTS:
[List explicit verification points with expected outcomes]
If ANY checkpoint fails, report immediately. Do not proceed.
```

**Recovery during run:**
If error detected:
- STOP agent immediately (message: "Error detected in step N. Do not proceed. Report current state.")
- Assess: Can error be fixed, or does work need to restart from earlier checkpoint?
- Monitor agent should catch error propagation as HIGH severity finding

**Source:** [Claude 4.5 Sonnet: Advanced LLM Performance](https://www.emergentmind.com/topics/claude-4-5-sonnet)

### Failure 4: Hallucination (Withholding vs Fabricating)

**Trigger:** Domain-specific work, niche technical areas, or uncertain about facts

**Symptoms:**
- **Withholding type:** Claims no access to tools, can't find files, or feature is broken (when it isn't)
- **Fabricating type:** Invents function names, API signatures, or configuration options
- **Confident incorrectness:** States wrong things with high certainty

**Rate:** 48% hallucination rate (lower than competitors but significant)

**Deliberate design:** Sonnet fails by withholding information rather than providing incorrect information (ASL-3 safety protections)

**Prompt mitigation:**
```
FACTUAL ACCURACY REQUIREMENTS:
- If you're not certain, say "I don't know" rather than guessing.
- Cite specific file paths, function names, and line numbers for all claims.
- Use grep/glob to verify facts before stating them.
- If a tool/feature seems unavailable, verify with file system check before claiming it's missing.

ASSERTIONS CHECKLIST:
Before claiming "X doesn't exist" or "Y is impossible":
1. Have I searched the codebase? (glob/grep)
2. Have I read the relevant config/documentation files?
3. Have I tested the exact command/API call?
```

**Recovery during run:**
If Sonnet claims something seems wrong:
- Ask: "Have you verified this with grep/glob? Show me the search command."
- If Sonnet says "no access to tool X," verify tool exists and correct immediately
- Monitor agent should check all factual claims against codebase

**Source:** [Claude Sonnet 4.5 vs ChatGPT 5.2: Hallucination Control](https://www.datastudios.org/post/claude-sonnet-4-5-vs-chatgpt-5-2-hallucination-control-and-fact-checking-reliability)

### Failure 5: Instruction-Following Failures

**Trigger:** Complex prompts with multiple constraints, ambiguous phrasing, or competing priorities

**Rate:** 22-30% failure rate on instruction-following tasks (frontier model benchmark)

**Symptoms:**
- Skips steps from the prompt
- Reinterprets instructions to match internal assumptions
- Prioritizes internal judgment over explicit instructions
- Delivers output in wrong format despite clear template

**Prompt mitigation:**
```
INSTRUCTIONS (follow exactly):
1. [Numbered list for steps]
2. [Bold key constraints]
3. [All steps required — do not skip]

CRITICAL CONSTRAINTS (repeat at end):
- [Repeat most important requirements]
- [Highlight non-negotiable elements]

OUTPUT FORMAT (required):
[Exact template with example]
```

**Effective patterns:**
- Use numbered lists for sequential steps
- Bold or ALL CAPS for critical constraints
- Repeat requirements at start AND end of prompt
- Provide example of correct output format
- Use "DO NOT" sparingly but for truly critical prohibitions

**Source:** [Claude 4.5 Sonnet: Advanced LLM Performance](https://www.emergentmind.com/topics/claude-4-5-sonnet)

### Failure 6: Project Rules Adherence (Context File Skimming)

**Trigger:** Project has rules files in .claude/rules/ that agents should follow

**Symptoms:**
- Violates documented coding rules despite having access to them
- Repeats known anti-patterns that are explicitly forbidden
- Seems to prioritize task instructions over project conventions
- Particularly fails with rules buried in longer documents

**Evidence:** tier4-polish run (2026-02-14)
- dashboard-page agent violated coding rule #1 (module-scope IPC calls)
- Rule was documented in .claude/rules/coding-rules.md
- Rule was listed as #1 priority (top of file)
- Agent had access to the file but didn't follow it

**Root cause:** Sonnet appears to skim context files rather than reading them thoroughly. When rules files are long (10+ rules), critical rules get buried. Task instructions receive more attention than supporting documentation.

**Prompt mitigation:**
```
CRITICAL PROJECT RULES (non-negotiable):
1. [Inline the top 3-5 rules directly in prompt — don't reference external file]
2. [Include rationale: WHY this rule matters]
3. [Include example of violation to watch for]

For this project specifically:
- NEVER call window.sessionViewer at module scope (causes undefined errors)
- ALWAYS call it inside thunk payload creators
- BAD: const api = window.sessionViewer; export const thunk = () => api.method()
- GOOD: export const thunk = () => { const api = window.sessionViewer; return api.method(); }
```

**Recovery during run:**
- Cleanup agent pattern: Spawn a review agent after teammates finish to catch rule violations
- Monitor agent: Include "pattern compliance" as explicit check category
- If violation found: Fix immediately, update future agent prompts with inline rule

**Lesson learned:** Don't rely on .claude/rules/ files alone for critical patterns. Inline the top 3-5 project-specific rules directly in agent prompts. Treat rules files as reference documentation, not primary instructions.

**Source:** tier4-polish team run, 2026-02-14

---

## 4. What Works (Evidence-Backed Patterns)

### Implementation Tasks

**Run: fix-remaining-backlog (2026-02-07) — 5 Sonnet agents**

**Pattern:** Clear task scopes with integration boundaries messaged across agents

**Evidence:**
- Backend agent: 6/6 tasks, 7 fixes (sanitize, cache, async, handles), 5 messages sent
- Frontend agent: 3/3 tasks, 20 thunks + selector + lazy-load, 3 messages
- Components agent: 4/4 tasks, ~100 inline styles removed, 4 messages, FASTEST (8 min)
- Styles agent: 2/2 tasks, ~25 utility classes, 16 token migrations, 8 messages (highest messaging rate)
- Docs agent: 2/2 tasks, 4 CLAUDE.md files updated

**What worked:**
- File ownership (no conflicts)
- Cross-agent messaging (styles → components handoff seamless)
- 2-6 tasks per agent (aligned with 7-10 step reliable range)
- Zero rework needed (all passed first verification)

**Lesson:** Sonnet excels at implementation when:
- Tasks are scoped to 2-6 units (files, features, fixes)
- Integration boundaries are explicit
- Agents message each other when handing off
- Monitor agent runs in parallel (caught 7 issues, 0 false positives)

### Code Review Tasks

**Run: Full Project Audit (2026-02-06) — 4 Sonnet agents (security, code, design, docs)**

**Pattern:** Domain-scoped audits with adversarial framing

**Evidence:**
- Security agent (Sonnet): 2 CRITICAL, 5 HIGH, 5 MEDIUM, 8 positive — attack chain tracing
- Code agent (Sonnet): 12 HIGH, 8 MEDIUM, 6 LOW, 10 positive — main.cjs, preload, state mgmt
- Design agent (Sonnet): 115+ inline styles, 7 off-scale fonts, 52 violations, 6 positive
- Docs agent (Sonnet): 22 inaccuracies, 2 critical arch errors, 4 positive

**Aggregate:** 87 findings, 0 false positives

**What worked:**
- Domain scoping (security / code / design / docs never overlapped)
- Adversarial framing ("find what's wrong")
- File:line references for every finding
- Positive findings documented (not just problems)

**Lesson:** Sonnet review is highly accurate (0% false positive in read-only audits) when:
- Scope is clear (which domain, which files)
- Framing is adversarial ("What's wrong?" not "Is this okay?")
- Output format requires evidence (file:line:finding)

### Agent-Browser Visual Testing

**Run: sonnet-adversarial (2026-02-13) — Browser test operation cards**

**Result:** Found 12 real findings via agent-browser

**What worked:**
- Sonnet interpreted screenshots without "You CAN see images" preamble (unlike Haiku)
- Visual analysis identified UX issues (labels, timing, hierarchy)
- Found lifecycle bugs (cards not clearing on navigation)
- Provided concrete evidence (screenshots + descriptions)

**Validation:** Haiku v5 validated 6 of Sonnet's 12 findings (50% independently reproduced)

**Lesson:** Sonnet agent-browser testing succeeds with:
- Goal-oriented test structure (not step-by-step like Haiku)
- Screenshot evidence captured at state transitions
- Visual analysis trusted (Sonnet doesn't need hand-holding)
- Lifecycle verification (start → progress → complete → cleanup)

### Monitor Agent Role

**Run: fix-remaining-backlog (2026-02-07) — 1 Sonnet monitor**

**Result:** 7 issues found, 0 false positives (100% true positive rate)

**Pattern:** Monitor runs in parallel, checks implementation agent output

**What the monitor caught:**
- Integration boundaries (data shape mismatches)
- Missing cleanup (timer lifecycle)
- State wiring errors
- Pattern violations (error handling)

**What worked:**
- Running in parallel with implementation (not post-completion)
- Adversarial framing ("No code is perfect. Find the issues.")
- Checking categories: integration, cleanup, state, patterns
- Reporting with file:line evidence

**Lesson:** Sonnet monitor is a proven sweet spot. Launch alongside implementation agents, not after.

### Self-Organization and Task Claiming

**Run: tier4-polish (2026-02-14) — 4 Sonnet agents**

**Result:** css-polish agent autonomously claimed verification task from task list after completing assigned work

**Pattern:** Teammate self-claiming from shared task list (without lead intervention)

**What worked:**
- Agent completed assigned CSS polish tasks first
- Checked task list for next available unblocked task
- Claimed verification task autonomously
- Executed agent-browser visual verification
- Captured screenshot evidence
- Reported completion

**Lesson:** Sonnet can self-organize within teams when:
- Task list is visible and accessible
- Tasks have clear ownership rules ("unassigned" vs "assigned")
- Agents are prompted to check task list after completing work
- No competing claims (first to claim wins)

**Prompt pattern that enables this:**
```
After completing your assigned tasks:
1. Check the task list for unassigned, unblocked tasks
2. Claim the next task that matches your skillset
3. Execute and report completion
4. Repeat until no tasks remain or you're blocked
```

**Benefit:** Reduces lead overhead. Agents keep themselves busy instead of going idle while waiting for next assignment.

### Correct Restraint (Saying "No Changes Needed")

**Run: tier4-polish (2026-02-14) — commandstrip-audit agent**

**Result:** Correctly determined no changes needed for CommandStrip component

**Pattern:** Agent investigated, analyzed, and recommended NO action

**What worked:**
- Assigned to audit CommandStrip for needed updates
- Traced rendering paths
- Identified component as dead code (not rendered in new navigation model)
- Concluded no changes needed
- Reported decision with evidence
- Did NOT make unnecessary modifications

**Lesson:** Sonnet can show restraint and say "no work needed" when:
- Task is framed as investigation/audit (not implementation mandate)
- Agent is trusted to make judgment call
- Reporting format allows "no changes" as valid conclusion

**Anti-pattern to avoid:**
- Framing tasks as "Implement X" when investigation is needed
- Implying agent MUST make changes to be successful
- Rejecting "no changes" reports without reviewing evidence

**Benefit:** Prevents unnecessary code churn. Trust Sonnet to say "this is fine as-is" when evidence supports it.

### Cleanup Agent Pattern (Post-Team Cross-Cutting Review)

**Run: tier4-polish (2026-02-14) — cleanup agent after 4 teammates finished**

**Result:** Caught module-scope IPC violation that individual agents missed

**Pattern:** Spawn a single review agent AFTER teammates complete to catch cross-cutting issues

**What worked:**
- 4 teammates worked in parallel on different files
- Each teammate stayed in file ownership boundaries (no conflicts)
- After all teammates reported completion, spawned cleanup agent
- Cleanup agent read ALL modified files with fresh eyes
- Found violation of coding rule #1 (module-scope sessionViewer call)
- Fixed violation immediately

**Why cleanup agent succeeds where teammates don't:**
- Cross-cutting view: Sees all changes together, not just individual files
- Fresh context: No anchoring bias from writing the code
- Explicit mission: "Find what we missed" (adversarial framing)
- Pattern compliance focus: Checks against project rules, not just task completion

**When to use cleanup agent:**
- After parallel team completes work
- When project has critical rules (security, architecture, conventions)
- Before final build/merge
- When individual agents have narrow file ownership

**Prompt for cleanup agent:**
```
OBJECTIVE: Cross-cutting review of ALL changes from [team name] run.

TEAMMATES MODIFIED:
- [List of modified files]

CHECK FOR:
1. Project rule violations (inline top 3-5 critical rules)
2. Cross-file integration issues (data shape mismatches)
3. Missing imports/exports
4. Pattern inconsistencies across files
5. Security issues introduced

ADVERSARIAL REQUIREMENT:
The team missed something. Find it.
```

**Cost:** ~5-10 minutes, 1 Sonnet agent (small overhead for high-value catch)

**Benefit:** Catches 5-15% of issues that slip through individual agent verification. Particularly effective for project-specific rules that agents tend to skip.

---

## 5. What Fails (Evidence-Backed Anti-Patterns)

### Over-Prompting Sonnet (Wasted Effort)

**Anti-pattern:** Using Haiku-style prompts for Sonnet

**What Sonnet does NOT need (unlike Haiku):**
1. **Explicit tool syntax** — "Run via Bash: agent-browser open URL" → Sonnet infers tool usage
2. **VERIFY gates every 2-3 steps** — Sonnet's 7-10 step range allows checkpoint gating instead
3. **Repeated spatial directions** — "SCROLL UP" after every step → State once, Sonnet navigates
4. **CRITICAL FACTS preamble** — Haiku needs authority to prevent give-up; Sonnet recovers from ambiguity
5. **Redundant context repetition** — Sonnet maintains context across longer prompts
6. **"You CAN see images" assertions** — Sonnet interprets screenshots by default

**Cost of over-prompting:** 30-40% longer prompts, wasted tokens, constrained reasoning

**Right-sizing for Sonnet:**
- Haiku prompt: ~180-200 lines (50% guardrails, 50% task)
- Sonnet prompt: ~100-130 lines (10-15% guardrails, 85-90% task)
- Focus on objectives, success criteria, and evidence requirements (not step-by-step commands)

### Using Sonnet for Tasks Haiku Can Handle

**Anti-pattern:** Default to Sonnet for all work without task assessment

**Evidence from team metrics:**
- Agent 4 (line counting): Sonnet was "adequate" but Haiku would suffice (mechanical task)
- Cost: $3/$15 vs $1/$5 (3x waste for no quality gain)

**Decision framework:**
- Task has 3-5 steps or fewer? → Haiku
- Task is mechanical (file ops, counts, template work)? → Haiku
- Task needs 6-10 steps of reasoning? → Sonnet
- Task has visual interpretation? → Sonnet
- Task has cross-agent coordination? → Sonnet

### Code Reading Alone for Behavioral Verification

**Anti-pattern:** Assuming Sonnet can verify runtime behavior by reading code

**Evidence: confidence-failures.md Failure #2 (2026-02-06)**
- 3-Sonnet adversarial review missed 4 bugs requiring runtime testing:
  1. Task-audit timers never canceled (lifecycle)
  2. Resync progress state dead (state wiring)
  3. Schema scan failures treated as success (error propagation)
  4. main.cjs.bak shipped (packaging)

**Engineer quote:** "AI agents ask: 'Does this code EXIST correctly?' (structure, imports, types). Engineer asks: 'Does this code BEHAVE correctly?' (runtime flows, state transitions)."

**Agent-browser ceiling:** Code reading alone = 80% ceiling (model-independent)

**Lesson:** Sonnet needs agent-browser verification JUST LIKE HAIKU. Runtime testing is mandatory for:
- Timer lifecycle
- State machine wiring
- Error propagation paths
- End-to-end feature flows

### Adversarial Review Without Verification

**Anti-pattern:** Trusting Sonnet adversarial findings at face value

**Evidence: 3-Sonnet review (date unspecified)**
- 26 findings total
- 21 true positives (81%)
- 5 false positives (19%)

**Lesson:** When Sonnet operates adversarially ("find what's wrong"), false positive rate rises to ~20%. Second-pass verification needed for HIGH/CRITICAL findings.

**Mitigation:**
- Run second Sonnet agent to verify CRITICAL/HIGH findings
- Use Haiku for mechanical verification ("does this grep match exist?")
- Monitor agent pattern: implementation + monitor in parallel (monitor = 100% accuracy in controlled scope)

---

## 6. Sonnet vs Haiku Prompt Differences

### What to KEEP from Haiku Prompts

**Structural elements that work for both models:**
- Phase gating (break work into phases)
- Expected outcomes stated inline
- Evidence requirements (screenshots, counts, observations)
- Troubleshooting sections (recovery paths for common failures)
- Report format templates
- Exact CSS selectors and element references (speeds execution, not required for Sonnet but helpful)

### What to REMOVE for Sonnet

| Haiku Element | Sonnet Equivalent | Rationale |
|---------------|-------------------|-----------|
| CRITICAL FACTS preamble (10-15 lines) | 3-5 line context statement | Sonnet doesn't give up; condense authority assertions |
| VERIFY gates every 2-3 steps | Checkpoint every 7-10 steps | Sonnet's reliable range allows longer sequences |
| "Run via Bash: agent-browser open URL" | "Open the app in agent-browser" | Sonnet infers tool syntax |
| "SCROLL UP" repeated after steps | "Cards render at top; scroll if needed" (once) | Sonnet navigates viewport |
| DO NOT lists (5-7 prohibitions) | 1-2 for critical mistakes only | Over-constrains Sonnet's recovery |
| TROUBLESHOOTING IF/THEN trees | High-level recovery strategy | Sonnet improvises within bounds |
| "You CAN see images" | (omit) | Sonnet interprets by default |
| Context repetition in each phase | State once at top | Sonnet maintains context |

### What to ADD for Sonnet

**New elements that unlock Sonnet's strengths:**

1. **Goal-oriented framing**
   - Haiku: "Click button. Scroll UP. Take snapshot. VERIFY: you see X."
   - Sonnet: "Trigger the demo and capture the active card state. Expected elements: [list]. If elements missing, troubleshoot."

2. **Success criteria framing**
   - Define "What does done look like?" instead of "Do steps 1-23"
   - Let Sonnet plan the path to success criteria

3. **Cross-agent coordination prompts**
   - "Message teammates when you find X"
   - "If this change affects [boundary], notify [agent]"
   - Trust Sonnet's collaboration capability

4. **Exploratory latitude within bounds**
   - "If you observe Y, investigate further within [scope]"
   - Trust Sonnet's judgment for adjacent discoveries

5. **Detailed report structure templates**
   - Leverage Sonnet's synthesis capability
   - Request structured findings with severity, evidence, cross-references

6. **IF BLOCKED fallback instructions**
   - High-level strategy instead of step-by-step IF/THEN
   - "If server unreachable: verify netstat, check port, report findings"

### Prompt Length Reduction

**Haiku baseline:** ~180-200 lines per agent
- 50% guardrails/safety (CRITICAL FACTS, VERIFY gates, DO NOT lists, TROUBLESHOOTING)
- 50% task instructions

**Sonnet target:** ~100-130 lines per agent
- 10-15% guardrails (context anxiety mitigation, scope control)
- 85-90% task instructions (objectives, phases, evidence, report format)

**Token savings:** 30-45% reduction
**Invest savings in:** Richer success criteria, evidence requirements, report templates

---

## 7. Prompt Templates by Task Type

### 7a. Implementation Prompt Template

```markdown
OBJECTIVE: [Clear goal — what needs to be accomplished]

SUCCESS CRITERIA:
- [Criterion 1 with measurable outcome]
- [Criterion 2 with evidence requirement]
- [Criterion 3 with integration verification]

CONTEXT:
- You have adequate context window remaining — do not rush.
- Focus on completing THIS task fully before considering scope expansion.
- [Relevant background, constraints, integration points]

SCOPE:
IN SCOPE:
- [Exact files to modify]
- [Exact features to implement]

OUT OF SCOPE (do not attempt):
- [Related files NOT to touch]
- [Adjacent features NOT to implement]

PHASE 1: [Phase Name] (7-10 steps)
GOAL: [What this phase accomplishes]
STEPS:
1. [Action] — expect [result]
2-7. [More actions with expected outcomes]
CHECKPOINT: [Expected state at phase end. If checkpoint fails, report and stop.]

PHASE 2: [Phase Name] (7-10 steps)
GOAL: [What this phase accomplishes]
STEPS:
8-15. [Actions with expected outcomes]
CHECKPOINT: [Expected state. Verify integration points: [list].]

INTEGRATION BOUNDARIES:
- If you modify [X], message [agent] with new signature/behavior
- If you add CSS classes, message styles agent with class names
- If you change IPC handler, message frontend agent with contract changes

VERIFICATION PROTOCOL:
After each step, verify it worked before proceeding.
Test each function/component individually before integrating.
Mark complete ONLY when all verification steps pass:
- [ ] Code written
- [ ] Agent-browser evidence captured
- [ ] No errors in console
- [ ] Feature works end-to-end

IF BLOCKED:
- If integration unclear: Message [agent] for clarification
- If test fails: Report failure, do not mark complete
- If scope ambiguous: Ask for guidance, do not assume

REPORT FORMAT:
SUMMARY: [One-line status]
COMPLETED:
- [List of completed items with verification evidence]
ISSUES:
- [Any blockers, failures, or clarifications needed]
EVIDENCE:
- [Screenshot/snapshot files demonstrating feature works]
```

### 7b. Code Review Prompt Template

```markdown
OBJECTIVE: Review [scope] for [aspect: code quality / security / integration / design compliance].

REVIEW THROUGH THESE LENSES:
1. [Lens 1 with specific criteria]
2. [Lens 2 with specific criteria]
3-5. [Additional lenses]

ADVERSARIAL REQUIREMENT:
No code is perfect. Find the issues.
Minimum [N] findings expected. If you find fewer, review more thoroughly.
Check for what's NOT on this list (Mode 2: Adversarial).

SCOPE:
FILES: [Exact file list or glob pattern]
FOCUS: [What to review deeply]
OUT OF SCOPE: [What to skip]

REVIEW PROTOCOL:
For each file:
1. Read implementation
2. Trace integration points (callers, callees, data flows)
3. Check for anti-patterns: [list project-specific patterns]
4. Verify against [reference: design system / IPC patterns / security checklist]

REQUIRED CHECKS:
- [ ] All functions have error handling
- [ ] Integration boundaries match contracts
- [ ] No hardcoded values (use constants/config)
- [ ] Pattern compliance: [list patterns from codebase]
- [ ] [Additional project-specific checks]

REPORT FORMAT:
For each finding:
SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
FILE: [path:line]
PRINCIPLE: [What rule/principle is violated]
CURRENT: [What the code does now — specific values]
SHOULD BE: [What it should do — specific fix]
WHY: [Why this matters to quality/security/maintainability]

POSITIVE FINDINGS:
- [What's done well — concrete examples]

CROSS-DOMAIN FINDINGS:
If you find issues affecting other agents' domains, message them immediately.
```

### 7c. Agent-Browser Testing Prompt Template

```markdown
OBJECTIVE: Test [feature] via agent-browser and document all findings.

SUCCESS CRITERIA:
- All [N] test cases executed
- Screenshots captured for each state transition
- Lifecycle verified: start → progress → complete → cleanup
- Both positive findings (works correctly) and issues documented

SETUP:
1. Verify dev server running: netstat check
2. Open http://localhost:5173 in agent-browser
3. Navigate to [feature area]
4. Take baseline screenshot
CHECKPOINT: App loads, [specific elements] visible.

TEST PHASE 1: [Feature Lifecycle] (7-10 steps)
GOAL: Verify complete lifecycle from trigger to cleanup
STEPS:
1. Trigger [action]
2. Capture active state (screenshot)
3. Wait for completion
4. Capture completion state (screenshot)
5. Wait 30+ seconds (timer leak check)
6. Verify cleanup (screenshot)
7. Navigate away and back (state reset check)
CHECKPOINT: Lifecycle completes, no console errors, cleanup verified.

TEST PHASE 2: [Edge Cases] (7-10 steps)
GOAL: Test error paths, rapid clicks, concurrent operations
STEPS:
8. Test error path: [specific error trigger]
9. Verify error messaging (screenshot)
10. Test rapid clicks (5x)
11. Verify no duplication (screenshot + count)
12-15. [Additional edge cases]
CHECKPOINT: All edge cases handled correctly.

RESPONSIVE TESTING (REQUIRED):
Test at all 3 breakpoint tiers:
- Tier 1 (desktop): Default viewport
- Tier 2 (900px): `agent-browser eval "window.resizeTo(900, 800)"`
- Tier 3 (600px): `agent-browser eval "window.resizeTo(600, 800)"`
Capture screenshot at each tier showing [feature].

IF BLOCKED:
- If element not found: Take screenshot, report what you DO see, scroll and retry
- If feature behaves unexpectedly: Document actual behavior with evidence
- If server unreachable: Verify netstat, check port, report

REPORT FORMAT:
For each finding:
SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
TEST CASE: [Which test]
EXPECTED: [Correct behavior]
ACTUAL: [Observed behavior]
EVIDENCE: [Screenshot filename or snapshot excerpt]
BREAKPOINT: [Tier 1/2/3 if responsive issue]

POSITIVE FINDINGS:
- [What works correctly with evidence]
```

### 7d. Monitor Agent Prompt Template

```markdown
OBJECTIVE: Monitor [implementation agent] and verify work against plan/spec.

ADVERSARIAL REQUIREMENT:
No implementation is perfect. Find the issues.
Your job is to catch what the implementation agent missed.
If you report ZERO issues, you have failed your duty.

MONITOR DUTIES:
1. Contract verification — data shapes match across boundaries (character-by-character)
2. Conflict detection — new code vs existing code (variable collisions, state conflicts)
3. Pattern compliance — error handling, validation, logging match codebase patterns
4. Miss detection — missing resets, imports, state cleanup, progress flags
5. Intent drift detection — does implementation match plan's Intent Statement?

SCOPE:
MONITORING: [Implementation agent name]
FILES: [Files being modified]
PLAN: [Reference to plan or spec]

VERIFICATION PROTOCOL:
After implementation agent writes to disk:
1. Read all modified files
2. Trace data flows across boundaries (grep for field names)
3. Check callers/consumers of modified functions (still work with new behavior?)
4. Verify pattern compliance against existing code (sample 3 similar functions)
5. Check plan Intent Statement — does implementation serve the user's vision?

REQUIRED CHECKS:
- [ ] IPC handler → preload → Redux → component (contract matches)
- [ ] Error handling matches project pattern
- [ ] All imports/exports correct
- [ ] State cleanup on navigation/unmount
- [ ] Progress flags set/cleared correctly
- [ ] Implementation matches Intent Statement (no drift)

EDGE CASES TO TEST:
- What if [function] receives null/empty/unexpected input?
- What if user navigates away during operation?
- What if operation fails (error propagation correct)?

REPORT FORMAT:
For each finding:
SEVERITY: CRITICAL / HIGH / MEDIUM / LOW (INTENT DRIFT = CRITICAL)
FILE: [path:line]
CATEGORY: Contract / Conflict / Pattern / Miss / Intent Drift
EXPECTED: [What should be]
ACTUAL: [What is]
IMPACT: [What breaks if unfixed]

IF NO ISSUES FOUND:
Review again with Mode 2 (Adversarial): What's wrong that ISN'T on this checklist?
```

---

## 8. Failure Mode Catalog

### Context Anxiety

**Trigger:** Sonnet believes it's near context limit (even with capacity)
**Symptom:** Rushes, takes shortcuts, marks incomplete work as done
**Prompt mitigation:** "You have adequate context window. Do not rush."
**Workaround:** Enable 1M window, cap at 200K usage
**Recovery:** Message "150K tokens remain. Complete verification steps."

### Scope Creep

**Trigger:** Adjacent work visible, related features nearby
**Symptom:** Attempts too much, runs out of context, incomplete implementations
**Prompt mitigation:** OUT OF SCOPE section with explicit prohibitions
**Recovery:** Message "X is out of scope. Complete assigned tasks only."

### Error Propagation

**Trigger:** Early error in multi-step sequence
**Symptom:** Builds on faulty foundation, compounds mistake
**Prompt mitigation:** "After each step, verify before proceeding. If error, STOP and report."
**Recovery:** Message "Error detected. Do not proceed. Report current state."

### Hallucination (Withholding)

**Trigger:** Uncertainty about facts, domain-specific work
**Symptom:** Claims no tool access, can't find files, feature broken (when it isn't)
**Prompt mitigation:** "Use grep/glob to verify before claiming X doesn't exist."
**Recovery:** Ask "Have you verified with grep? Show search command."

### Hallucination (Fabricating)

**Trigger:** Same as withholding
**Symptom:** Invents function names, API signatures, config options
**Prompt mitigation:** "Cite file:line references. If uncertain, say 'I don't know.'"
**Recovery:** Monitor agent checks all factual claims against codebase

### Instruction-Following Failure

**Trigger:** Complex prompts, ambiguous phrasing, competing priorities
**Symptom:** Skips steps, reinterprets instructions, wrong output format
**Prompt mitigation:** Numbered lists, bold constraints, repeat requirements at end
**Recovery:** Message "Step X was skipped. Complete it before proceeding."

### Project Rules Skimming

**Trigger:** Project has rules in .claude/rules/ files
**Symptom:** Violates documented rules, repeats anti-patterns
**Prompt mitigation:** Inline top 3-5 critical rules directly in prompt with examples
**Recovery:** Cleanup agent after team completes catches rule violations

---

## 9. Decision Tree: Sonnet vs Haiku vs Opus

```
Task classification:
├─ Mechanical (file ops, counts, templates) → HAIKU
├─ 3-5 steps or fewer → HAIKU
├─ Cost-sensitive bulk work → HAIKU
├─ Implementation (3-5 files, clear spec) → SONNET
├─ Review (code quality, visual, integration) → SONNET
├─ Browser testing (functional + visual) → SONNET
├─ Monitor role (parallel with implementation) → SONNET
├─ 7-10 step reasoning chains → SONNET
├─ Cross-agent coordination → SONNET
├─ Security audit → OPUS
├─ Architecture (10+ files) → OPUS
├─ Lead/orchestrator → OPUS
├─ One-shot critical (no retry budget) → OPUS
└─ 15+ step reasoning → OPUS
```

### Example Scenarios

| Scenario | Model | Rationale |
|----------|-------|-----------|
| Count lines in 20 files | Haiku | Mechanical, cost-effective |
| Refactor 1 component (inline styles → CSS) | Haiku | 3-5 steps with clear spec |
| Refactor 4 components (inline styles → CSS + new classes) | Sonnet | 6+ steps, cross-file integration |
| Visual review of 5 screenshots | Sonnet | Visual analysis strength |
| Security audit of IPC handlers | Opus | Too critical for Sonnet |
| Test operation cards in agent-browser | Sonnet | Proven sweet spot (12 findings in 2026-02-13) |
| Monitor implementation agent | Sonnet | Proven 100% accuracy (2026-02-07) |
| Plan complex feature across layers | Opus | Architecture + synthesis required |
| Implement feature from plan | Sonnet | Execution, not judgment |
| Verify implementation | Sonnet | Monitor pattern, not Opus unless critical |

---

## 10. Optimal Task Sizing for Sonnet

### Steps per Phase

**Haiku:** 3-5 steps per phase (hard limit)
**Sonnet:** 7-10 steps per phase (reliable range)

**Implication:** Fewer phases needed for same total work
- 20-step task: Haiku needs 4 phases, Sonnet needs 2-3 phases
- Fewer phase boundaries = less prompt overhead
- More continuity in reasoning

### Tasks per Agent in a Team

**Evidence from team metrics:**
- Backend: 6 tasks (8+ files modified)
- Frontend: 3 tasks (20+ thunks)
- Components: 4 tasks (~100 style fixes)
- Styles: 2 tasks (25 classes, 16 migrations)
- Docs: 2 tasks (4 files)

**Range:** 2-6 tasks per agent
**Average:** 3-4 tasks

**Rule:** If assigning 7+ tasks to one agent, consider splitting across 2 agents or consolidating into larger phases.

### When to Split vs Keep as One Task

**Split into separate tasks when:**
- Different file ownership (styles vs components)
- Different phase dependencies (Task B blocked on Task A completion)
- Different verification requirements (one needs agent-browser, other doesn't)

**Keep as one task when:**
- Same file or tightly coupled files
- Sequential steps in same phase
- Same verification method

---

## 11. Cost Optimization

### Pricing Structure

**Base rates:**
- Input: $3 per MTok
- Output: $15 per MTok

**Premium context (200K+):**
- Input: $6 per MTok (2x)
- Output: $22.50 per MTok (1.5x)

**Extended thinking:** Same pricing as standard tokens

**Batch API (50% off):** $1.50 input / $7.50 output (for non-time-sensitive)

**Prompt caching:** $0.30/MTok for cache reads (10x cheaper than base input)

### When Sonnet Saves Money Over Opus

**Scenario 1: Moderate complexity work**
- Opus: $5/$25 per MTok
- Sonnet: $3/$15 per MTok
- Savings: 40% on input, 40% on output
- Use when: Task is well-scoped, doesn't need Opus-level synthesis

**Scenario 2: Sonnet + monitor vs Opus alone**
- Sonnet implementation + Sonnet monitor: ~$6/$30 equivalent (2 agents)
- Opus single-agent: $5/$25 per MTok but may take 2x tokens for same output quality
- Break-even: If Opus uses 1.2x tokens of Sonnet, Sonnet is cheaper
- Benefit: Sonnet monitor pattern = higher quality (parallel verification)

### When Haiku Saves Money Over Sonnet

**Scenario: Well-specified mechanical tasks**
- Haiku: $1/$5 per MTok
- Sonnet: $3/$15 per MTok
- Savings: 67% on input, 67% on output
- Use when: Task is 3-5 steps, mechanical, no reasoning required

**Caveat:** If Haiku needs 2+ retries due to give-up behavior:
- Haiku retry cost: 2-3x base = $2-3 input / $10-15 output
- Sonnet first-pass: $3 input / $15 output
- Break-even: If Haiku retry rate > 50%, Sonnet is more cost-effective

### Hybrid Team Pattern

**Pattern:**
1. Sonnet lead creates plan (planning strength)
2. Multiple Haiku agents execute subtasks in parallel (cost-effective execution)
3. Sonnet integrates results and validates (synthesis + verification)

**Cost comparison for 10-task project:**

| Approach | Model Distribution | Est. Cost |
|----------|-------------------|-----------|
| All Sonnet | 1 Sonnet lead + 10 Sonnet workers | $150-200 |
| Hybrid | 1 Sonnet lead + 10 Haiku workers + 1 Sonnet integrator | $80-120 |
| All Haiku | 1 Haiku lead + 10 Haiku workers | $50-70 (but higher retry risk) |

**Savings:** Hybrid = 40-50% cheaper than all-Sonnet while maintaining quality

**When hybrid works best:**
- Tasks are well-scoped (Haiku can execute)
- Integration points are clear (Sonnet can coordinate)
- Task count is high (parallel execution scales)

**When hybrid fails:**
- Tasks are ambiguous (Haiku gives up, Sonnet needed throughout)
- Deep reasoning required (Haiku can't execute, Sonnet needed)
- Integration is complex (more Sonnet verification needed, reduces savings)

---

## 12. Sonnet as Verification Layer

### Pattern 1: Sonnet Verifies Haiku's Work

**Workflow:**
1. Haiku completes mechanical task (cheap, fast)
2. Sonnet reviews Haiku's output for correctness (moderate cost, higher quality)

**Evidence:** 2026-02-13/14 runs
- Sonnet found 12 findings via agent-browser
- Haiku validated 6 of Sonnet's findings
- Demonstrates: Sonnet findings are independently reproducible

**Cost justification:**
- Haiku execution: $1/$5
- Sonnet verification: $3/$15 (small task = low token usage)
- Total: ~$4/$20 equivalent
- vs. All-Sonnet: $3/$15 but for larger task
- Savings: 30-40% when Haiku can execute, Sonnet verifies

### Pattern 2: Sonnet Implements, Opus Reviews (Only If Critical)

**Workflow:**
1. Sonnet completes implementation (cost-effective, fast)
2. Sonnet self-verification (tests own work)
3. Opus reviews ONLY if:
   - Security implications exist
   - Architecture changes affect multiple systems
   - No test coverage
   - High-stakes, no retry budget

**When to skip Opus gate:**
- Task is low-risk (UI polish, refactoring with tests)
- Sonnet self-verification passed with high confidence
- Time/cost constraints

**Cost comparison:**
- Sonnet implement + Sonnet verify: $6/$30 equivalent
- Sonnet implement + Opus review: $8/$40 equivalent
- All Opus: $5/$25 but potentially 2x tokens
- Use Opus gate only when risk > cost

### Pattern 3: Monitor Agent (Sonnet) Verifies Implementation Agent (Sonnet/Haiku)

**Workflow:**
1. Implementation agent writes code
2. Monitor agent (Sonnet) runs IN PARALLEL (not post-completion)
3. Monitor checks: contracts, conflicts, patterns, misses, intent drift

**Evidence:** 2026-02-07 run
- Monitor (Sonnet): 7 issues found, 0 false positives (100% accuracy)
- Caught issues implementation agents missed

**Why Sonnet for monitor:**
- Contract tracing requires reasoning (Haiku would miss)
- Pattern compliance needs comparison (Haiku follows, doesn't compare)
- Intent drift detection needs synthesis (Haiku can't assess intent)
- But not Opus-level complexity (Sonnet sufficient, cheaper)

**Cost:** Monitor adds ~30% to project cost but catches 5-10% more issues (net positive)

---

## 13. Run Log (PRESERVED)

| Date | Team | Task | Result | Lesson |
|------|------|------|--------|--------|
| 2026-02-06 | Full audit | Security/code/design/docs review | SUCCESS — 87 findings, 0 false positives | Sonnet read-only audits = 100% accuracy. Domain scoping prevents overlap. Adversarial framing finds real issues. |
| 2026-02-06 | Doc refactor | 5 Sonnet writers + 1 auditor | SUCCESS — 0 rework, 7/7 files passed spec | Sonnet handles doc writing well. Agent 4 (line counting) could drop to Haiku. Auditor found 0 issues (clean execution). |
| 2026-02-07 | fix-remaining-backlog | 5 impl + 1 monitor + 1 verifier | SUCCESS — 0 rework, 14/14 runtime PASS | Monitor at 100% accuracy (7/7 true positives). Cross-agent messaging seamless (8 from styles agent, all useful). Components fastest (8 min). All agents adequate. |
| 2026-02-13 | sonnet-adversarial | Browser test op cards | SUCCESS — 12 real findings | Sonnet handles browser testing with visual analysis. No "You CAN see images" needed. Haiku v5 validated 6 of 12 findings. |
| 2026-02-14 | solo-sonnet-test | Browser test op cards (rapid-click, goal-oriented prompt) | SUCCESS — completed all steps, found 3/5 card creation, validated goal-oriented prompting works | Sonnet does NOT need Haiku-style guardrails. 40-line goal-oriented prompt achieved same coverage as 180-line Haiku prompt. Sonnet autonomously scrolled, used snapshot-i, waited for states, interpreted screenshots. Key difference: Sonnet understands GOALS and adapts; Haiku needs each step verified as a gate. |
| 2026-02-14 | tier4-polish | 4 Sonnet agents: kbd nav, CSS, audit, component | SUCCESS — 75% first-pass (3/4), 100% after cleanup | Self-claiming works: css-polish claimed verification task autonomously. Restraint works: audit agent correctly said "no changes needed" for dead code. FAILURE: React agent violated rule #1 (module-scope IPC) despite coding-rules.md. Mitigation: inline critical rules in prompts, don't rely on rules files alone. Cleanup agent pattern caught the violation. |

---

## 14. Decision Matrix

| Scenario | Use Sonnet? | Rationale |
|----------|------------|-----------|
| 3-file refactor with integration | YES | Reasoning handles integration points well |
| 10-file architectural refactor | NO | Use Opus (needs deep synthesis) |
| Browser testing with visual analysis | YES | Proven strength — 12 findings in real run |
| Security audit | NO | Use Opus (too critical) |
| Code review (5-10 files) | YES | Balanced cost/quality for moderate scope |
| Simple code search | NO | Use Haiku (cheaper, faster for mechanical) |
| Lead/coordinator role | NO | Use Opus (needs judgment across agents) |
| Implementation (clear spec, 3-5 files) | YES | Sweet spot |
| Complex debugging (unknown root cause) | MAYBE | If 7-10 steps: YES. If deeper: Opus. |
| Writing technical documentation | YES | Can synthesize code + context effectively |
| Post-run transcript analysis | YES | Fast, cheap, capable for pattern extraction |
| Monitor agent (parallel with impl) | YES | Proven 100% accuracy in controlled scope |
| Line counting across 20 files | NO | Use Haiku (mechanical, wasteful for Sonnet) |

---

## 15. Summary: Sonnet's Niche

**Sonnet is the balanced workhorse for moderate-complexity tasks.** It excels when Haiku would struggle with reasoning and Opus would be overkill. It's the default choice for implementation, review, and testing in the 7-10 step range.

**The 7-10 step sweet spot:** Sonnet handles multi-step reasoning reliably. Below 5 steps, use Haiku for cost savings. Above 10 steps, consider Opus for quality.

**Visual analysis strength:** Sonnet can interpret screenshots and find visual issues without Haiku-level explicit prompting. This makes it ideal for UI/UX review tasks and agent-browser testing.

**Monitor agent pattern validated:** Sonnet running in parallel with implementation = 100% true positive rate. Use this pattern to catch integration, cleanup, state, and pattern issues.

**Cross-agent coordination:** Sonnet excels at collaboration. Styles agent sent 8 messages, all useful. Trust Sonnet to message teammates when it finds cross-boundary issues.

**Cost-quality balance:** 3x Haiku price, 1/3 Opus price. Choose Sonnet when quality matters more than cost but you don't need Opus-level depth.

**Context anxiety is real:** Mitigate with "You have adequate context" prompts. Enable 1M window if available, cap at 200K usage.

**Scope creep is predictable:** Control with explicit OUT OF SCOPE sections. Monitor agents should flag scope drift as INTENT DRIFT (critical severity).

**Runtime verification is mandatory:** Code reading alone = 80% ceiling (model-independent). Sonnet needs agent-browser testing JUST LIKE HAIKU for timer lifecycle, state wiring, error propagation, end-to-end flows.

**Prompt length reduction pays off:** Target 100-130 lines vs Haiku's 180-200. Invest token savings in richer success criteria, evidence requirements, and report templates. Sonnet doesn't need Haiku-level hand-holding.
