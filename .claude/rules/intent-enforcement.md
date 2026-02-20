# Intent Enforcement — Mandatory Execution Gates

## The Three Gates (MANDATORY between every tier)

### Gate 1: Agent Prompt Intent Preamble

Every implementation agent prompt MUST include:

```
USER INTENT (verbatim — verify every change against these):
[paste user's exact requirements here]

Before marking your work complete, answer:
- How does each change I made serve one of these requirements?
- If I can't map a change to a requirement, why did I make it?
- If I removed something, did I verify the user wanted it removed?
```

Agents that cannot map their changes to user requirements have failed, regardless of build status.

### Gate 2: Inter-Tier Intent Checkpoint

Before launching Tier N+1, the lead MUST answer these three questions using the user's exact words as the standard:

1. If the user used the app RIGHT NOW, would they see the behavior they asked for?
2. What specific user requirement does this tier advance?
3. What user requirement is still unmet and which upcoming tier addresses it?

If the lead cannot answer all three, the tier is NOT ready for advancement. Fix first.

This gate is NOT optional. "Build passes" is necessary but NOT sufficient. Intent adherence is the primary gate.

### Gate 3: Monitor Intent Verification

Monitor agent prompts MUST include the user's verbatim requirements and ask:

```
INTENT VERIFICATION (check BEFORE code quality):
Given the user's requirements:
[paste requirements]

1. Does this implementation answer questions before they're asked?
2. Is the UX self-explanatory with zero guessing?
3. Would the user call this "visually stunning and simple"?
4. Does every operation show real-time animated feedback?

Report intent gaps BEFORE code bugs. Intent drift is CRITICAL severity.
```

## Enforcement

- These gates are checked by the lead INLINE (not delegated to an agent)
- Gate 2 takes < 60 seconds — it's three questions against the user's words
- Skipping any gate is a process violation equivalent to shipping without tests
- If intent drift is found, STOP and fix before proceeding — do not accumulate drift across tiers

## What "Intent Adherence" Means Concretely

It's not abstract. For this project, it means:
- Submit a URL → see immediate visual feedback (input validation, loading state, submission confirmation)
- Job starts processing → see real-time status updates (queued → running → done/failed)
- Every job card answers: what's happening now, what platform, what stage, what failed and why
- Progress is visible — no silent processing, no mystery waits
- Errors are actionable — retry buttons, clear error messages, not stack traces
- No guessing — every state change is visible and explained
- Activity panel shows live telemetry grouped by job
