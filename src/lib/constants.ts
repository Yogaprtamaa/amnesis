export interface AmnesisConfig {
  version: string;
  provider: "anthropic" | "openai" | "ollama" | "openrouter" | "opencode";
  model: string;
  apiKeyEnv: string;
  maxDiffLines: number;
  pruneSessionsAfterDays: number;
  secretPatterns: string[];
}

export const DEFAULT_CONFIG: AmnesisConfig = {
  version: "1.0",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  apiKeyEnv: "ANTHROPIC_API_KEY",
  maxDiffLines: 2000,
  pruneSessionsAfterDays: 30,
  secretPatterns: ["default"],
};

/** Default gratis: OpenRouter free-tier (key gratis, tanpa kartu kredit).
 *  ID model free bisa berubah — cek https://openrouter.ai/models. */
export const OPENROUTER_FREE_MODEL = "qwen/qwen-2.5-coder-32b-instruct:free";

/** Default gratis lokal (tanpa key, tanpa network): model coder kecil. */
export const OLLAMA_DEFAULT_MODEL = "qwen2.5-coder:7b";

/** OpenCode Zen — model stealth gratis via https://opencode.ai/zen/v1.
 *  Key dibuat di dashboard OpenCode (API Keys), gratis/unlimited. */
export const OPENCODE_ZEN_MODEL = "big-pickle";
export const OPENCODE_ZEN_BASE_URL = "https://opencode.ai/zen/v1";

export const CONFIG_FILE = ".aimemory/config.json";
export const STATE_FILE = ".aimemory/state.md";
export const SESSIONS_DIR = ".aimemory/sessions";
export const DECISIONS_DIR = ".aimemory/decisions";

export const INCLUDE_MARKER = "<!-- aimemory:include -->";
export const INCLUDE_MARKER_CLOSE = "<!-- /aimemory:include -->";

export const INCLUDE_BLOCK = `${INCLUDE_MARKER}
> **IMPORTANT**: Before doing anything, read \`.aimemory/state.md\` in this repo.
> It contains the current project state, active decisions, and known issues.
> Treat it as ground truth over your own assumptions about this codebase.
${INCLUDE_MARKER_CLOSE}
`;

// target flag -> convention file
export const TARGET_FILES: Record<string, string> = {
  claude: "CLAUDE.md",
  agents: "AGENTS.md",
  cursor: ".cursorrules",
  windsurf: ".windsurfrules",
  continue: ".continuerules",
};

export const ALL_KNOWN_CONVENTION_FILES = [
  "CLAUDE.md",
  "AGENTS.md",
  ".cursorrules",
  ".windsurfrules",
  ".continuerules",
];

export function stateTemplate(): string {
  const ts = new Date().toISOString();
  return `# Project State
<!-- Last updated: ${ts} by aimemory wrapup -->

## Architecture Snapshot
<!-- Stack, struktur folder penting, pattern yang dipakai -->
- (empty — run \`aimemory wrapup\` to populate)

## Active Decisions
<!-- Format: - **[Decision]**: kenapa dipilih. (ref: decisions/000X jika ada) -->
- (none yet)

## Known Issues / Tech Debt
<!-- Format: - [ ] deskripsi issue -->
- (none yet)

## Next Steps
<!-- Format: - [ ] task yang belum selesai -->
- (none yet)

## Recent Changes (last 5 sessions, auto-pruned)
<!-- LLM wajib prune entry lebih dari 5, paling lama dibuang -->
- (none yet)
`;
}

export function adrTemplate(title: string, num: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `# ADR ${num}: ${title}

Date: ${date}
Status: Accepted

## Context
<!-- Masalah / latar belakang keputusan -->

## Decision
<!-- Keputusan yang diambil -->

## Consequences
<!-- Dampak positif / negatif / tradeoff -->
`;
}

export const WRAPUP_SYSTEM_PROMPT = `You are updating a persistent project-state file for an AI coding assistant memory system.

CURRENT STATE.MD:
<state_md_content>

GIT DIFF (secrets redacted):
<diff_content>

COMMIT MESSAGE (if any):
<commit_message>

Rules:
1. Preserve the exact section headers in state.md (Architecture Snapshot, Active Decisions, Known Issues, Next Steps, Recent Changes).
2. Update sections based on the diff — do not blindly append, actually revise stale info.
3. If a decision in the diff contradicts an existing "Active Decision", update it and note it superseded the old one.
4. Keep "Recent Changes" to max 5 entries, drop oldest.
5. If this diff represents a significant architectural decision worth its own ADR (e.g. choosing a library, changing auth strategy, changing data model), set should_create_adr=true.
6. Output ONLY valid JSON matching the schema, no markdown fences, no preamble.`;

export interface WrapupLLMResult {
  state_md_updated: string;
  session_summary: string;
  should_create_adr: boolean;
  adr_title: string | null;
}

export function buildWrapupPrompt(
  stateMd: string,
  diff: string,
  commitMessage: string,
): string {
  return WRAPUP_SYSTEM_PROMPT.replace("<state_md_content>", stateMd)
    .replace("<diff_content>", diff)
    .replace("<commit_message>", commitMessage || "(none — manual trigger)");
}

export function sessionLogTemplate(
  timestampLabel: string,
  trigger: string,
  commitInfo: string,
  summary: string,
  filesChanged: string[],
): string {
  const files =
    filesChanged.length > 0
      ? filesChanged.map((f) => `- ${f}`).join("\n")
      : "- (no files detected)";
  return `# Session: ${timestampLabel}
Trigger: ${trigger}${commitInfo ? ` (${commitInfo})` : ""}

## Summary
${summary}

## Files Changed
${files}
`;
}
