import type { Express } from "express";
import {
  ProjectAudioError,
  addAudioCue,
  getSupportedAudioFormats,
  registerAudioAsset,
  setBackgroundMusic,
} from "../../project-audio.js";
import type { ServerContext } from "../context.js";
import {
  readJsonObjectBody,
  readRequiredStringField,
} from "../validation.js";

const MAX_AUDIO_BASE64_LENGTH = 1024 * 1024;

export function registerAudioRoutes(app: Express, context: ServerContext): void {
  app.get("/api/audio/formats", (_req, res) => {
    res.json({ formats: getSupportedAudioFormats() });
  });

  app.get("/api/audio/state", (_req, res) => {
    res.json(toAudioStateResponse(context));
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
        status: "proved",
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
