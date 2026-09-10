<div align="center">

# amnesis

**Universal context memory for agentic AI coding tools.**

Stop re-explaining your project every new chat.  
One living state file — read by every AI tool, updated on every commit.

[![npm version](https://img.shields.io/npm/v/@ayogtama/amnesis?style=flat-square)](https://www.npmjs.com/package/@ayogtama/amnesis)
[![npm downloads](https://img.shields.io/npm/dm/@ayogtama/amnesis?style=flat-square)](https://www.npmjs.com/package/@ayogtama/amnesis)
[![node](https://img.shields.io/badge/node-%3E%3D18-green?style=flat-square)](https://nodejs.org/)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/Yogaprtamaa/amnesis/pulls)

Works with Claude Code · Cursor · OpenCode · Aider · Continue · Windsurf

</div>

---

## The problem

Every new session in any agentic coding tool starts with amnesia: architecture decisions, the reasons behind them, known issues, and next steps — all gone. You re-explain the same context, or the AI guesses and gets it wrong.

## The fix

`amnesis` keeps a single living state file — `.aimemory/state.md` — that is:

1. **Auto-read** by every AI tool, via each tool's own convention file (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, …)
2. **Auto-updated** on every commit, via a git hook that summarizes your diff with an LLM

```console
$ cd your-project
$ amnesis init
✓ Created: .aimemory/config.json, .aimemory/state.md, AGENTS.md
✓ Updated: .gitignore, .git/hooks/post-commit

$ git commit -m "feat: switch session store to redis"
  → wrapup: state.md updated, session logged, ADR suggested

$ amnesis status
# Project State
## Active Decisions
- **[Session store: Redis]** — chosen over in-memory for multi-instance deploys.
## Next Steps
- [ ] Add Redis connection retry with backoff
```

## Features

- 🧠 **Tool-agnostic memory** — one state file, injected into 5+ AI tools via their native conventions. No plugins, no APIs, just files on disk.
- 🤖 **Hands-free updates** — a `post-commit` hook runs `wrapup` after every commit. No daemon, no watcher.
- 🆓 **Free LLM paths** — OpenCode Zen (Big Pickle, unlimited), OpenRouter `:free` models, or fully-offline Ollama. Paid providers (Anthropic, OpenAI) also supported.
- 🔒 **Secrets never leave your machine unredacted** — credentials, AWS keys, PEM blocks, and whole `.env`/`*.pem`/`*.key` files are stripped before any network call.
- 🧾 **ADRs on autopilot** — significant architectural changes trigger Architecture Decision Records; manual ones via `amnesis adr`.
- 🧹 **Self-maintaining** — session logs pruned by age, "Recent Changes" capped at 5, `.aimemory/` never summarizes itself.

## Requirements

- Node.js ≥ 18
- A git repository (target projects)

## Installation

```sh
npm i -g @ayogtama/amnesis
# pnpm add -g @ayogtama/amnesis
# yarn global add @ayogtama/amnesis
# bun add -g @ayogtama/amnesis
```

Exposes two binaries: `amnesis` and `aimemory` (spec-compatible alias).

Verify:

```sh
amnesis --help
```

## Usage

```sh
amnesis init                  # scaffold .aimemory/, inject context, install hook
git commit -m "feat: ..."     # hook runs wrapup automatically
amnesis status                # view state with highlighting
amnesis recall | pbcopy       # pipe plain state into any AI chat
amnesis adr "Auth strategy"   # create an ADR manually (opens $EDITOR)
```

### Commands

| Command | Description |
|---|---|
| `amnesis init [--targets=…] [--no-hook] [--force]` | Scaffold `.aimemory/`, inject include blocks, install git hook |
| `amnesis wrapup [--trigger=commit\|manual] [--dry-run] [--provider=…]` | Summarize diff via LLM, update `state.md`, write session log |
| `amnesis status` | Print `state.md` with highlighting + pending-change hint |
| `amnesis recall` | Print plain `state.md` — designed for piping into AI chats |
| `amnesis adr <title>` | Create a new ADR manually |

`--targets` accepts `claude,agents,cursor,windsurf,continue`. If the project has no convention file yet, `init` asks before creating `AGENTS.md` (the emerging universal standard) — never silently.

### How the memory flows

```
git commit ──▶ post-commit hook ──▶ amnesis wrapup
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            ▼                           ▼                           ▼
      git diff + log            secrets redacted              current state.md
      (working tree)            (never sent to LLM)            (as context)
            └───────────────────────────┼───────────────────────────┘
                                        ▼
                                 LLM summarizes
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            ▼                           ▼                           ▼
      state.md updated          sessions/<ts>.md log         decisions/NNNN-*.md
      (source of truth)          (append-only)                (ADR, if warranted)
```

And on the way in:

```
CLAUDE.md / AGENTS.md / .cursorrules / .windsurfrules / .continuerules
  └─▶ <!-- aimemory:include --> "read .aimemory/state.md before doing anything"
```

## LLM providers

Only `wrapup` needs an LLM — everything else is local file I/O. Keys are **never stored in the repo**: config holds only the env var *name*; values come from your environment or a gitignored `.env` (auto-loaded).

| Provider | Flag | Key | Cost |
|---|---|---|---|
| OpenCode Zen — Big Pickle ✅ | `--provider=opencode` | `OPENCODE_API_KEY` (free, unlimited — OpenCode dashboard → API Keys) | Free |
| OpenRouter free models | `--provider=openrouter` | `OPENROUTER_API_KEY` (free signup, no credit card) | Free |
| Ollama (offline, private) | `--provider=ollama` | none | Free |
| Anthropic (default) | `--provider=anthropic` | `ANTHROPIC_API_KEY` | Paid |
| OpenAI | `--provider=openai` | `OPENAI_API_KEY` | Paid |

```sh
cp .env.example .env   # fill in your keys; .env is gitignored
amnesis wrapup --provider=opencode --dry-run   # test without writing files
```

Pin a provider permanently in `.aimemory/config.json`:

```json
{
  "provider": "opencode",
  "model": "big-pickle",
  "apiKeyEnv": "OPENCODE_API_KEY"
}
```

> When switching providers, update `model` too — the default config ships with an Anthropic model ID. `wrapup` auto-corrects to free defaults for `ollama` (`qwen2.5-coder:7b`) and `opencode` (`big-pickle`) if you forget.

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

| Key | Meaning |
|---|---|
| `apiKeyEnv` | Env var *name*, never a literal key. Missing key → exit 1 with setup instructions. |
| `maxDiffLines` | Long diffs truncated (with warning) to bound token cost. |
| `pruneSessionsAfterDays` | Old session logs pruned automatically on each wrapup. |
| `secretPatterns` | Extra redaction regexes on top of the built-ins. |

## Secret safety

Before any byte reaches an LLM API, diffs pass through `src/lib/secrets.ts`:

- `api_key` / `secret` / `token` / `password` values → `[REDACTED]`
- AWS keys (`AKIA…`), PEM private-key blocks → `[REDACTED]`
- Whole files matching `.env*`, `*.pem`, `*.key` excluded **entirely**
- `.aimemory/` itself is never summarized (no feedback loop)
- `init` ensures the target repo's root `.gitignore` covers `.env`

## Repository layout (target projects)

```
<project-root>/
  .aimemory/
    config.json          # provider, model, limits (keys NOT stored here)
    state.md             # SOURCE OF TRUTH — overwritten on every wrapup
    sessions/            # append-only logs, pruned by age
    decisions/           # ADRs (0001-slug.md), manual or LLM-suggested
  CLAUDE.md / AGENTS.md / .cursorrules / …
    └─ aimemory:include block (idempotent, marker-guarded)
  .git/hooks/post-commit → aimemory wrapup --trigger=commit
```

`init` is non-destructive by design: existing convention files keep their content (block prepended, never overwritten), existing hooks are appended to, existing configs are skipped unless `--force`.

## FAQ

**Does it send my code to the cloud?**
Only the git diff — after secret redaction — and only during `wrapup`. Use `--provider=ollama` for a fully offline setup where nothing leaves your machine.

**What does it cost?**
Nothing, if you use OpenCode Zen, OpenRouter `:free` models, or Ollama. Paid providers are opt-in.

**Which AI tools are supported?**
Any tool that reads convention files: Claude Code (`CLAUDE.md`), OpenCode/Cursor/Aider (`AGENTS.md`), Cursor (`.cursorrules`), Windsurf (`.windsurfrules`), Continue (`.continuerules`). Anything else works via `amnesis recall` piped into chat.

**Why is my hook not running?**
Check `.git/hooks/post-commit` is executable and that the `amnesis`/`aimemory` binary is on `PATH`. The hook ends with `|| true`, so commits never break even if `wrapup` fails.

**Empty diff says "nothing to summarize"?**
`wrapup` only sees tracked changes plus new files. Commit or stage your work first — or pass `--trigger=manual` with uncommitted changes present.

## Contributing

PRs welcome! Quick start:

```sh
pnpm install
npm run build    # tsc → dist/
pnpm test        # vitest: secrets, init idempotency, wrapup with mock LLM
```

Tests use a mocked LLM and dummy secrets — no API keys, no network required. Please keep `src/` dependency-light (no heavy frameworks) and add tests for new behavior.

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
Built for developers who are tired of repeating themselves.
</div>
