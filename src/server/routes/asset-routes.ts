import express, { type Express } from "express";
import {
  applySurfaceTextureBinding,
  createImportedProjectAsset,
  type ImportedProjectAssetKind,
} from "../../imported-project-assets.js";
import type { ServerContext } from "../context.js";
import { ensureCurrentProject } from "../state.js";
import {
  readJsonObjectBody,
  readOptionalStringField,
  readRequiredStringField,
} from "../validation.js";

const ASSET_UPLOAD_JSON_LIMIT = "25mb";
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export function registerAssetRoutes(app: Express, context: ServerContext): void {
  const parseAssetJson = express.json({ limit: ASSET_UPLOAD_JSON_LIMIT });

  app.post("/api/assets/import-model", parseAssetJson, (req, res) => {
    handleAssetImport(context, "model", req.body, res);
  });

  app.post("/api/assets/import-texture", parseAssetJson, (req, res) => {
    handleAssetImport(context, "texture", req.body, res);
  });

  app.post("/api/scene/apply-texture", parseAssetJson, (req, res) => {
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    const target = readOptionalStringField(body.body, "target");
    if (!target.ok) {
      res.status(400).json({ error: target.error });
      return;
    }
    if ((target.value ?? "surface") !== "surface") {
      res.status(400).json({ error: "Only the surface material target is supported" });
      return;
    }

    const objectName = readRequiredStringField(body.body, "objectName");
    if (!objectName.ok) {
      res.status(400).json({ error: objectName.error });
      return;
    }

    const textureResourceId = readRequiredStringField(body.body, "textureResourceId");
    if (!textureResourceId.ok) {
      res.status(400).json({ error: textureResourceId.error });
      return;
    }

    const project = ensureCurrentProject(context.state);
    const object = project.sceneObjects.find((candidate) => candidate.name === objectName.value);
    if (!object) {
      res.status(404).json({ error: `Scene object "${objectName.value}" was not found` });
      return;
    }

    const textureAsset = (project.importedAssets ?? [])
      .find((asset) => asset.kind === "texture" && asset.id === textureResourceId.value);
    if (!textureAsset) {
      res.status(400).json({ error: `Texture asset "${textureResourceId.value}" was not found` });
      return;
    }

    const updated = applySurfaceTextureBinding(object, textureResourceId.value);
    Object.assign(object, updated);

    res.json({
      status: "applied",
      objectName: object.name,
      materialBindings: object.materialBindings ?? [],
    });
  });
}

function handleAssetImport(
  context: ServerContext,
  kind: ImportedProjectAssetKind,
  rawBody: unknown,
  res: express.Response,
): void {
  const body = readJsonObjectBody(rawBody);
  if (!body.ok) {
    res.status(400).json({ error: body.error });
    return;
  }

  const fileName = readRequiredStringField(body.body, "fileName");
  if (!fileName.ok) {
    res.status(400).json({ error: fileName.error });
    return;
  }

  const displayName = readOptionalStringField(body.body, "displayName");
  if (!displayName.ok) {
    res.status(400).json({ error: displayName.error });
    return;
  }

  const contentBase64 = readBase64Field(body.body, "contentBase64");
  if (!contentBase64.ok) {
    res.status(400).json({ error: contentBase64.error });
    return;
  }

  let creation: ReturnType<typeof createImportedProjectAsset>;
  try {
    const project = ensureCurrentProject(context.state);
    creation = createImportedProjectAsset({
      kind,
      fileName: fileName.value,
      ...(displayName.value !== undefined ? { displayName: displayName.value } : {}),
      bytes: Buffer.from(contentBase64.value, "base64"),
    }, project.importedAssets ?? []);

    project.importedAssets = [...(project.importedAssets ?? []), creation.asset];
    context.state.resources.set(creation.archivePath, creation.resourceBytes);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    return;
  }

  res.json({
    status: "imported",
    asset: creation.asset,
  });
}

function readBase64Field(
  body: Record<string, unknown>,
  fieldName: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = body[fieldName];
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, error: `${fieldName} is required and must be a non-empty base64 string` };
  }
  if (value.length % 4 !== 0 || !BASE64_RE.test(value)) {
    return { ok: false, error: `${fieldName} must be valid base64` };
  }
  return { ok: true, value };
}
