---
name: review-plan
description: Adversarial plan review against the Plan Creation Guide and codebase reality. Spawns a background review agent that produces a structured review report with findings, intent adherence matrix, and go/no-go recommendation.
allowed-tools: Read Grep Glob Bash(ls *) Bash(dir *) Bash(wc *)
argument-hint: "[path-to-plan-directory]"
---

# Review Plan

Spawn a background review agent to conduct a deep adversarial review of an implementation plan.

## Step 1: Resolve the Plan Directory

If `$ARGUMENTS` is provided, use it as the plan directory path.

If `$ARGUMENTS` is empty or not provided, detect the most recent plan:

1. List directories in `.claude/plans/` sorted by modification time
2. Find the most recently modified directory that contains a `plan/` subdirectory
3. Use that `plan/` subdirectory as the target

```bash
ls -lt .claude/plans/
```

Resolve the plan directory to an absolute path. Confirm it exists and contains at least one of: `README.md`, `MASTER-PLAN.md`, `checklist.md`.

If no valid plan directory is found, report:
`FAIL -- No plan directory found. Provide a path: /review-plan .claude/plans/{name}/plan/`

## Step 2: Inventory Plan Files

Find all plan files in the resolved directory:

- `README.md` (review order, scope)
- `GLOSSARY.md` (project-specific terms)
- `MASTER-PLAN.md` (core plan document)
- `checklist.md` (execution tracker)
- `verification.md` (test matrix)
- `notes.md` (decisions, blockers)
- `changes.md` (audit trail)

Report which files exist and which are missing. Missing files from the standard 7-file handoff are themselves a finding.

## Step 3: Find Prototype (if any)

Check for prototypes referenced in the plan or in the `prototypes/` directory:

1. Read `README.md` and `MASTER-PLAN.md` for prototype references
2. Check `prototypes/` directory for recently modified HTML files
3. If a prototype is found, note its path for the review agent

## Step 4: Prepare Review Context

Collect the file paths for:
- All plan files found in Step 2
- Prototype path (if found in Step 3)
- Plan Creation Guide: `.claude/plans/PLAN-CREATION-GUIDE.md`
- Key codebase reference files for cross-checking:
  - `CLAUDE.md` (architecture overview)

## Step 5: Resolve Output Path

### Directory placement

The output directory is ALWAYS a `plan-review/` folder that is a SIBLING of the `plan/` folder — never inside it.

```
.claude/plans/{name}-{date}/
+-- plan/                  <- plan files live here
|   +-- MASTER-PLAN.md
|   +-- ...
+-- plan-review/           <- review output goes HERE (sibling, not child)
    +-- review-{model}.md
```

**Resolution logic:**
- If the resolved plan directory ends with `/plan` or `/plan/`, the output directory is `{parent}/plan-review/`
- If it does NOT end with `/plan`, the output directory is `{plan-directory}/plan-review/`

### Filename convention

The review filename MUST include the full model identifier used for the review agent:

| Model | Filename |
|-------|----------|
| Claude Opus 4.6 | `review-claude-opus-4-6.md` |
| Claude Sonnet 4.5 | `review-claude-sonnet-4-5.md` |
| Claude Haiku 4.5 | `review-claude-haiku-4-5.md` |

Full output path: `{resolved-output-directory}/review-{model-id}.md`

## Step 6: Spawn Review Agent

Spawn the `review-plan` agent as a background task with the following context passed in the prompt:

- **Plan directory**: absolute path
- **Plan files**: list of files found with their absolute paths
- **Prototype path**: if found
- **Output path**: the resolved path from Step 5

The agent runs in background (`run_in_background: true`). It reads all plan files, cross-references against the codebase and Plan Creation Guide, and writes a structured review report.

## Step 7: Report

Once the agent is spawned, report to the user:

```
Plan review started.
  Plan: {plan-directory}
  Files found: {count} of 7 ({list of found files})
  Missing: {list of missing files or "none"}
  Prototype: {path or "not found"}
  Model: {model-id}
  Output: {resolved-output-path}

Review agent is running in background. You will be notified when complete.
```
