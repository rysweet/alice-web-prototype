import * as fs from "fs";
import * as path from "path";
import { timingSafeEqual } from "crypto";
import type { Express, NextFunction, Response } from "express";
import {
  ProjectAudioError,
  addAudioCue,
  addProjectAudioResource,
  getSupportedAudioFormats,
  registerAudioAsset,
  removeAudioCue,
  setBackgroundMusic,
  setBackgroundAudio,
  startAudioCue,
  stopAudioCue,
  upsertAudioCue,
  validateProjectAudioState,
  type AudioCueState,
  type BackgroundAudioState,
  type ProjectAudioResource,
} from "../../project-audio.js";
import type { ServerContext } from "../context.js";
import { LOCAL_API_TOKEN_HEADER } from "../security.js";
import {
  readJsonObjectBody,
  readRequiredStringField,
} from "../validation.js";

const MAX_AUDIO_BASE64_LENGTH = 1024 * 1024;
const AUDIO_STATE_SCHEMA_VERSION = "eatme.alice-audio-workflow-state/v1";

export function registerAudioRoutes(app: Express, context: ServerContext): void {
  app.get("/api/audio/formats", (_req, res) => {
    res.json({ formats: getSupportedAudioFormats() });
  });

  app.get("/api/audio/state", requireAudioReadToken(context), (_req, res) => {
    res.json({
      ...audioEnvelope(context, "state"),
      ...toAudioStateResponse(context),
    });
  });

  app.post("/api/audio/assets", (req, res) => {
    if (!context.state.launched) {
      res.status(400).json({ error: "Not launched. Call POST /api/launch first." });
      return;
    }

    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }
    const fileName = readRequiredStringField(body.body, "fileName");
    if (!fileName.ok) {
      res.status(400).json({ error: fileName.error });
      return;
    }
    let dataBase64: string;
    try {
      dataBase64 = readRequiredBase64Field(body.body, "dataBase64");
    } catch (error) {
      if (error instanceof ProjectAudioError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }

    try {
      const bytes = decodeBase64(dataBase64);
      const durationSeconds = readOptionalNumber(body.body, "durationSeconds");
      const asset = registerAudioAsset(context.state.projectAudio, {
        fileName: fileName.value,
        bytes,
        durationSeconds,
      });
      context.state.resources.set(asset.resourcePath, bytes);
      res.json({ status: "registered", asset });
    } catch (error) {
      if (error instanceof ProjectAudioError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

  app.post("/api/audio/resources", (req, res, next) => {
    if (!context.state.launched) {
      res.status(400).json({ error: "Not launched. Call POST /api/launch first." });
      return;
    }

    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    try {
      const bytes = decodeBase64(readRequiredBase64Field(body.body, "bytesBase64"));
      const resource: ProjectAudioResource = {
        id: readRequiredWorkflowString(body.body, "id"),
        name: readRequiredWorkflowString(body.body, "name"),
        path: readRequiredWorkflowString(body.body, "path"),
        format: readRequiredWorkflowString(body.body, "format") as ProjectAudioResource["format"],
        sizeBytes: bytes.byteLength,
        duration: readOptionalNumber(body.body, "duration") ?? 0,
        decodeStatus: "decode-unavailable",
      };
      context.state.aliceAudio = addProjectAudioResource(context.state.aliceAudio, resource);
      context.state.resources.set(resource.path, bytes);
      const response = audioEnvelope(context, "add-resource");
      writeAudioStateEvidence(context, response);
      res.json(response);
    } catch (error) {
      if (error instanceof ProjectAudioError) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  app.post("/api/audio/background", (req, res) => {
    if (!context.state.launched) {
      res.status(400).json({ error: "Not launched. Call POST /api/launch first." });
      return;
    }

    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }
    if ("resourceId" in body.body) {
      try {
        const background = readBackgroundAudioInput(body.body);
        context.state.aliceAudio = setBackgroundAudio(context.state.aliceAudio, background);
        const response = audioEnvelope(context, "set-background");
        writeAudioStateEvidence(context, response);
        res.json(response);
      } catch (error) {
        if (error instanceof ProjectAudioError) {
          res.status(400).json({ error: error.message });
          return;
        }
        throw error;
      }
      return;
    }

    const assetId = readRequiredStringField(body.body, "assetId");
    if (!assetId.ok) {
      res.status(400).json({ error: assetId.error });
      return;
    }

    try {
      const backgroundMusic = setBackgroundMusic(context.state.projectAudio, {
        assetId: assetId.value,
        volume: readOptionalNumber(body.body, "volume"),
        loop: readOptionalBoolean(body.body, "loop"),
      });
      res.json({ status: "configured", backgroundMusic });
    } catch (error) {
      if (error instanceof ProjectAudioError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

  app.post("/api/audio/cues", (req, res) => {
    if (!context.state.launched) {
      res.status(400).json({ error: "Not launched. Call POST /api/launch first." });
      return;
    }

    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }
    if ("resourceId" in body.body) {
      try {
        const cue = readAudioCueInput(body.body);
        context.state.aliceAudio = upsertAudioCue(context.state.aliceAudio, cue);
        const response = audioEnvelope(context, "upsert-cue");
        writeAudioStateEvidence(context, response);
        res.json(response);
      } catch (error) {
        if (error instanceof ProjectAudioError) {
          res.status(400).json({ error: error.message });
          return;
        }
        throw error;
      }
      return;
    }

    const id = readRequiredStringField(body.body, "id");
    const assetId = readRequiredStringField(body.body, "assetId");
    const animationId = readRequiredStringField(body.body, "animationId");
    if (!id.ok) {
      res.status(400).json({ error: id.error });
      return;
    }
    if (!assetId.ok) {
      res.status(400).json({ error: assetId.error });
      return;
    }
    if (!animationId.ok) {
      res.status(400).json({ error: animationId.error });
      return;
    }

    try {
      const cue = addAudioCue(context.state.projectAudio, {
        id: id.value,
        assetId: assetId.value,
        animationId: animationId.value,
        timelineTimeSeconds: readRequiredNumber(body.body, "timelineTimeSeconds"),
        volume: readOptionalNumber(body.body, "volume"),
      });
      res.json({ status: "configured", cue });
    } catch (error) {
      if (error instanceof ProjectAudioError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

  app.post("/api/audio/cues/:cueId/play", (req, res, next) => {
    runCueOperation(context, req.params.cueId, res, next, "start-cue", startAudioCue);
  });

  app.post("/api/audio/cues/:cueId/stop", (req, res, next) => {
    runCueOperation(context, req.params.cueId, res, next, "stop-cue", stopAudioCue);
  });

  app.delete("/api/audio/cues/:cueId", (req, res, next) => {
    runCueOperation(context, req.params.cueId, res, next, "remove-cue", removeAudioCue);
  });

  app.post("/api/audio/evidence", (req, res) => {
    if (!context.state.launched) {
      res.status(400).json({ error: "Not launched. Call POST /api/launch first." });
      return;
    }

    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }
    try {
      const savedProjectArtifact = readOptionalString(body.body, "savedProjectArtifact");
      const reloaded = readOptionalBoolean(body.body, "reloaded") ?? false;
      const evidenceArtifact = context.evidenceService.recordAudioWorkflow(
        context.evidenceDir,
        {
          supportedFormats: getSupportedAudioFormats(),
          state: context.state.projectAudio,
          savedProjectArtifact,
          reloaded,
        },
      );
      res.json({
        schema_version: "alice.audio-workflow-result/v1",
        status: "bounded",
        evidenceArtifact,
      });
    } catch (error) {
      if (error instanceof ProjectAudioError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  });
}

function toAudioStateResponse(context: ServerContext): Record<string, unknown> {
  return {
    supportedFormats: getSupportedAudioFormats(),
    assets: context.state.projectAudio.assets,
    backgroundMusic: context.state.projectAudio.backgroundMusic,
    cues: context.state.projectAudio.cues,
  };
}

function requireAudioReadToken(context: ServerContext) {
  return (req: { get(name: string): string | undefined }, res: Response, next: NextFunction): void => {
    const token = context.localApiSecurity.token;
    if (token && !hasValidToken(req.get(LOCAL_API_TOKEN_HEADER), token)) {
      res.status(401).json({ error: "Missing or invalid local API token" });
      return;
    }
    next();
  };
}

function audioEnvelope(context: ServerContext, operation: string): Record<string, unknown> {
  return {
    schema_version: AUDIO_STATE_SCHEMA_VERSION,
    status: "ok",
    operation,
    audio: validateProjectAudioState(context.state.aliceAudio),
  };
}

function writeAudioStateEvidence(context: ServerContext, response: Record<string, unknown>): void {
  const dir = path.join(context.evidenceDir, "alice-web");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "audio-state.json"),
    JSON.stringify(response, null, 2) + "\n",
    "utf-8",
  );
}

function runCueOperation(
  context: ServerContext,
  rawCueId: string | undefined,
  res: Response,
  next: NextFunction,
  operation: string,
  handler: typeof startAudioCue,
): void {
  if (!context.state.launched) {
    res.status(400).json({ error: "Not launched. Call POST /api/launch first." });
    return;
  }

  try {
    const cueId = readRouteId(rawCueId, "cue id");
    context.state.aliceAudio = handler(context.state.aliceAudio, cueId);
    const response = audioEnvelope(context, operation);
    writeAudioStateEvidence(context, response);
    res.json(response);
  } catch (error) {
    if (error instanceof ProjectAudioError) {
      res.status(error.message.includes("cue not found") ? 404 : 400).json({ error: error.message });
      return;
    }
    next(error);
  }
}

function readBackgroundAudioInput(body: Record<string, unknown>): Partial<BackgroundAudioState> & { resourceId: string | null } {
  const resourceId = body.resourceId === null ? null : readRequiredWorkflowString(body, "resourceId");
  return {
    resourceId,
    enabled: readOptionalBoolean(body, "enabled"),
    loop: readOptionalBoolean(body, "loop"),
    volume: readOptionalNumber(body, "volume"),
    pan: readOptionalNumber(body, "pan"),
  };
}

function readAudioCueInput(body: Record<string, unknown>): AudioCueState {
  return {
    id: readRequiredWorkflowString(body, "id"),
    name: readRequiredWorkflowString(body, "name"),
    resourceId: readRequiredWorkflowString(body, "resourceId"),
    trigger: readRequiredWorkflowString(body, "trigger") as AudioCueState["trigger"],
    loop: readOptionalBoolean(body, "loop") ?? false,
    volume: readOptionalNumber(body, "volume") ?? 1,
    pan: readOptionalNumber(body, "pan") ?? 0,
  };
}

function readRequiredWorkflowString(body: Record<string, unknown>, fieldName: string): string {
  const value = body[fieldName];
  if (typeof value !== "string" || !value.trim()) {
    throw new ProjectAudioError(`${fieldName} is required and must be a non-empty string`);
  }
  return value.trim();
}

function readRouteId(value: string | undefined, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProjectAudioError(`${label} is required`);
  }
  return value.trim();
}

function hasValidToken(value: string | undefined, expected: string): boolean {
  if (!value) {
    return false;
  }
  const provided = Buffer.from(value);
  const required = Buffer.from(expected);
  return provided.length === required.length && timingSafeEqual(provided, required);
}

function decodeBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new ProjectAudioError("dataBase64 must be valid base64");
  }
  return Buffer.from(value, "base64");
}

function readRequiredBase64Field(body: Record<string, unknown>, fieldName: string): string {
  const value = body[fieldName];
  if (typeof value !== "string" || !value.trim()) {
    throw new ProjectAudioError(`${fieldName} is required and must be a non-empty base64 string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_AUDIO_BASE64_LENGTH) {
    throw new ProjectAudioError(`${fieldName} must be ${MAX_AUDIO_BASE64_LENGTH} characters or fewer`);
  }
  return trimmed;
}

function readRequiredNumber(body: Record<string, unknown>, fieldName: string): number {
  const value = body[fieldName];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProjectAudioError(`${fieldName} must be a finite number`);
  }
  return value;
}

function readOptionalNumber(body: Record<string, unknown>, fieldName: string): number | undefined {
  const value = body[fieldName];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProjectAudioError(`${fieldName} must be a finite number`);
  }
  return value;
}

function readOptionalBoolean(body: Record<string, unknown>, fieldName: string): boolean | undefined {
  const value = body[fieldName];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ProjectAudioError(`${fieldName} must be a boolean`);
  }
  return value;
}

function readOptionalString(body: Record<string, unknown>, fieldName: string): string | undefined {
  const value = body[fieldName];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new ProjectAudioError(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}
