import { promises as fs } from "node:fs";
import * as path from "node:path";
import { simpleGit } from "simple-git";

export interface GitContext {
  diff: string;
  commitMessage: string;
  commitHash: string;
  filesChanged: string[];
}

/** amnesis must not summarize its own memory files (feedback loop). */
function isManaged(p: string): boolean {
  const norm = p.replace(/\\/g, "/").replace(/^\.\//, "");
  return !norm.startsWith(".aimemory/");
}

/** Drop `diff --git` chunks for paths we never summarize (e.g. .aimemory/). */
function dropUnmanagedChunks(diff: string): string {
  if (!diff) return diff;
  const chunks = diff.split(/(?=^diff --git )/m);
  return chunks
    .filter((chunk) => {
      if (!chunk.startsWith("diff --git")) return true;
      const m =
        chunk.match(/^\+\+\+ b\/(.+?)$/m) ??
        chunk.match(/^diff --git a\/(.+?) b\/(.+?)$/m);
      const target = (m?.[1] ?? "").trim();
      if (!target || target === "/dev/null") return true;
      return isManaged(target);
    })
    .join("");
}

function filesFromDiff(diff: string): string[] {
  return diff
    .split("\n")
    .filter((l) => l.startsWith("diff --git"))
    .map((l) => {
      const m = l.match(/b\/(.+?)\s*$/);
      return m?.[1] ?? l;
    })
    .filter(isManaged);
}

const MAX_UNTRACKED_LINES = 500;

/** Render untracked working-tree files as pseudo-diff chunks so the
 *  downstream secret filter treats them exactly like tracked diffs
 *  (sensitive filenames like .env are excluded there). */
async function untrackedPseudoDiff(
  cwd: string,
  files: string[],
): Promise<string> {
  const chunks: string[] = [];
  for (const f of files) {
    if (!isManaged(f)) continue;
    let content: string;
    try {
      content = await fs.readFile(path.join(cwd, f), "utf-8");
    } catch {
      continue; // binary / unreadable / vanished — skip
    }
    if (content.includes("\0")) continue; // binary — skip
    const lines = content.split("\n");
    const truncated = lines.length > MAX_UNTRACKED_LINES;
    const body = (truncated ? lines.slice(0, MAX_UNTRACKED_LINES) : lines)
      .map((l) => `+${l}`)
      .join("\n");
    chunks.push(
      `diff --git a/${f} b/${f}\nnew file mode 100644\n--- /dev/null\n+++ b/${f}\n${body}` +
        (truncated
          ? `\n... [truncated ${lines.length - MAX_UNTRACKED_LINES} lines]`
          : ""),
    );
  }
  return chunks.join("\n");
}

export async function getGitContext(
  cwd: string,
  trigger: "commit" | "manual",
): Promise<GitContext> {
  const git = simpleGit(cwd);

  if (trigger === "commit") {
    let diff = "";
    try {
      diff = await git.diff(["HEAD~1", "HEAD"]);
    } catch {
      diff = "";
    }
    // Single-commit repo: HEAD~1 doesn't exist — diff the root commit itself.
    if (!diff.trim()) {
      try {
        diff = await git.raw([
          "show",
          "HEAD",
          "--format=",
          "--no-ext-diff",
          "--",
        ]);
      } catch {
        diff = "";
      }
    }
    let commitMessage = "";
    let commitHash = "";
    try {
      const log = await git.log(["-1", "--format=%H%x00%B%x00%an"]);
      const latest = log.latest;
      if (latest) {
        commitHash = latest.hash.slice(0, 7);
        commitMessage = (latest.message as string).trim();
      }
    } catch {
      // no commits yet
    }
    diff = dropUnmanagedChunks(diff);
    return { diff, commitMessage, commitHash, filesChanged: filesFromDiff(diff) };
  }

  // manual: working tree = tracked changes vs HEAD + untracked files.
  // (`git diff` alone misses untracked files entirely.)
  let tracked = "";
  try {
    tracked = await git.diff(["HEAD"]);
  } catch {
    // no commits yet — fall back to staged + unstaged diffs
    const staged = await git.diff(["--cached"]).catch(() => "");
    const unstaged = await git.diff().catch(() => "");
    tracked = [staged, unstaged].filter(Boolean).join("\n");
  }
  tracked = dropUnmanagedChunks(tracked);

  const status = await git.status().catch(() => null);
  const untracked = (status?.not_added ?? []).filter(isManaged);
  const pseudo = await untrackedPseudoDiff(cwd, status?.not_added ?? []);

  const diff = [tracked, pseudo].filter(Boolean).join("\n");
  const filesChanged = [
    ...filesFromDiff(tracked),
    ...untracked,
  ];
  return { diff, commitMessage: "", commitHash: "", filesChanged };
}
