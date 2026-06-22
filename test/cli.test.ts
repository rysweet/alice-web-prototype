import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createServer } from "../src/server";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import type { AddressInfo } from "net";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const CLI_PATH = path.join(PROJECT_ROOT, "dist-server/cli.js");
const TEST_EVIDENCE_DIR = path.resolve(__dirname, "../.test-cli-evidence");
const CLI_SYMLINK_PATH = path.join(TEST_EVIDENCE_DIR, "alice-web-bin.js");

function runBuiltCli(args: string[], cliPath = CLI_PATH) {
  expect(
    fs.existsSync(cliPath),
    "Run npm run build:server before CLI subprocess tests",
  ).toBe(true);

  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: PROJECT_ROOT,
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
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown option: --definitely-not-valid");
    expect(result.stderr).toContain("Usage:");
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

    for (const id of ["alice-identity", "baseline-only", "howto-inventory", "coverage-evidence", "wording"]) {
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
});
