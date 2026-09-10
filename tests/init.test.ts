import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";
import { INCLUDE_MARKER } from "../src/lib/constants.js";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t.t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t.t",
    },
  });
}

async function mkRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amnesis-init-"));
  git(dir, "init");
  // non-interactive: stdin not TTY in vitest, defaults to create AGENTS.md
  return dir;
}

function countMarkers(s: string): number {
  return s.split(INCLUDE_MARKER).length - 1;
}

describe("init idempotency", () => {
  it("running init twice produces identical files, no duplicate include blocks", async () => {
    const dir = await mkRepo();
    await initCommand(dir, {});
    const snapshot = async (): Promise<Record<string, string>> => {
      const out: Record<string, string> = {};
      for (const f of [
        ".aimemory/config.json",
        ".aimemory/state.md",
        "AGENTS.md",
        ".git/hooks/post-commit",
      ]) {
        out[f] = await fs.readFile(path.join(dir, f), "utf-8");
      }
      return out;
    };
    const first = await snapshot();
    expect(countMarkers(first["AGENTS.md"])).toBe(1);

    await initCommand(dir, {});
    const second = await snapshot();
    expect(second).toEqual(first);
    expect(countMarkers(second["AGENTS.md"])).toBe(1);
  });

  it("preserves existing .cursorrules content and prepends include block", async () => {
    const dir = await mkRepo();
    const custom = "# my custom rules\nrule: always use tabs\n";
    await fs.writeFile(path.join(dir, ".cursorrules"), custom, "utf-8");
    await initCommand(dir, { targets: "cursor" });
    const content = await fs.readFile(path.join(dir, ".cursorrules"), "utf-8");
    expect(content).toContain(custom.trim());
    expect(countMarkers(content)).toBe(1);
    // include block at top
    expect(content.indexOf(INCLUDE_MARKER)).toBeLessThan(
      content.indexOf("my custom rules"),
    );
  });

  it("appends to existing post-commit hook instead of overwriting", async () => {    const dir = await mkRepo();
    const hookPath = path.join(dir, ".git", "hooks", "post-commit");
    await fs.mkdir(path.dirname(hookPath), { recursive: true });
    await fs.writeFile(hookPath, "#!/bin/sh\necho hello\n", "utf-8");
    await initCommand(dir, {});
    const content = await fs.readFile(hookPath, "utf-8");
    expect(content).toContain("echo hello");
    expect(content).toContain("aimemory wrapup");
  });

  it("ensures root .gitignore covers .env without clobbering existing rules", async () => {
    const dir = await mkRepo();
    await fs.writeFile(path.join(dir, ".gitignore"), "dist/\n", "utf-8");
    await initCommand(dir, {});
    const content = await fs.readFile(path.join(dir, ".gitignore"), "utf-8");
    expect(content).toContain("dist/");
    expect(content).toContain(".env");

    // idempotent: second run adds nothing
    await initCommand(dir, {});
    const again = await fs.readFile(path.join(dir, ".gitignore"), "utf-8");
    expect(again).toBe(content);
  });
});
