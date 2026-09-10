import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/lib/secrets.js";

describe("secret filtering (§6.4)", () => {
  it("redacts api_key assignments", () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
+const api_key = "supersecret12345";
`;
    const { text } = redactSecrets(diff);
    expect(text).not.toContain("supersecret12345");
    expect(text).toContain("[REDACTED]");
  });

  it("redacts secret/token/password variants case-insensitively", () => {
    const diff = `diff --git a/a.ts b/a.ts
+SECRET = mysecretvalue99
+Token: abcdefgh12345678
+password: hunter2hunter2
+passwd=supersecretpw
`;
    const { text } = redactSecrets(diff);
    expect(text).not.toContain("mysecretvalue99");
    expect(text).not.toContain("abcdefgh12345678");
    expect(text).not.toContain("hunter2hunter2");
    expect(text).not.toContain("supersecretpw");
  });

  it("redacts AWS access keys", () => {
    const diff = `diff --git a/a.ts b/a.ts
+key = AKIAIOSFODNN7EXAMPLE
`;
    const { text } = redactSecrets(diff);
    expect(text).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(text).toContain("[REDACTED]");
  });

  it("redacts private key blocks", () => {
    const diff = `diff --git a/a.ts b/a.ts
+-----BEGIN RSA PRIVATE KEY-----
+MIIEpAIBAAKCAQEA7b...
+-----END RSA PRIVATE KEY-----
`;
    const { text } = redactSecrets(diff);
    expect(text).not.toContain("MIIEpAIBAAKCAQEA7b");
    expect(text).not.toContain("PRIVATE KEY");
    expect(text).toContain("[REDACTED]");
  });

  it("excludes .env files entirely and reports them", () => {
    const diff = `diff --git a/.env b/.env
new file mode 100644
--- /dev/null
+++ b/.env
+API_KEY=supersecret12345
+DEBUG=true
diff --git a/src/app.ts b/src/app.ts
+console.log("hello");
`;
    const { text, skippedFiles } = redactSecrets(diff);
    expect(skippedFiles).toContain(".env");
    expect(text).not.toContain("supersecret12345");
    expect(text).toContain('console.log("hello")');
  });

  it("excludes *.pem and *.key files entirely", () => {
    const diff = `diff --git a/cert.pem b/cert.pem
+-----BEGIN PRIVATE KEY-----
+abc
+-----END PRIVATE KEY-----
diff --git a/key.key b/key.key
+secretdata
diff --git a/ok.ts b/ok.ts
+fine
`;
    const { text, skippedFiles } = redactSecrets(diff);
    expect(skippedFiles).toContain("cert.pem");
    expect(skippedFiles).toContain("key.key");
    expect(text).toContain("fine");
    expect(text).not.toContain("secretdata");
  });

  it("handles empty diff", () => {
    expect(redactSecrets("")).toEqual({ text: "", skippedFiles: [] });
  });

  it("applies extra user-supplied patterns, ignores 'default' sentinel", () => {
    const diff = `diff --git a/a.ts b/a.ts
+internal-id: ORG-SECRET-999
+hello world
`;
    const { text } = redactSecrets(diff, ["default", "ORG-SECRET-\\d+"]);
    expect(text).not.toContain("ORG-SECRET-999");
    expect(text).toContain("hello world");
  });

  it("ignores invalid extra patterns without breaking defaults", () => {
    const diff = `diff --git a/a.ts b/a.ts
+api_key = "supersecret12345"
`;
    const { text } = redactSecrets(diff, ["([invalid"]);
    expect(text).not.toContain("supersecret12345");
  });
});
