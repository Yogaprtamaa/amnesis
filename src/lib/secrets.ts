// Secret filtering — MUST run before any diff bytes touch the network.
// Spec §6.4

const CREDENTIAL_RE =
  /(api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"]?[\w\-.]{8,}/gi;
const AWS_RE = /AKIA[0-9A-Z]{16}/g;
const PRIVATE_KEY_RE =
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END(?: (?:RSA |EC )?PRIVATE KEY)?-----/g;

export interface RedactResult {
  text: string;
  skippedFiles: string[];
}

function isSensitiveFile(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? filePath;
  if (base.startsWith(".env")) return true;
  if (base.endsWith(".pem")) return true;
  if (base.endsWith(".key")) return true;
  return false;
}

/**
 * Redact secrets from a unified git diff.
 * - Files matching .env* / *.pem / *.key are excluded ENTIRELY (their hunks dropped).
 * - Credential-like values, AWS keys, and PEM blocks are replaced with [REDACTED].
 * - Extra user-supplied regex patterns (from config `secretPatterns`,
 *   ignoring the sentinel value "default") are also applied.
 * Returns redacted text + list of skipped sensitive files.
 */
export function redactSecrets(
  diff: string,
  extraPatterns: string[] = [],
): RedactResult {
  const skippedFiles: string[] = [];
  if (!diff) return { text: "", skippedFiles };

  // Split per-file on "diff --git " boundaries, keep delimiter.
  const chunks = diff.split(/(?=^diff --git )/m);
  const kept: string[] = [];

  for (const chunk of chunks) {
    const headerMatch = chunk.match(/^diff --git a\/(.+?) b\/(.+?)$/m);
    const plusMatch = chunk.match(/^\+\+\+ b\/(.+?)$/m);
    const candidate = (plusMatch?.[1] ?? headerMatch?.[2] ?? "").trim();
    // /dev/null means deleted file — still check the a/ side
    const aSide = (headerMatch?.[1] ?? "").trim();
    const target = candidate && candidate !== "/dev/null" ? candidate : aSide;
    if (target && isSensitiveFile(target)) {
      skippedFiles.push(target);
      continue; // exclude total, don't even redact — drop the chunk
    }
    kept.push(chunk);
  }

  let text = kept.join("");
  text = text.replace(PRIVATE_KEY_RE, "[REDACTED]");
  text = text.replace(AWS_RE, "[REDACTED]");
  text = text.replace(CREDENTIAL_RE, (_m, key: string) => `${key}=[REDACTED]`);
  for (const pat of extraPatterns) {
    if (!pat || pat === "default") continue;
    try {
      text = text.replace(new RegExp(pat, "gi"), "[REDACTED]");
    } catch {
      // ignore invalid user-supplied regex — defaults still applied
    }
  }

  return { text, skippedFiles };
}

/** Truncate diff to maxLines, return { text, truncated }. */
export function truncateDiff(
  diff: string,
  maxLines: number,
): { text: string; truncated: boolean } {
  const lines = diff.split("\n");
  if (lines.length <= maxLines) return { text: diff, truncated: false };
  return {
    text:
      lines.slice(0, maxLines).join("\n") +
      `\n... [truncated ${lines.length - maxLines} lines]`,
    truncated: true,
  };
}
