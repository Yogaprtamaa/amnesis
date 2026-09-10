import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { initCommand } from "../src/commands/init.js";
import { wrapupCommand } from "../src/commands/wrapup.js";
import { setLlmCaller } from "../src/lib/llm.js";

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

describe("wrapup integration (mock LLM)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("init -> commit -> wrapup --dry-run updates state per mock schema; .env never sent to LLM", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amnesis-wrap-"));
    git(dir, "init");
    await initCommand(dir, {});

    // create normal file + sensitive .env, commit both
    await fs.writeFile(path.join(dir, "app.ts"), "console.log(1);\n", "utf-8");
    await fs.writeFile(
      path.join(dir, ".env"),
      "API_KEY=supersecret12345\n",
      "utf-8",
    );
    git(dir, "add", "-A");
    git(dir, "commit", "-m", "feat: add app");

    let capturedPrompt = "";
    setLlmCaller(async (prompt) => {
      capturedPrompt = prompt;
      return JSON.stringify({
        state_md_updated: "# Project State\n\n## Architecture Snapshot\n- app.ts added\n\n## Active Decisions\n- none\n\n## Known Issues / Tech Debt\n- none\n\n## Next Steps\n- [ ] more\n\n## Recent Changes (last 5 sessions, auto-pruned)\n- feat: add app\n",
        session_summary: "Added app.ts",
        should_create_adr: false,
        adr_title: null,
      });
    });

    await wrapupCommand(dir, { trigger: "commit", dryRun: true });

    // .env content must never reach the LLM
    expect(capturedPrompt).not.toContain("supersecret12345");
    expect(capturedPrompt).toContain("app.ts");

    // dry-run writes nothing
    const sessions = await fs.readdir(path.join(dir, ".aimemory", "sessions"));
    expect(sessions).toEqual([]);

    // non-dry-run writes session log + updates state.md
    await wrapupCommand(dir, { trigger: "commit" });
    const sessionsAfter = await fs.readdir(
      path.join(dir, ".aimemory", "sessions"),
    );
    expect(sessionsAfter.length).toBe(1);
    const state = await fs.readFile(
      path.join(dir, ".aimemory", "state.md"),
      "utf-8",
    );
    expect(state).toContain("app.ts added");
  });

  it("empty diff prints nothing-to-summarize and exits 0", async () => {    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amnesis-empty-"));
    git(dir, "init");
    await initCommand(dir, {});
    await fs.writeFile(path.join(dir, "a.txt"), "x", "utf-8");
    git(dir, "add", "-A");
    git(dir, "commit", "-m", "init");
    // clean tree -> manual wrapup has empty diff
    let called = false;
    setLlmCaller(async () => {
      called = true;
      return "{}";
    });
    await wrapupCommand(dir, { trigger: "manual" });
    expect(called).toBe(false);
  });

  it("prunes session logs older than pruneSessionsAfterDays", async () => {    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amnesis-prune-"));
    git(dir, "init");
    await initCommand(dir, {});
    await fs.writeFile(path.join(dir, "b.txt"), "v2", "utf-8");
    git(dir, "add", "-A");
    git(dir, "commit", "-m", "feat: b");

    // fake an old session log (year 2020, well beyond 30-day default)
    await fs.writeFile(
      path.join(dir, ".aimemory", "sessions", "2020-01-01-0000.md"),
      "# Session: old\n",
      "utf-8",
    );

    setLlmCaller(async () => {
      return JSON.stringify({
        state_md_updated: "# Project State\n\n## Architecture Snapshot\n- b\n",
        session_summary: "b",
        should_create_adr: false,
        adr_title: null,
      });
    });

    await wrapupCommand(dir, { trigger: "commit" });
    const sessions = await fs.readdir(path.join(dir, ".aimemory", "sessions"));
    expect(sessions).not.toContain("2020-01-01-0000.md");
    expect(sessions.length).toBe(1); // only the fresh log remains
  });

  it("manual trigger summarizes untracked files, skips .env and .aimemory", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amnesis-untracked-"));
    git(dir, "init");
    await initCommand(dir, {});
    await fs.writeFile(path.join(dir, "seed.txt"), "seed", "utf-8");
    git(dir, "add", "-A");
    git(dir, "commit", "-m", "init");

    // untracked: normal file + sensitive .env (must never reach LLM)
    await fs.writeFile(path.join(dir, "new.ts"), "export const x = 1;\n", "utf-8");
    await fs.writeFile(
      path.join(dir, ".env"),
      "API_KEY=supersecret12345\n",
      "utf-8",
    );

    let capturedPrompt = "";
    setLlmCaller(async (prompt) => {
      capturedPrompt = prompt;
      return JSON.stringify({
        state_md_updated: "# Project State\n",
        session_summary: "new.ts",
        should_create_adr: false,
        adr_title: null,
      });
    });

    await wrapupCommand(dir, { trigger: "manual", dryRun: true });
    expect(capturedPrompt).toContain("export const x = 1;");
    expect(capturedPrompt).not.toContain("supersecret12345");
    // .aimemory's own files must not be summarized (no feedback loop)
    expect(capturedPrompt).not.toContain(".aimemory/state.md");
  });
});
