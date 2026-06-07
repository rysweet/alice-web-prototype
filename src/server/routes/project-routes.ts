import type { Express } from "express";
import type { ServerContext } from "../context.js";

export function registerProjectRoutes(app: Express, context: ServerContext): void {
  app.post("/api/project/save", async (req, res) => {
    const response = await context.projectService.saveProject(
      context.state,
      context.evidenceDir,
      context.evidenceService,
      req.body ?? {},
    );
    res.json(response);
  });

  app.get("/api/project/templates", (_req, res) => {
    res.json({
      templates: context.templateService.listTemplates(context.state),
    });
  });

  app.post("/api/project/new", async (req, res) => {
    const result = await context.templateService.createProject(
      context.state,
      context.evidenceDir,
      req.body ?? {},
    );

    if (!result.ok) {
      res.status(400).json({
        error: result.error,
        availableTemplates: result.availableTemplates,
      });
      return;
    }

    res.json(result.response);
  });
}
