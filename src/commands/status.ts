import chalk from "chalk";
import { simpleGit } from "simple-git";
import { listSessions, readState } from "../lib/store.js";

export async function statusCommand(cwd: string): Promise<void> {
  const state = await readState(cwd);
  // minimal highlighting: headers bold/cyan, checkboxes yellow
  for (const line of state.split("\n")) {
    if (line.startsWith("# ")) console.log(chalk.bold.cyan(line));
    else if (line.startsWith("## ")) console.log(chalk.bold.cyan(line));
    else if (line.includes("[ ]")) console.log(chalk.yellow(line));
    else console.log(line);
  }

  const sessions = await listSessions(cwd);
  let pending = 0;
  try {
    const git = simpleGit(cwd);
    if (await git.checkIsRepo()) {
      const status = await git.status();
      pending = status.files.length;
    }
  } catch {
    pending = 0;
  }
  console.log("");
  console.log(
    chalk.dim(
      `sessions: ${sessions.length} log(s). uncommitted files: ${pending}` +
        (pending > 0 ? " (consider running `aimemory wrapup`)" : ""),
    ),
  );
}

export async function recallCommand(cwd: string): Promise<void> {
  const state = await readState(cwd);
  process.stdout.write(state.endsWith("\n") ? state : state + "\n");
}
