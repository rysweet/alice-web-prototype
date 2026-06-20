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
const CLI_SYMLINK_PATH = path.join(TEST_EVIDENCE_DIR, "lookingglass-bin.js");

function runBuiltCli(args: string[], cliPath = CLI_PATH) {
  expect(
    fs.existsSync(cliPath),
    "Run npm run build:server before CLI subprocess tests",
  ).toBe(true);

  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
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
    expect(body.runtime).toBe("lookingglass-typescript-web");
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
    expect(result.stdout).toContain("lookingglass serve");
    expect(result.stdout).toContain("lookingglass print-config");
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
      localApiToken: null,
      runtime: "lookingglass-typescript-web",
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
});
