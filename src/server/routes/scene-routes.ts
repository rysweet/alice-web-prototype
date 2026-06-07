import type { Express } from "express";
import type { ServerContext } from "../context.js";
import { DEFAULT_POSITION } from "../state.js";

export function registerSceneRoutes(app: Express, context: ServerContext): void {
  app.post("/api/scene/add-object", (req, res) => {
    const { className, name } = req.body ?? {};
    if (!className) {
      res.status(400).json({ error: "className is required" });
      return;
    }
    const objectName =
      name ?? className.split(".").pop()?.toLowerCase() ?? "object";
    context.state.sceneObjects.set(objectName, {
      name: objectName,
      className,
      position: { ...DEFAULT_POSITION },
    });

    const artifactPath = context.evidenceService.recordSceneObjectAdded(
      context.evidenceDir,
      className,
      context.state.sceneObjects.size,
    );

    res.json({
      status: "added",
      objectName,
      className,
      sceneFieldCountAfter: context.state.sceneObjects.size,
      evidenceArtifact: artifactPath,
    });
  });
}
