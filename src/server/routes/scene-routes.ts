import type { Express } from "express";
import type { ServerContext } from "../context.js";
import { addSceneObjectToCurrentProject, DEFAULT_POSITION } from "../state.js";
import { registerSceneObjectJointsIfSupported } from "./joint-routes.js";
import {
  readJsonObjectBody,
  readOptionalStringField,
  readRequiredStringField,
} from "../validation.js";

export function registerSceneRoutes(app: Express, context: ServerContext): void {
  app.post("/api/scene/add-object", async (req, res, next) => {
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

    const modelResourceId = readOptionalStringField(body.body, "modelResourceId");
    if (!modelResourceId.ok) {
      res.status(400).json({ error: modelResourceId.error });
      return;
    }
    if (modelResourceId.value !== undefined) {
      const modelAsset = context.state.parsedProject?.importedAssets
        ?.find((asset) => asset.id === modelResourceId.value);
      if (!modelAsset || modelAsset.kind !== "model") {
        res.status(400).json({ error: `Unknown modelResourceId: ${modelResourceId.value}` });
        return;
      }
    }

    const objectName =
      name.value ?? className.value.split(".").pop()?.toLowerCase() ?? "object";
    context.state.sceneObjects.set(objectName, {
      name: objectName,
      className: className.value,
      position: { ...DEFAULT_POSITION },
      ...(modelResourceId.value !== undefined ? { modelResourceId: modelResourceId.value } : {}),
    });
    addSceneObjectToCurrentProject(context.state, {
      name: objectName,
      className: className.value,
      ...(modelResourceId.value !== undefined ? { modelResourceId: modelResourceId.value } : {}),
    });

    try {
      await registerSceneObjectJointsIfSupported(context, objectName, className.value);
    } catch (error) {
      next(error);
      return;
    }

    const artifactPath = context.evidenceService.recordSceneObjectAdded(
      context.evidenceDir,
      className.value,
      context.state.sceneObjects.size,
    );

    res.json({
      status: "added",
      objectName,
      className: className.value,
      ...(modelResourceId.value !== undefined ? { modelResourceId: modelResourceId.value } : {}),
      sceneFieldCountAfter: context.state.sceneObjects.size,
      evidenceArtifact: artifactPath,
    });
  });
}
