import type { Express } from "express";
import type { ServerContext } from "../context.js";
import { DEFAULT_POSITION } from "../state.js";
import {
  readJsonObjectBody,
  readOptionalStringField,
  readRequiredStringField,
} from "../validation.js";

export function registerSceneRoutes(app: Express, context: ServerContext): void {
  app.post("/api/scene/add-object", (req, res) => {
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    const className = readRequiredStringField(body.body, "className");
    if (!className.ok) {
      res.status(400).json({ error: className.error });
      return;
    }

    const name = readOptionalStringField(body.body, "name");
    if (!name.ok) {
      res.status(400).json({ error: name.error });
      return;
    }

    const objectName =
      name.value ?? className.value.split(".").pop()?.toLowerCase() ?? "object";
    context.state.sceneObjects.set(objectName, {
      name: objectName,
      className: className.value,
      position: { ...DEFAULT_POSITION },
    });

    const artifactPath = context.evidenceService.recordSceneObjectAdded(
      context.evidenceDir,
      className.value,
      context.state.sceneObjects.size,
    );

    res.json({
      status: "added",
      objectName,
      className: className.value,
      sceneFieldCountAfter: context.state.sceneObjects.size,
      evidenceArtifact: artifactPath,
    });
  });
}
