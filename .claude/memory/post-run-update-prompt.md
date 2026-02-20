# Post-Run Prompting Guide Update — Agent Prompt Template

Paste this into a Task tool call after every team run to auto-update the prompting guides.

## Prompt

```
Read the team run transcripts and update the model prompting guides.

TRANSCRIPTS TO READ:
[paste output file paths here]

GUIDES TO UPDATE:
- .claude/memory/haiku-prompting.md
- .claude/memory/sonnet-prompting.md
- .claude/memory/opus-prompting.md

FOR EACH AGENT IN THE TRANSCRIPTS:
1. Identify the model used (Haiku/Sonnet/Opus)
2. Extract: what task was assigned, did it succeed or fail, WHY
3. Note specific prompting patterns that worked or failed
4. Add a row to the Run Log table in the relevant guide
5. If a new "What Works" or "What Fails" pattern is identified, add it (don't duplicate existing entries)
6. If an existing pattern is contradicted by new evidence, update it with the new finding

RULES:
- Only add findings supported by evidence in the transcripts
- Keep entries concise — one line per finding
- Don't remove existing entries unless contradicted
- Add date and team name to every Run Log entry
- If a model succeeded where it previously failed, note what changed in the prompt
```
