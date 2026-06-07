import type { Express } from "express";
import type { ServerContext } from "../context.js";

export function registerScreenshotRoutes(app: Express, context: ServerContext): void {
  app.get("/api/screenshot", async (_req, res) => {
    const response = await context.screenshotService.captureScreenshot(
      context.evidenceDir,
      context.state,
    );
    res.json(response);
  });
}
