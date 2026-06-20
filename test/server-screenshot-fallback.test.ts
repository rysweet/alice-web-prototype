import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createServer } from "../src/server";
import { screenshotService } from "../src/server/screenshot-service";
import { createInitialServerState } from "../src/server/state";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

vi.mock("../src/scene-renderer.js", () => ({
  renderSceneToPng: vi.fn(async () => {
    throw new Error("forced renderer failure");
  }),
}));

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const tempDirs: string[] = [];

function trackTempDir(dir: string): string {
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("screenshot fallback contract", () => {
  it("returns a failed placeholder response when rendering fails", async () => {
    const evidenceDir = trackTempDir(makeTempDir("alice-screenshot-fallback-"));
    const screenshotPath = path.join(evidenceDir, "screenshot.png");

    const response = await screenshotService.captureScreenshot(
      evidenceDir,
      createInitialServerState(),
    );

    expect(response).toEqual({
      status: "failed",
      path: screenshotPath,
      placeholder: true,
      rendered: false,
      error: "Screenshot rendering failed",
    });
    expect(fs.existsSync(screenshotPath)).toBe(true);
    expect(fs.statSync(screenshotPath).size).toBeGreaterThan(0);
  });

  it("returns non-2xx from the screenshot route when rendering fails", async () => {
    const evidenceDir = trackTempDir(makeTempDir("alice-screenshot-route-fallback-"));
    const screenshotPath = path.join(evidenceDir, "screenshot.png");
    const app = createServer({ port: 0, evidenceDir });

    const res = await request(app).post("/api/screenshot").send({}).expect(500);

    expect(res.body).toEqual({
      status: "failed",
      path: screenshotPath,
      placeholder: true,
      rendered: false,
      error: "Screenshot rendering failed",
    });
    expect(fs.existsSync(screenshotPath)).toBe(true);
    expect(fs.statSync(screenshotPath).size).toBeGreaterThan(0);
  });
});
