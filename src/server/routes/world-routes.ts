import type { Express } from "express";
import type { ServerContext } from "../context.js";

export function registerWorldRoutes(app: Express, context: ServerContext): void {
  app.post("/api/world/run", async (_req, res) => {
    if (!context.state.launched) {
      res.status(400).json({ error: "Not launched. Call POST /api/launch first." });
      return;
    }

    const response = await context.projectService.runWorld(
      context.state,
      context.evidenceDir,
      context.evidenceService,
    );
    res.json(response);
  });
}
