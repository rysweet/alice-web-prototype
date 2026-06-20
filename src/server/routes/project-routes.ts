import type { Express } from "express";
import type { ServerContext } from "../context.js";
import {
  readJsonObjectBody,
  readOptionalStringField,
} from "../validation.js";

export function registerProjectRoutes(app: Express, context: ServerContext): void {
  app.post("/api/project/save", async (req, res) => {
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    const saveSelector = readOptionalStringField(body.body, "saveSelector");
    if (!saveSelector.ok) {
      res.status(400).json({ error: saveSelector.error });
      return;
    }

    const targetPath = readOptionalStringField(body.body, "targetPath");
    if (!targetPath.ok) {
      res.status(400).json({ error: targetPath.error });
      return;
    }

    const response = await context.projectService.saveProject(
      context.state,
      context.evidenceDir,
      context.evidenceService,
      {
        ...(saveSelector.value !== undefined
          ? { saveSelector: saveSelector.value }
          : {}),
        ...(targetPath.value !== undefined ? { targetPath: targetPath.value } : {}),
      },
    );
    res.json(response);
  });

  app.get("/api/project/templates", (_req, res) => {
    res.json({
      templates: context.templateService.listTemplates(context.state),
    });
  });

  app.post("/api/project/new", async (req, res) => {
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    const templateId = readOptionalStringField(body.body, "templateId");
    if (!templateId.ok) {
      res.status(400).json({ error: templateId.error });
      return;
    }

    const projectName = readOptionalStringField(body.body, "projectName");
    if (!projectName.ok) {
      res.status(400).json({ error: projectName.error });
      return;
    }

    const result = await context.templateService.createProject(
      context.state,
      context.evidenceDir,
      {
        ...(templateId.value !== undefined ? { templateId: templateId.value } : {}),
        ...(projectName.value !== undefined ? { projectName: projectName.value } : {}),
      },
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
