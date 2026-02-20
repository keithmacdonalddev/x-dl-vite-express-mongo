# Agent Teams Rules

## Tool Selection Decision Tree

Need to do work?
  ├─ Can I answer in <30 seconds? → Do it inline
  ├─ Is it 1 truly atomic task (single file read, single build check, single search)? → Background subagent
  ├─ Is it 2+ agents doing ANY work (read or write)? → Agent team (DEFAULT)
  └─ Unsure? → Use a team. You don't always know upfront if coordination is needed.

Subagent = Task tool, ephemeral, returns result, dies.
Team = persistent teammates, shared task list, inter-agent messaging.

Team is the default for 2+ agents. Teammates can work independently AND communicate — subagents can only work independently. Subagents are only for truly atomic single-agent tasks.

## Gate Checks Before Launch

### 1. Right Tool?
Single task, result only → subagent
Multiple independent tasks, results only → parallel subagents
Tasks where agents need to MESSAGE each other → team

### 2. Who Checks the Work?
Every worker needs a checker defined BEFORE launch.
Options: confidence-check skill, second agent, lead spot-check.
For implementation agents, the checker is a monitor agent running in parallel.

### 3. Proportional?
Agent count matches work scale.
Model selection: Haiku (mechanical), Sonnet (reasoning), Opus (lead/security only).
For teams: task sizing is 5-6 per agent (fewer = idle, more = too long).
For subagents: 1 task per agent is correct.

### 4. Deliverable Defined?
What does "done" produce? (report, code, fixed bug, test pass, screenshot evidence)
Task-specific completion criteria:
- Docs: every claim verifiable against source (grep/glob test)
- Code: builds + runs + agent-browser functional pass
- Review: findings traced in code with file:line references

## File Ownership

Never assign two teammates to the same file. Conflicts cause overwrites.

### Server Domains (Strict Boundaries)

Server code is organized into 5 autonomous domains with exclusive ownership. Each domain has a steward agent, a skill gate, and a CLAUDE.md with authoritative documentation. No agent outside the domain team may touch files in another domain's directory.

| Domain | Directory | Steward | Skill Gate | CLAUDE.md |
|--------|-----------|---------|------------|-----------|
| API | `server/src/api/**` | api-steward | /api-work | `server/src/api/CLAUDE.md` |
| Worker | `server/src/worker/**` | worker-steward | /worker-work | `server/src/worker/CLAUDE.md` |
| Services | `server/src/services/**` | services-steward | /services-work | `server/src/services/CLAUDE.md` |
| Platforms | `server/src/platforms/**` | platforms-steward | /platforms-work | `server/src/platforms/CLAUDE.md` |
| Core | `server/src/core/**` | core-steward | /core-work | `server/src/core/CLAUDE.md` |

### Client (File-Level Ownership)

Client has no domain architecture yet. Use file-level ownership:

- client/src/App.jsx + client/src/App.css -> Client shell teammate
- client/src/components/** -> Frontend teammate
- client/src/features/** -> Feature teammate
- client/src/hooks/** + client/src/api/** -> Data layer teammate

### Cross-Domain Change Protocol

When a change in one domain affects another domain's interface:

1. **Identify affected consumers** -- read the "Consumers" section of your domain's CLAUDE.md
2. **Notify steward** -- message the consuming domain's steward agent BEFORE making the change
3. **Get acknowledgment** -- steward must confirm the change is compatible or request adjustments
4. **Update both CLAUDE.md files** -- both the producing and consuming domain docs must reflect the change
5. **Never bypass** -- even "small" changes to exports, response shapes, or model fields require notification

### Domain Team Rules

- Each domain team operates independently within its boundary
- The domain's CLAUDE.md is the single source of truth for file inventory, dependencies, and contracts
- The domain's skill gate (/api-work, /worker-work, etc.) must be invoked for any file changes
- Cross-domain questions, explorations, and contributions must go through the domain steward
- After any change, the steward updates the domain CLAUDE.md

## Platform Limitations

- No nested teams — teammates cannot spawn their own teammates
- One team per session — clean up stale teams before creating new ones
- Lead is fixed — cannot promote a teammate to lead mid-session
- Task status can lag — teammates sometimes fail to mark tasks complete
- Teammates don't inherit conversation history — they load CLAUDE.md + rules but not lead's chat
- Windows: in-process mode only — split panes require tmux/iTerm2 (unavailable on Windows)
- Session resume kills in-process teammates — context compaction or /resume loses teammates; recovery = cleanup old team, respawn fresh
- Crashed teammate times out after ~5 minutes — reassign tasks or spawn replacement

## Teammates Self-Claim After Tier 1

After Tier 1 tasks are assigned by the lead, teammates should self-claim from the task list after each completion. The lead only intervenes to:
- Steer an agent away from a bad approach
- Relay integration boundary changes
- Break ties when two agents try to claim the same task

Teammates check TaskList after every completed task and claim the next unblocked, unassigned task with the lowest ID.

## Mandatory Collaboration Protocol

Teams exist for cross-pollination, not parallel silos. Every team MUST follow these collaboration requirements:

### Discussion Before Conclusions
- Each agent MUST share preliminary findings with at least one other teammate via SendMessage BEFORE marking their task complete
- Agents MUST read and respond to messages from teammates — not just acknowledge, but engage with the content
- If two agents reach the same conclusion independently, they must verify alignment via direct message before reporting to lead

### Cross-Review Requirement
- No agent marks a task complete without sending their key findings to at least one related teammate for feedback
- Teammates receiving findings MUST respond with either agreement, disagreement, or additional context within their current turn
- The lead does NOT relay findings between agents — agents message each other directly

### Shared Context
- When the lead shares a finding from Agent A with Agent B, Agent B must message Agent A directly to discuss implications
- Agents should proactively check TaskList to see what other agents have completed and read their task descriptions for context
- If an agent's findings contradict another agent's findings, they MUST message each other to resolve before reporting to lead

### Anti-Patterns (violations)
- Agent completes task without messaging any teammate → violation
- Agent receives teammate message and doesn't respond → violation
- Lead manually relays all inter-agent context instead of agents communicating directly → lead violation
- Team produces 3 independent reports with no cross-references → team failure

## Cleanup Protocol

1. Verify all tasks are completed or explicitly deferred
2. Request shutdown for each teammate (SendMessage type: shutdown_request)
3. Wait for all shutdowns to be approved
4. Run Teammate cleanup to remove team resources
5. Summarize results to user

## Permissions

Teammates inherit the lead's permission settings from:
- .claude/settings.json (project-level)
- .claude/settings.local.json (local overrides)

Pre-approve common operations before spawning teammates to reduce friction.
