import { afterEach, describe, expect, it, vi } from "vitest";
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
  it("returns a successful placeholder response when rendering fails", async () => {
    const evidenceDir = trackTempDir(makeTempDir("alice-screenshot-fallback-"));
    const screenshotPath = path.join(evidenceDir, "screenshot.png");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await screenshotService.captureScreenshot(
        evidenceDir,
        createInitialServerState(),
      );

      expect(response).toEqual({
        status: "captured",
        path: screenshotPath,
        placeholder: true,
        error: "Screenshot rendering failed",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to render screenshot; writing placeholder:",
        expect.any(Error),
      );
      expect(fs.existsSync(screenshotPath)).toBe(true);
      expect(fs.statSync(screenshotPath).size).toBeGreaterThan(0);
    } finally {
      consoleError.mockRestore();
    }
  });
});
