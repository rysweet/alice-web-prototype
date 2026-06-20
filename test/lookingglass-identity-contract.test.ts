import { describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";

const ROOT = path.resolve(__dirname, "..");

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readText(relativePath));
}

describe("LookingGlass identity contract", () => {
  it("uses package-safe LookingGlass names in install metadata", () => {
    const packageJson = readJson("package.json") as {
      name?: string;
      bin?: Record<string, string>;
    };
    const pyproject = readText("pyproject.toml");

    expect(packageJson.name).toBe("lookingglass");
    expect(packageJson.bin).toEqual({
      lookingglass: "./dist-server/cli.js",
    });
    expect(packageJson.bin).not.toHaveProperty("alice-web");

    expect(pyproject).toContain('name = "lookingglass-amplihack"');
    expect(pyproject).toContain("LookingGlass");
    expect(pyproject).not.toContain("alice-web-prototype");
  });

  it("reports the LookingGlass runtime token without changing the health shape", async () => {
    const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), "lookingglass-contract-"));
    try {
      const app = createServer({ port: 0, evidenceDir });
      const health = await request(app).get("/api/health").expect(200);

      expect(Object.keys(health.body).sort()).toEqual([
        "launched",
        "pid",
        "runtime",
        "status",
        "uptime",
      ]);
      expect(health.body).toMatchObject({
        status: "running",
        launched: false,
        runtime: "lookingglass",
      });
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
    }
  });

  it("uses the LookingGlass command name and runtime in CLI-facing text", () => {
    const cliSource = readText("src/cli.ts");

    expect(cliSource).toContain("lookingglass serve");
    expect(cliSource).toContain("lookingglass print-config");
    expect(cliSource).toContain("lookingglass help");
    expect(cliSource).toContain('runtime: "lookingglass"');
    expect(cliSource).not.toContain("alice-web serve");
    expect(cliSource).not.toContain("typescript-web-prototype");
  });

  it("keeps existing evidence schema versions stable during the rename", () => {
    const evidenceWriterSource = readText("src/evidence-writer.ts");
    const projectServiceSource = readText("src/server/project-service.ts");

    expect(evidenceWriterSource).toContain(
      "eatme.alice-first-lesson-code-editor-action-proof/v1",
    );
    expect(projectServiceSource).toContain("eatme.alice-run-world-result/v1");
    expect(evidenceWriterSource).toContain("eatme.alice-scene-object-added/v1");
  });
});
