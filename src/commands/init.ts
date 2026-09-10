import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import chalk from "chalk";
import {
  ALL_KNOWN_CONVENTION_FILES,
  CONFIG_FILE,
  DEFAULT_CONFIG,
  INCLUDE_BLOCK,
  INCLUDE_MARKER,
  STATE_FILE,
  TARGET_FILES,
  stateTemplate,
} from "../lib/constants.js";
import { ensureDirs } from "../lib/store.js";

export interface InitOptions {
  targets?: string;
  noHook?: boolean;
  force?: boolean;
}

function parseTargets(targets?: string): string[] {
  if (targets) {
    return targets
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .map((t) => TARGET_FILES[t])
      .filter((f): f is string => Boolean(f));
  }
  return [];
}

async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await new Promise<string>((resolve) =>
      rl.question(question, resolve),
    );
  } finally {
    rl.close();
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function injectIncludeBlock(
  cwd: string,
  fileName: string,
): Promise<"created" | "appended" | "skipped"> {
  const full = path.join(cwd, fileName);
  if (!(await fileExists(full))) {
    await fs.writeFile(full, INCLUDE_BLOCK, "utf-8");
    return "created";
  }
  const content = await fs.readFile(full, "utf-8");
  if (content.includes(INCLUDE_MARKER)) return "skipped";
  // append block at TOP per spec, preserve existing content
  await fs.writeFile(full, INCLUDE_BLOCK + "\n" + content, "utf-8");
  return "appended";
}

const HOOK_LINE = "aimemory wrapup --trigger=commit";
const HOOK_LINE_ALT = "amnesis wrapup --trigger=commit";

function hookScript(): string {
  return `#!/bin/sh
# installed by aimemory init — updates .aimemory/state.md after each commit
${HOOK_LINE} || true
`;
}

export async function installHook(
  cwd: string,
): Promise<"installed" | "appended" | "skipped"> {
  const hookPath = path.join(cwd, ".git", "hooks", "post-commit");
  if (!(await fileExists(hookPath))) {
    await fs.mkdir(path.dirname(hookPath), { recursive: true });
    await fs.writeFile(hookPath, hookScript(), { mode: 0o755 });
    return "installed";
  }
  const content = await fs.readFile(hookPath, "utf-8");
  if (content.includes(HOOK_LINE) || content.includes(HOOK_LINE_ALT)) {
    return "skipped";
  }
  await fs.appendFile(hookPath, `\n${HOOK_LINE} || true\n`);
  try {
    await fs.chmod(hookPath, 0o755);
  } catch {
    // ignore on non-posix
  }
  console.warn(
    chalk.yellow(
      "Warning: existing post-commit hook found — appended aimemory wrapup call instead of overwriting.",
    ),
  );
  return "appended";
}

export async function initCommand(
  cwd: string,
  opts: InitOptions,
): Promise<void> {
  const { simpleGit } = await import("simple-git");
  const git = simpleGit(cwd);
  if (!(await git.checkIsRepo())) {
    console.error(chalk.red("aimemory requires a git repository."));
    process.exitCode = 1;
    throw new Error("aimemory requires a git repository.");
  }

  const created: string[] = [];
  const changed: string[] = [];

  await ensureDirs(cwd);

  // config
  const configPath = path.join(cwd, CONFIG_FILE);
  if ((await fileExists(configPath)) && !opts.force) {
    console.warn(chalk.yellow(`${CONFIG_FILE} exists — skipping (use --force to overwrite).`));
  } else {
    if ((await fileExists(configPath)) && opts.force) {
      const ans = await ask(`Overwrite ${CONFIG_FILE}? (y/N) `);
      if (ans.trim().toLowerCase() !== "y") {
        console.log(chalk.dim("Kept existing config."));
      } else {
        await fs.writeFile(
          configPath,
          JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n",
          "utf-8",
        );
        created.push(CONFIG_FILE);
      }
    } else {
      await fs.writeFile(
        configPath,
        JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n",
        "utf-8",
      );
      created.push(CONFIG_FILE);
    }
  }

  // state.md
  const statePath = path.join(cwd, STATE_FILE);
  if (!(await fileExists(statePath))) {
    await fs.writeFile(statePath, stateTemplate(), "utf-8");
    created.push(STATE_FILE);
  }

  // .gitignore inside .aimemory (ignore config.json if it stores local key)
  const giPath = path.join(cwd, ".aimemory", ".gitignore");
  if (!(await fileExists(giPath))) {
    await fs.writeFile(giPath, "config.json\n", "utf-8");
    created.push(".aimemory/.gitignore");
  }

  // root .gitignore: pastikan .env tidak ke-commit (key hanya di local)
  const rootGi = path.join(cwd, ".gitignore");
  if (!(await fileExists(rootGi))) {
    await fs.writeFile(rootGi, ".env\n.env.local\n", "utf-8");
    created.push(".gitignore");
  } else {
    const content = await fs.readFile(rootGi, "utf-8");
    const lines = new Set(
      content.split("\n").map((l) => l.trim()),
    );
    const missing = [".env", ".env.local"].filter((l) => !lines.has(l));
    if (missing.length > 0) {
      await fs.appendFile(
        rootGi,
        (content.endsWith("\n") ? "" : "\n") + missing.join("\n") + "\n",
      );
      changed.push(".gitignore");
    }
  }

  // convention files
  let targets = parseTargets(opts.targets);
  if (targets.length === 0) {
    const existing = [];
    for (const f of ALL_KNOWN_CONVENTION_FILES) {
      if (await fileExists(path.join(cwd, f))) existing.push(f);
    }
    if (existing.length > 0) {
      targets = existing;
    } else {
      // interactive prompt; default AGENTS.md
      let answer = "y";
      if (process.stdin.isTTY) {
        answer = await ask(
          "Detected git repo without CLAUDE.md/AGENTS.md. Create AGENTS.md as universal convention? (Y/n) ",
        );
      }
      if (answer.trim().toLowerCase() !== "n") {
        targets = ["AGENTS.md"];
      } else {
        targets = [];
      }
    }
  }

  for (const t of targets) {
    const res = await injectIncludeBlock(cwd, t);
    if (res === "created") created.push(t);
    else if (res === "appended") changed.push(t);
  }

  // hook
  if (!opts.noHook) {
    const res = await installHook(cwd);
    if (res === "installed") created.push(".git/hooks/post-commit");
    else if (res === "appended") changed.push(".git/hooks/post-commit");
  }

  console.log(chalk.green("aimemory init complete."));
  if (created.length > 0) console.log(chalk.green("Created: ") + created.join(", "));
  if (changed.length > 0) console.log(chalk.cyan("Updated: ") + changed.join(", "));
  if (created.length === 0 && changed.length === 0) {
    console.log(chalk.dim("Nothing to do — already initialized."));
  }
}
