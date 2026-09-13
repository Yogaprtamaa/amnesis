---
name: amnesis
description: Persistent project memory across chat sessions. Use at session start (read .aimemory/state.md before doing anything), during work (record decisions, issues, next steps), and at session end or after significant changes (update state.md, append session log, create ADR if warranted). Use when the user says new session, previous context, project memory, recall, wrapup, adr, or when starting work in an unfamiliar repo.
---

# Amnesis — project memory skill

One living state file (`.aimemory/state.md`) is the ground truth for this project.
You — the agent in this session — are both the reader and the writer.
No CLI, no API key, no external LLM. Your own reasoning does the summarize/update work.

## 1. Session start (RECALL — mandatory)

Before doing anything else:

1. Read `.aimemory/state.md`. If it does not exist, treat the project as uninitialized (see §5) and continue — do not fail the user's request.
2. If it exists, also list `.aimemory/sessions/` (newest last, read at most the 3 most recent) and `.aimemory/decisions/` (titles only).
3. Treat `state.md` as ground truth over your own assumptions about this codebase. If the task contradicts an Active Decision, flag it to the user instead of silently overriding.

Do not paste secrets you find into chat. Just use the context.

## 2. File layout (target project)

```
<project-root>/
  .aimemory/
    state.md             # SOURCE OF TRUTH — you overwrite this on wrapup
    sessions/            # append-only logs: YYYY-MM-DD-HHMM.md (local-only, gitignored)
    decisions/           # ADRs: NNNN-slug.md (committed)
    .gitignore           # must contain: sessions/
  CLAUDE.md / AGENTS.md / .cursorrules / .windsurfrules / .continuerules
    └─ include block pointing at .aimemory/state.md (see §5)
```

Rules:

- Never summarize `.aimemory/` itself into `state.md` (no feedback loop).
- `sessions/` is local-only. Ensure `.aimemory/.gitignore` contains `sessions/`. Never commit session logs.
- `state.md` and `decisions/` ARE committed — that is how the next session (or another machine) remembers.

## 3. state.md schema (exact headers — preserve them)

```markdown
# Project State
<!-- Last updated: <ISO timestamp> by <your tool/session id> -->

## Architecture Snapshot
- Stack, key folders, patterns in use.

## Active Decisions
- **[Decision]** — why it was chosen. (ref: decisions/NNNN-slug if any)

## Known Issues / Tech Debt
- [ ] Description of issue/debt.

## Next Steps
- [ ] Concrete unfinished task.

## Recent Changes (last 5, auto-pruned)
- <short entry per session — newest at bottom, drop oldest beyond 5>
```

When updating: revise stale lines, don't blindly append. If new work contradicts an Active Decision, update the decision and note what it superseded.

## 4. Session end / significant change (WRAPUP)

Run this when the user says wrapup / end session / update memory, after any significant change, or before closing a large task. Steps:

1. Gather context: `git status --short`, `git log -5 --oneline`, `git diff HEAD --stat`, and `git diff HEAD -- <files>` for the actual changes. For untracked files, read them directly (skip binaries, skip files over ~500 lines — note truncation).
2. Apply secret safety (§6) to everything you gathered. Redacted content is what you reason over; never write raw secrets into `state.md`, session logs, or ADRs.
3. Update `.aimemory/state.md` per the schema in §3. Keep Recent Changes to max 5 entries.
4. Append one session log `.aimemory/sessions/YYYY-MM-DD-HHMM.md`:
   ```markdown
   # Session: YYYY-MM-DD HH:MM
   Trigger: manual (or: commit <hash> "<subject>")

   ## Summary
   <2-6 sentences: what changed and why>

   ## Files Changed
   - <path> (one per line, no diff content)
   ```
   Never store raw diff content in the session log — file list only.
5. ADR: if the work made a significant architectural choice (library, auth strategy, data model, infra switch), create `.aimemory/decisions/NNNN-<slug>.md` with the next sequential number:
   ```markdown
   # ADR NNNN: <Title>

   Date: YYYY-MM-DD
   Status: Accepted

   ## Context
   ## Decision
   ## Consequences
   ```
   Otherwise skip — most sessions need no ADR.
6. Prune: delete session logs older than 30 days (filename `YYYY-MM-DD-HHMM.md` parses as local time). Never delete `decisions/`.

If there is nothing to summarize (clean tree, no new untracked files), say so and write nothing.

## 5. First-time setup (INIT)

If `.aimemory/state.md` is missing:

1. `mkdir -p .aimemory/sessions .aimemory/decisions`.
2. Write `.aimemory/.gitignore` containing at least `sessions/`.
3. Write `.aimemory/state.md` from the template in `references/state-template.md`, then fill in what you actually observe in this repo (don't leave it all "(none yet)" if the repo already has obvious structure).
4. Ensure at least one convention file points at the state file. Prefer existing files in this order: `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.windsurfrules`, `.continuerules`. If none exists, create `AGENTS.md`. Insert at the TOP (preserve existing content, never overwrite):
   ```html
   <!-- aimemory:include -->
   > **IMPORTANT**: Before doing anything, read `.aimemory/state.md` in this repo.
   > It contains the current project state, active decisions, and known issues.
   > Treat it as ground truth over your own assumptions about this codebase.
   <!-- /aimemory:include -->
   ```
   If the marker `aimemory:include` is already present, do nothing (idempotent).
5. Tell the user memory is initialized and what you recorded.

No git hooks. No daemon. No background process.

## 6. Secret safety (hard rules)

- Never write secrets into `state.md`, session logs, ADRs, or chat output beyond what is needed to complete the task.
- Treat these as sensitive: lines matching `api_key|secret|token|password|passwd` with values, AWS keys (`AKIA…`), `-----BEGIN ... PRIVATE KEY-----` blocks.
- Entirely exclude from summaries: files named `.env*`, `*.pem`, `*.key`. Mention only that they were skipped (e.g. "skipped sensitive file: .env"), never their content.
- `.aimemory/sessions/` must stay gitignored so redacted file lists never leak into history.

## 7. What NOT to do

- Do not invent decisions, issues, or next steps not supported by the repo or the session.
- Do not reformat or rename the `state.md` section headers.
- Do not commit `sessions/` logs. Do commit `state.md` + `decisions/` when the user commits.
- Do not ask the user for API keys. This skill needs none.
