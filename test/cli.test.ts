import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createServer } from "../src/server";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import type { AddressInfo } from "net";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const CLI_PATH = path.join(PROJECT_ROOT, "dist-server/cli.js");
const TEST_EVIDENCE_DIR = path.resolve(__dirname, "../.test-cli-evidence");
const CLI_SYMLINK_PATH = path.join(TEST_EVIDENCE_DIR, "alice-web-bin.js");

function runBuiltCli(args: string[], cliPath = CLI_PATH, cwd = PROJECT_ROOT) {
  expect(
    fs.existsSync(cliPath),
    "Run npm run build:server before CLI subprocess tests",
  ).toBe(true);

  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=32768" },
  });
}

function buildServerCli(): void {
  const result = spawnSync("npm", ["run", "build:server"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      [
        result.error?.message,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

describe("CLI / server lifecycle", () => {
  let server: http.Server;

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    fs.rmSync(TEST_EVIDENCE_DIR, { recursive: true, force: true });
  });

  it("starts and responds to health check", async () => {
    fs.mkdirSync(TEST_EVIDENCE_DIR, { recursive: true });
    const app = createServer({
      port: 0,
      evidenceDir: TEST_EVIDENCE_DIR,
    });

    server = app.listen(0);
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("running");
    expect(body.runtime).toBe("alice-web");
  });
});

describe("CLI argument behavior", () => {
  beforeAll(() => {
    buildServerCli();
  });

  it("imports parser helpers without executing the CLI entry point", async () => {
    const { parseArgs } = await import("../src/cli");

    expect(parseArgs(["node", "cli.js", "--help"]).command).toBe("help");
  });

  it("prints help from the built executable", () => {
    const result = runBuiltCli(["--help"]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("alice-web serve");
    expect(result.stdout).toContain("alice-web print-config");
    expect(result.stdout).toContain("alice-web alice-howto-parity-audit --output <file>");
    expect(result.stdout).toContain("--api-token <token>");
  });

  it("prints help when launched through a bin-style symlink", () => {
    fs.mkdirSync(TEST_EVIDENCE_DIR, { recursive: true });
    fs.rmSync(CLI_SYMLINK_PATH, { force: true });
    fs.symlinkSync(CLI_PATH, CLI_SYMLINK_PATH);

    const result = runBuiltCli(["help"], CLI_SYMLINK_PATH);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage:");
  });

  it("prints resolved config with port and project arguments", () => {
    const result = runBuiltCli([
      "print-config",
      "--port",
      "4187",
      "--evidence-dir",
      "evidence/custom",
      "--project",
      "stories/demo.a3p",
    ]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      command: "print-config",
      port: 4187,
      evidenceDir: path.resolve(PROJECT_ROOT, "evidence/custom"),
      project: path.resolve(PROJECT_ROOT, "stories/demo.a3p"),
      runtime: "alice-web",
    });
  });

  it("rejects invalid arguments with usage on stderr", () => {
    const result = runBuiltCli(["serve", "--definitely-not-valid"]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown option: --definitely-not-valid");
    expect(result.stderr).toContain("Usage:");
  });

  it("rejects an invalid --port value with usage error exit code 2", () => {
    const result = runBuiltCli(["serve", "--port", "not-a-port"]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--port must be a valid port number");
    expect(result.stderr).toContain("Usage:");
  });

  it("rejects Alice HowTo parity audit output when the next token is another option", () => {
    const result = runBuiltCli(["alice-howto-parity-audit", "--output", "--pretty"]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--output requires a file path");
    expect(result.stderr).toContain("Usage:");
    expect(fs.existsSync(path.join(PROJECT_ROOT, "--pretty"))).toBe(false);
  });

  it("writes Alice HowTo parity audit JSON evidence without starting the server", () => {
    fs.mkdirSync(TEST_EVIDENCE_DIR, { recursive: true });
    const auditDir = fs.mkdtempSync(path.join(TEST_EVIDENCE_DIR, "audit-"));
    const auditJson = path.join(auditDir, "alice-howto-parity-audit.json");

    const result = runBuiltCli(["alice-howto-parity-audit", "--output", auditJson]);

    expect(result.error).toBeUndefined();
    expect(result.status, [result.stdout, result.stderr].filter(Boolean).join("\n")).toBe(0);
    expect(fs.existsSync(auditJson)).toBe(true);

    const audit = JSON.parse(fs.readFileSync(auditJson, "utf8")) as {
      schemaVersion?: string;
      command?: string;
      product?: string;
      runtime?: string;
      baseline?: string;
      source?: { inventory?: string; inventoryCount?: number };
      scope?: { name?: string; included?: string[]; excluded?: string[] };
      checks?: Array<{ id?: string; status?: string }>;
      summary?: { status?: string; failed?: number };
    };
    const text = JSON.stringify(audit);

    expect(audit).toMatchObject({
      schemaVersion: "alice-web.howto-parity-audit/v1",
      command: "alice-howto-parity-audit",
      product: "Alice",
      runtime: "alice-web",
      baseline: "rysweet/RabbitHole origin/develop",
      source: {
        inventory: "src/server/alice-howto-parity-inventory.ts",
        inventoryCount: 54,
      },
      scope: {
        name: "Alice.org HowTo coverage",
      },
      summary: {
        status: "passed",
        failed: 0,
      },
    });
    expect(audit.scope?.included?.length).toBeGreaterThan(0);
    expect(audit.scope?.excluded).toEqual(expect.any(Array));
    expect((text.match(/RabbitHole/g) ?? []).length).toBe(1);

    for (const id of [
      "alice-identity",
      "baseline-only",
      "howto-inventory",
      "scenario-traceability",
      "coverage-evidence",
      "wording",
    ]) {
      expect(audit.checks?.find((check) => check.id === id)?.status, `${id} should pass`).toBe("passed");
    }

    for (const forbidden of [
      "LookingGlass",
      "alice-web-prototype",
      "launch-only",
      "launch only",
      "server parity",
      "browser parity",
      "full Alice parity",
      "retcon",
      "merge-ready",
      "quality-audit",
      "agentic",
      "L3",
      "harness",
      "fixture",
    ]) {
      expect(text, `audit evidence must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("rejects Alice HowTo parity audit output paths with missing parent directories", () => {
    const missingParentOutput = path.join(TEST_EVIDENCE_DIR, "missing-parent", "audit.json");

    const result = runBuiltCli(["alice-howto-parity-audit", "--output", missingParentOutput]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--output");
    expect(fs.existsSync(missingParentOutput)).toBe(false);
  });

  it("rejects Alice HowTo parity audit output paths that are filesystem roots", () => {
    const rootOutput = path.parse(TEST_EVIDENCE_DIR).root;

    const result = runBuiltCli(["alice-howto-parity-audit", "--output", rootOutput]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--output must point to a file path");
  });

  it("rejects Alice HowTo parity audit output paths whose parent is a file", () => {
    fs.mkdirSync(TEST_EVIDENCE_DIR, { recursive: true });
    const fileParent = path.join(TEST_EVIDENCE_DIR, "not-a-directory");
    fs.writeFileSync(fileParent, "not a directory", "utf8");
    const outputPath = path.join(fileParent, "audit.json");

    const result = runBuiltCli(["alice-howto-parity-audit", "--output", outputPath]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--output parent path is not a directory");
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it("rejects Alice HowTo parity audit output paths that already point to a directory", () => {
    fs.mkdirSync(TEST_EVIDENCE_DIR, { recursive: true });
    const outputDirectory = path.join(TEST_EVIDENCE_DIR, "audit-output-directory");
    fs.mkdirSync(outputDirectory, { recursive: true });

    const result = runBuiltCli(["alice-howto-parity-audit", "--output", outputDirectory]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--output must point to a file, not a directory");
  });

  it("rejects Alice HowTo parity audit output paths that point to symbolic links", () => {
    if (process.platform === "win32") {
      return;
    }

    fs.mkdirSync(TEST_EVIDENCE_DIR, { recursive: true });
    const linkPath = path.join(TEST_EVIDENCE_DIR, "audit-output-link.json");
    const targetPath = path.join(TEST_EVIDENCE_DIR, "audit-output-target.json");
    fs.symlinkSync(targetPath, linkPath);

    const result = runBuiltCli(["alice-howto-parity-audit", "--output", linkPath]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--output must point to a regular file, not a symbolic link");
    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it("rejects Alice HowTo parity audit output paths whose parent is not writable", () => {
    if (process.platform === "win32") {
      return;
    }

    fs.mkdirSync(TEST_EVIDENCE_DIR, { recursive: true });
    const readOnlyParent = path.join(TEST_EVIDENCE_DIR, "read-only-parent");
    fs.mkdirSync(readOnlyParent, { recursive: true });
    fs.chmodSync(readOnlyParent, 0o555);

    try {
      const outputPath = path.join(readOnlyParent, "audit.json");
      const result = runBuiltCli(["alice-howto-parity-audit", "--output", outputPath]);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("--output parent directory is not writable");
      expect(fs.existsSync(outputPath)).toBe(false);
    } finally {
      fs.chmodSync(readOnlyParent, 0o755);
    }
  });

  it("exits 1 and writes a failed summary when audit evidence is missing", () => {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alice-howto-empty-root-"));
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-howto-audit-out-"));
    const auditJson = path.join(outputDir, "alice-howto-parity-audit.json");

    try {
      const result = runBuiltCli(
        ["alice-howto-parity-audit", "--output", auditJson],
        CLI_PATH,
        emptyRoot,
      );

      expect(result.error).toBeUndefined();
      expect(result.status, [result.stdout, result.stderr].filter(Boolean).join("\n")).toBe(1);
      expect(fs.existsSync(auditJson)).toBe(true);

      const audit = JSON.parse(fs.readFileSync(auditJson, "utf8")) as {
        summary?: { status?: string; failed?: number };
        checks?: Array<{ id?: string; status?: string }>;
      };

      expect(audit.summary?.status).toBe("failed");
      expect(audit.summary?.failed ?? 0).toBeGreaterThan(0);
      expect(audit.checks?.find((check) => check.id === "coverage-evidence")?.status).toBe("failed");
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
