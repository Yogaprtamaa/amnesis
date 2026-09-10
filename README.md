# amnesis

> Universal context memory for agentic AI coding tools. Stop re-explaining your project every new chat.

[![npm version](https://img.shields.io/npm/v/@ayogtama/amnesis?style=flat-square)](https://www.npmjs.com/package/@ayogtama/amnesis)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-green?style=flat-square)](https://nodejs.org/)

Every new session in Claude Code, Cursor, OpenCode, Aider, Windsurf, or Continue starts with amnesia: architecture decisions, the reasons behind them, known issues, and next steps — all gone. **amnesis** fixes that with a living state file (`.aimemory/state.md`) that is auto-injected into every tool's context via each tool's own convention file, and auto-updated on every commit through a git hook.

## How it works

```
git commit ──▶ post-commit hook ──▶ amnesis wrapup
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
              git diff + log          secrets redacted         current state.md
              (working tree)          (never sent to LLM)       (as context)
                    └───────────────────────┼───────────────────────┘
                                            ▼
                                     LLM summarizes
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
            state.md updated       sessions/<ts>.md log      decisions/NNNN-*.md
            (source of truth)       (append-only)             (ADR, if warranted)
```

And on the way in, every AI tool reads the state first:

```
CLAUDE.md / AGENTS.md / .cursorrules / .windsurfrules / .continuerules
  └─▶ <!-- aimemory:include --> "read .aimemory/state.md before doing anything"
```

## Install

```sh
npm i -g @ayogtama/amnesis
# exposes two binaries: `amnesis` and `aimemory` (spec-compatible alias)
```

Requires Node.js ≥ 18 and a git repository.

## Quick start

```sh
cd your-project
amnesis init                  # scaffold .aimemory/, inject context, install hook
git commit -m "feat: ..."     # hook runs wrapup automatically after each commit
amnesis status                # view state with highlighting
amnesis recall | pbcopy       # pipe plain state into any AI chat
amnesis adr "Auth strategy"   # create an architecture decision record
```

## Commands

| Command | Description |
|---|---|
| `amnesis init [--targets=…] [--no-hook] [--force]` | Scaffold `.aimemory/`, inject include blocks, install git hook |
| `amnesis wrapup [--trigger=commit\|manual] [--dry-run] [--provider=…]` | Summarize diff via LLM, update `state.md`, write session log |
| `amnesis status` | Print `state.md` with syntax highlighting + pending-change hint |
| `amnesis recall` | Print plain `state.md` — designed for piping into AI chats |
| `amnesis adr <title>` | Create a new ADR manually, opened in `$EDITOR` |

`--targets` accepts a comma-separated list: `claude,agents,cursor,windsurf,continue`. If the project has no convention file yet, `init` asks before creating `AGENTS.md` (the emerging universal standard).

## LLM providers

Only `wrapup` needs an LLM. Everything else is pure local file operations. Keys are **never stored in the repo** — config holds only the env var *name*; values come from your environment (or a gitignored `.env`, auto-loaded via dotenv).

| Provider | Flag | Key | Cost |
|---|---|---|---|
| OpenCode Zen — **Big Pickle** (recommended) | `--provider=opencode` | `OPENCODE_API_KEY` (free, unlimited — from OpenCode dashboard → API Keys) | Free |
| OpenRouter free models | `--provider=openrouter` | `OPENROUTER_API_KEY` (free signup, no credit card) | Free |
| Ollama (local, offline, private) | `--provider=ollama` | none | Free |
| Anthropic (default) | `--provider=anthropic` | `ANTHROPIC_API_KEY` | Paid |
| OpenAI | `--provider=openai` | `OPENAI_API_KEY` | Paid |

```sh
cp .env.example .env   # fill in your keys; .env is gitignored
amnesis wrapup --provider=opencode --dry-run   # test without writing files
```

To make a provider permanent, set it in `.aimemory/config.json`:

```json
{
  "provider": "opencode",
  "model": "big-pickle",
  "apiKeyEnv": "OPENCODE_API_KEY"
}
```

> **Note:** when switching providers, update `model` too — the default config ships with an Anthropic model ID. `wrapup` auto-corrects to sensible free defaults for `ollama` (`qwen2.5-coder:7b`) and `opencode` (`big-pickle`) if you forget.

## Configuration

`.aimemory/config.json`:

```json
{
  "version": "1.0",
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "apiKeyEnv": "ANTHROPIC_API_KEY",
  "maxDiffLines": 2000,
  "pruneSessionsAfterDays": 30,
  "secretPatterns": ["default"]
}
```

- `apiKeyEnv` — env var *name*, never a literal key. Missing key → `wrapup` exits 1 with setup instructions.
- `maxDiffLines` — long diffs are truncated (with a warning) to control token cost.
- `pruneSessionsAfterDays` — old session logs are pruned automatically on each wrapup.
- `secretPatterns` — extra regexes (beyond the built-ins) redacted before anything touches the network.

## Secret safety

Before any byte reaches an LLM API, diffs go through `src/lib/secrets.ts`:

- `api_key` / `secret` / `token` / `password` assignments → `[REDACTED]`
- AWS keys (`AKIA…`), PEM private-key blocks → `[REDACTED]`
- Whole files matching `.env*`, `*.pem`, `*.key` are **excluded entirely**, never redacted-in-place
- `.aimemory/` itself is never summarized (no feedback loop)
- `init` ensures the target project's root `.gitignore` covers `.env`

## Project layout (target repos)

```
<project-root>/
  .aimemory/
    config.json          # provider, model, limits (API key NOT stored here)
    state.md             # SOURCE OF TRUTH — overwritten on every wrapup
    sessions/            # append-only raw session logs, pruned by age
    decisions/           # ADRs (0001-slug.md), manual or LLM-suggested
  CLAUDE.md / AGENTS.md / .cursorrules / …
    └─ aimemory:include block (idempotent, marker-guarded)
  .git/hooks/post-commit → aimemory wrapup --trigger=commit
```

`init` never overwrites existing files: existing convention files keep their content (block prepended), existing hooks are appended to, existing configs are skipped unless `--force`.

## Error handling

- Not a git repo → exit 1 with a clear message.
- Missing API key → exit 1 with setup instructions, no silent provider fallback.
- Invalid LLM JSON → one retry with a stricter instruction, then graceful fallback (raw diff logged, `state.md` untouched).
- Empty diff → `nothing to summarize`, exit 0.

## Development

```sh
pnpm install
npm run build    # tsc → dist/
pnpm test        # vitest — secrets, init idempotency, wrapup w/ mock LLM
```

Tests use a mocked LLM and dummy secrets — no keys, no network required.

## License

MIT — see [LICENSE](LICENSE).
