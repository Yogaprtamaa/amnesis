# amnesis

**Project memory skill for agentic AI coding tools. No CLI, no API key, no daemon.**

One living state file — `.aimemory/state.md` — read at session start, updated at session end, by the agent itself.

> Works with Claude Code · OpenCode · Cursor · Aider · Continue · Windsurf
> License: MIT

## The problem

Every new chat session starts with amnesia: architecture decisions, why they were made, known issues, next steps — all gone. You re-explain the same context, or the AI guesses and gets it wrong.

## The fix

This repo is a **skill**, not a program. Install it once; the agent does the rest using its own reasoning:

1. **Session start** — agent reads `.aimemory/state.md` (+ recent session logs) before doing anything.
2. **Session end** — agent updates `state.md`, appends a session log, creates an ADR if warranted.

## Install

Copy the skill into your agent's skill directory:

```sh
# Claude Code (project-level)
mkdir -p .claude/skills && cp -r skills/amnesis .claude/skills/

# OpenCode (project-level)
mkdir -p .opencode/skills && cp -r skills/amnesis .opencode/skills/

# Global (Claude Code, all projects)
cp -r skills/amnesis ~/.claude/skills/
```

Then in any project, say: *"init amnesis memory"* — the agent scaffolds `.aimemory/` and injects the include block into `CLAUDE.md` / `AGENTS.md` / `.cursorrules` (see `skills/amnesis/SKILL.md` §5).

## Usage (just talk to the agent)

| Say | Agent does (per SKILL.md) |
|---|---|
| *"read project memory"* / start of session | Reads `.aimemory/state.md` + 3 newest session logs |
| *"wrapup"* / *"update memory"* / end of session | Updates `state.md`, appends `sessions/YYYY-MM-DD-HHMM.md`, prunes logs > 30 days |
| *"record ADR: <title>"* | Creates `.aimemory/decisions/NNNN-slug.md` |
| *"init amnesis memory"* | Scaffolds `.aimemory/`, writes template `state.md`, injects include block |

## Memory layout (in your project)

```
<project-root>/
  .aimemory/
    state.md             # SOURCE OF TRUTH (committed)
    sessions/            # append-only logs, local-only (gitignored)
    decisions/           # ADRs NNNN-slug.md (committed)
    .gitignore           # contains sessions/
  CLAUDE.md / AGENTS.md / .cursorrules / …
    └─ aimemory:include block ("read .aimemory/state.md first")
```

## Secret safety

The skill hard-rules: `.env*` / `*.pem` / `*.key` files are never summarized (mentioned only as "skipped"), credential patterns are never written into memory files, `sessions/` stays gitignored. See `skills/amnesis/SKILL.md` §6.

## Repo layout (this repo)

```
skills/amnesis/SKILL.md                 # the skill (single source of truth)
skills/amnesis/references/              # state / session / ADR templates
```

## License

MIT — see LICENSE.
