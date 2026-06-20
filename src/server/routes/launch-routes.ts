import type { Express } from "express";
import type { ServerContext } from "../context.js";
import { validateExistingProjectRealPath, validateProjectPath } from "../validation.js";

export function registerLaunchRoutes(app: Express, context: ServerContext): void {
  app.post("/api/launch", async (req, res) => {
    const projectFile = req.body?.project ?? context.options.projectPath ?? null;
    let resolvedProjectFile: string | null = null;

    if (projectFile !== null) {
      if (typeof projectFile !== "string") {
        res.status(400).json({ error: "project path must be a string" });
        return;
      }

      const validation = validateProjectPath(projectFile, context.allowedProjectDirs);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const realPathValidation = await validateExistingProjectRealPath(
        validation.resolvedPath,
        context.allowedProjectDirs,
      );
      if (!realPathValidation.valid) {
        res.status(400).json({ error: realPathValidation.error });
        return;
      }

      resolvedProjectFile = realPathValidation.resolvedPath;
    }

    const launchResult = await context.projectService.launchProject(
      context.state,
      resolvedProjectFile,
    );
    if (!launchResult.ok) {
      res.status(400).json({ error: launchResult.error });
      return;
    }

    res.json({
      status: "launched",
      project: context.state.projectPath,
      projectName: context.state.projectName,
      sceneObjectCount: context.state.sceneObjects.size,
    });
  });
}
