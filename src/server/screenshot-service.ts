import * as fs from "fs";
import * as path from "path";
import { renderSceneToPng } from "../scene-renderer.js";
import { buildCurrentProject, type ServerState } from "./state.js";

const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbH" +
    "YQAAAABJRU5ErkJggg==",
  "base64",
);

export interface ScreenshotService {
  captureScreenshot(evidenceDir: string, state: ServerState): Promise<Record<string, unknown>>;
}

export const screenshotService: ScreenshotService = {
  async captureScreenshot(evidenceDir, state) {
    const screenshotPath = path.join(evidenceDir, "screenshot.png");

    try {
      const currentProject = buildCurrentProject(state);
      const result = await renderSceneToPng(currentProject, { width: 640, height: 480 });
      await fs.promises.writeFile(screenshotPath, result.png);

      return {
        status: "captured",
        path: screenshotPath,
        objectCount: result.objectCount,
        sceneDescription: result.sceneDescription,
        rendered: true,
      };
    } catch {
      await fs.promises.writeFile(screenshotPath, PLACEHOLDER_PNG);
      return {
        status: "captured",
        path: screenshotPath,
        placeholder: true,
        error: "Screenshot rendering failed",
      };
    }
  },
};
