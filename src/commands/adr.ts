import { promises as fs } from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import chalk from "chalk";
import { adrTemplate } from "../lib/constants.js";
import { nextAdrNumber, slugify } from "../lib/store.js";

export async function adrCommand(cwd: string, title: string): Promise<void> {
  const num = await nextAdrNumber(cwd);
  const slug = slugify(title);
  const rel = `.aimemory/decisions/${num}-${slug}.md`;
  const full = path.join(cwd, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, adrTemplate(title, num), "utf-8");
  console.log(chalk.green(`Created ${rel}`));

  const editor = process.env.EDITOR || process.env.VISUAL;
  if (editor && process.stdin.isTTY) {
    spawnSync(editor, [full], { stdio: "inherit", shell: true });
  } else {
    console.log(chalk.dim(`Set $EDITOR to open automatically. File: ${full}`));
  }
}
