import { promises as fs } from "node:fs";
import * as path from "node:path";
import { simpleGit } from "simple-git";
import type { AmnesisConfig } from "./constants.js";
import {
  CONFIG_FILE,
  DECISIONS_DIR,
  DEFAULT_CONFIG,
  SESSIONS_DIR,
  STATE_FILE,
  stateTemplate,
} from "./constants.js";

export function projectRoot(cwd: string = process.cwd()): string {
  return cwd;
}

export async function ensureGitRepo(cwd: string): Promise<void> {
  const git = simpleGit(cwd);
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    console.error("aimemory requires a git repository.");
    process.exitCode = 1;
    throw new Error("aimemory requires a git repository.");
  }
}

export async function loadConfig(cwd: string): Promise<AmnesisConfig> {
  try {
    const raw = await fs.readFile(path.join(cwd, CONFIG_FILE), "utf-8");
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<AmnesisConfig>) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function readState(cwd: string): Promise<string> {
  try {
    return await fs.readFile(path.join(cwd, STATE_FILE), "utf-8");
  } catch {
    return stateTemplate();
  }
}

export async function writeState(cwd: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(path.join(cwd, STATE_FILE)), {
    recursive: true,
  });
  await fs.writeFile(path.join(cwd, STATE_FILE), content, "utf-8");
}

export async function ensureDirs(cwd: string): Promise<void> {
  await fs.mkdir(path.join(cwd, ".aimemory", "sessions"), { recursive: true });
  await fs.mkdir(path.join(cwd, ".aimemory", "decisions"), { recursive: true });
}

export async function listSessions(cwd: string): Promise<string[]> {
  try {
    const files = await fs.readdir(path.join(cwd, SESSIONS_DIR));
    return files.filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
}

export async function nextAdrNumber(cwd: string): Promise<string> {
  try {
    const files = await fs.readdir(path.join(cwd, DECISIONS_DIR));
    const nums = files
      .map((f) => f.match(/^(\d{4})-/)?.[1])
      .filter(Boolean)
      .map(Number);
    const next = nums.length > 0 ? Math.max(...(nums as number[])) + 1 : 1;
    return String(next).padStart(4, "0");
  } catch {
    return "0001";
  }
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "decision"
  );
}

export function timestampFileName(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function timestampLabel(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Delete session logs older than `days` (per config `pruneSessionsAfterDays`).
 * Only touches files matching the `YYYY-MM-DD-HHMM.md` naming scheme.
 * Returns list of deleted filenames.
 */
export async function pruneOldSessions(
  cwd: string,
  days: number,
): Promise<string[]> {
  if (!Number.isFinite(days) || days <= 0) return [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const deleted: string[] = [];
  let files: string[];
  try {
    files = await fs.readdir(path.join(cwd, SESSIONS_DIR));
  } catch {
    return [];
  }
  for (const f of files) {
    const m = f.match(
      /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.md$/,
    );
    if (!m) continue;
    const [, y, mo, d, h, mi] = m;
    const ts = new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
    ).getTime();
    if (Number.isNaN(ts) || ts >= cutoff) continue;
    try {
      await fs.unlink(path.join(cwd, SESSIONS_DIR, f));
      deleted.push(f);
    } catch {
      // ignore unlink failures — never fail wrapup over pruning
    }
  }
  return deleted;
}
