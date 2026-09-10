import { promises as fs } from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { simpleGit } from "simple-git";
import { getGitContext } from "../lib/git.js";
import { callWrapupLlm } from "../lib/llm.js";
import { redactSecrets, truncateDiff } from "../lib/secrets.js";
import {
  adrTemplate,
  sessionLogTemplate,
} from "../lib/constants.js";
import {
  loadConfig,
  nextAdrNumber,
  pruneOldSessions,
  readState,
  slugify,
  timestampFileName,
  timestampLabel,
  writeState,
} from "../lib/store.js";

export interface WrapupOptions {
  trigger?: string;
  dryRun?: boolean;
  provider?: string;
}

function simpleLineDiff(oldText: string, newText: string): string {
  const oldLines = new Set(oldText.split("\n"));
  const added = newText
    .split("\n")
    .filter((l) => l.trim() !== "" && !oldLines.has(l));
  if (added.length === 0) return "(no line-level changes detected)";
  return added
    .slice(0, 30)
    .map((l) => chalk.green("+ ") + l)
    .join("\n");
}

export async function wrapupCommand(
  cwd: string,
  opts: WrapupOptions,
): Promise<void> {
  const git = simpleGit(cwd);
  if (!(await git.checkIsRepo())) {
    console.error(chalk.red("aimemory requires a git repository."));
    process.exitCode = 1;
    throw new Error("aimemory requires a git repository.");
  }

  const trigger = opts.trigger === "commit" ? "commit" : "manual";
  const config = await loadConfig(cwd);
  if (
    opts.provider === "anthropic" ||
    opts.provider === "openai" ||
    opts.provider === "ollama" ||
    opts.provider === "openrouter" ||
    opts.provider === "opencode"
  ) {
    config.provider = opts.provider;
    if (config.apiKeyEnv === "ANTHROPIC_API_KEY") {
      if (opts.provider === "openai") config.apiKeyEnv = "OPENAI_API_KEY";
      if (opts.provider === "openrouter") config.apiKeyEnv = "OPENROUTER_API_KEY";
      if (opts.provider === "opencode") config.apiKeyEnv = "OPENCODE_API_KEY";
    }
  }

  const ctx = await getGitContext(cwd, trigger);

  if (!ctx.diff.trim()) {
    console.log(chalk.dim("nothing to summarize"));
    return;
  }

  // 3. Filter secrets BEFORE anything touches network
  const { text: redacted, skippedFiles } = redactSecrets(
    ctx.diff,
    config.secretPatterns,
  );
  if (skippedFiles.length > 0) {
    console.warn(
      chalk.yellow(
        `skipped sensitive file(s): ${skippedFiles.join(", ")}`,
      ),
    );
  }

  const { text: diffForLlm, truncated } = truncateDiff(
    redacted,
    config.maxDiffLines,
  );
  if (truncated) {
    console.warn(
      chalk.yellow(
        `Diff truncated to ${config.maxDiffLines} lines to save tokens.`,
      ),
    );
  }

  // 4. current state
  const currentState = await readState(cwd);

  // 5. LLM call
  let result;
  try {
    result = await callWrapupLlm(
      currentState,
      diffForLlm,
      ctx.commitMessage,
      config,
    );
  } catch (err) {
    // Fallback: raw diff to session log, don't touch state.md
    console.warn(
      chalk.yellow(
        `LLM wrapup failed (${err instanceof Error ? err.message : err}). Writing raw diff to session log without updating state.md.`,
      ),
    );
    const ts = timestampFileName();
    const label = timestampLabel();
    await fs.mkdir(path.join(cwd, ".aimemory", "sessions"), {
      recursive: true,
    });
    const commitInfo =
      trigger === "commit" && ctx.commitHash
        ? `${ctx.commitHash} "${ctx.commitMessage.split("\n")[0]}"`
        : "";
    const log = sessionLogTemplate(
      label,
      trigger,
      commitInfo,
      "(LLM unavailable — raw diff fallback)",
      ctx.filesChanged,
    );
    if (!opts.dryRun) {
      await fs.writeFile(
        path.join(cwd, ".aimemory", "sessions", `${ts}.md`),
        log + `\n## Raw Diff (redacted)\n\`\`\`diff\n${diffForLlm}\n\`\`\`\n`,
        "utf-8",
      );
    } else {
      console.log(log);
    }
    process.exitCode = 1;
    return;
  }

  const ts = timestampFileName();
  const label = timestampLabel();
  const commitInfo =
    trigger === "commit" && ctx.commitHash
      ? `${ctx.commitHash} "${ctx.commitMessage.split("\n")[0]}"`
      : "";
  const sessionLog = sessionLogTemplate(
    label,
    trigger,
    commitInfo,
    result.session_summary,
    ctx.filesChanged,
  );

  if (opts.dryRun) {
    console.log(chalk.cyan("--- dry-run: session log ---"));
    console.log(sessionLog);
    console.log(chalk.cyan("--- dry-run: new state.md ---"));
    console.log(result.state_md_updated);
    if (result.should_create_adr) {
      console.log(
        chalk.cyan(`--- dry-run: would create ADR "${result.adr_title}" ---`),
      );
    }
    return;
  }

  // 6. write session log (append-only new file)
  await fs.mkdir(path.join(cwd, ".aimemory", "sessions"), { recursive: true });
  await fs.writeFile(
    path.join(cwd, ".aimemory", "sessions", `${ts}.md`),
    sessionLog,
    "utf-8",
  );

  // prune session logs older than pruneSessionsAfterDays
  const pruned = await pruneOldSessions(cwd, config.pruneSessionsAfterDays);
  if (pruned.length > 0) {
    console.log(
      chalk.dim(`pruned ${pruned.length} old session log(s): ${pruned.join(", ")}`),
    );
  }

  // 7. overwrite state.md
  await writeState(cwd, result.state_md_updated);

  // 8. ADR
  if (result.should_create_adr && result.adr_title) {
    const num = await nextAdrNumber(cwd);
    const slug = slugify(result.adr_title);
    const adrPath = path.join(
      cwd,
      ".aimemory",
      "decisions",
      `${num}-${slug}.md`,
    );
    await fs.mkdir(path.dirname(adrPath), { recursive: true });
    await fs.writeFile(adrPath, adrTemplate(result.adr_title, num), "utf-8");
    console.log(chalk.green(`Created ADR: .aimemory/decisions/${num}-${slug}.md`));
  }

  // 9. terminal diff
  console.log(chalk.bold("state.md changes:"));
  console.log(simpleLineDiff(currentState, result.state_md_updated));
}
