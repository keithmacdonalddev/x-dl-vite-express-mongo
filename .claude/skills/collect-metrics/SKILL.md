---
name: collect-metrics
description: Gather per-agent performance data and append a scorecard to team-metrics.md. Agent-invocable only — the lead calls this after every team run.
user-invocable: false
model: haiku
allowed-tools: Read Glob Grep Edit
argument-hint: "<team-type> <purpose>"
---

# Collect Metrics

Gather performance data from the current team run and append a scorecard to
the persistent metrics file.

## Arguments

`$ARGUMENTS` should contain:
- Team type: `review` | `implementation` | `feature` | `bug` | `refactoring`
- Purpose: Brief description (e.g., "full code audit", "add batch download feature")

## Step 1: Read Current Metrics File

```
Read memory/team-metrics.md
```

Understand the template format and check for prior runs.

## Step 2: Gather Per-Agent Data

For each agent on the team, collect:

### From task list:
- Tasks assigned (total)
- Tasks completed
- Tasks still open or blocked

### From agent messages (review teams):
- Total findings reported
- Findings by severity (Critical/High/Medium/Low/Info)
- Cross-domain messages sent (count)
- Cross-domain messages that led to new findings (count useful)

### From verification round (if applicable):
- Findings marked VERIFIED
- Findings marked FALSE POSITIVE
- Findings marked NEEDS-MORE-INFO
- Calculate accuracy: verified / (verified + false_positive)

### From confidence checks:
- Agent's self-reported confidence score
- Lead's verified confidence score
- Delta between the two

## Step 3: Calculate Aggregates

- Total findings across all agents
- Overall verified rate
- Overall false positive rate
- Total cross-domain messages and useful rate
- Regressions introduced (if implementation team)

## Step 4: Assess Model Efficiency

For each agent, evaluate whether their assigned model was:
- **adequate** — Right balance of capability and cost
- **overkill** — Could have used a cheaper model
- **insufficient** — Needed a more capable model

## Step 5: Note Prompt Adjustments

Based on the data:
- High false positive rate (>25%) -> prompt was too vague, needs tightening
- Zero cross-domain messages -> add explicit messaging instructions
- Confidence delta >20% -> agent overconfident, needs more verification gates
- Agent found 0 issues in area with known problems -> prompt missed scope

## Step 6: Append Scorecard

Use the Edit tool to append a filled-in scorecard to `memory/team-metrics.md`
under the "Run History" section. Follow the template format exactly.

## Step 7: Update MEMORY.md (if needed)

If this run revealed patterns that should be remembered:
- New model assignment recommendations
- Prompt phrasing that worked well or poorly
- Recovery situations encountered

Update the relevant section of MEMORY.md.

## Report Format

Return the completed scorecard text so the lead can review before it's saved.
