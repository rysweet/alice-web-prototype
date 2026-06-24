import type { NextFunction, Request, Response } from "express";
import type { Express } from "express";
import * as fs from "fs";
import * as path from "path";
import { buildCurrentProject } from "../state.js";
import type { ServerContext } from "../context.js";
import { hasValidToken, LOCAL_API_TOKEN_HEADER } from "../security.js";
import {
  createAccessibilityRescueCaptionEvidence,
  createCameraVrComfortEvidence,
  createGalleryWalkRubricEvidence,
  createPlayerComfortSessionEvidence,
  createRuntimeParityEvidence,
} from "../../runtime-parity-evidence.js";

export function registerRuntimeParityRoutes(app: Express, context: ServerContext): void {
  app.get("/api/vr/camera-comfort", requireRuntimeParityReadToken(context), (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(createCameraVrComfortEvidence({
      camera: context.state.cameraWorkflow.camera,
    }));
  });

  app.post("/api/vr/player-comfort-session", requireRuntimeParityReadToken(context), (req, res) => {
    try {
      const playerComfortSession = createPlayerComfortSessionEvidence(req.body);
      const cameraVrComfort = createCameraVrComfortEvidence({
        camera: context.state.cameraWorkflow.camera,
        playerComfortSession,
      });
      const evidenceArtifact = "vr-player-comfort-session-evidence.json";
      const payload = {
        schema_version: "alice.player-comfort-session-runtime-parity/v1",
        status: "evidence-recorded",
        evidenceArtifact,
        playerComfortSession,
        cameraVrComfort,
      };
      fs.writeFileSync(
        path.join(context.evidenceDir, evidenceArtifact),
        `${JSON.stringify(payload, null, 2)}\n`,
        "utf8",
      );
      res.status(201).json(payload);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/accessibility/rescue-camera-captions", requireRuntimeParityReadToken(context), (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(createAccessibilityRescueCaptionEvidence({
      camera: context.state.cameraWorkflow.camera,
      project: buildCurrentProject(context.state),
      statusText: context.state.launched ? "Alice web project is launched." : "Alice web project is ready.",
    }));
  });

  app.get("/api/review/gallery-walk-rubric", requireRuntimeParityReadToken(context), (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(createGalleryWalkRubricEvidence({
      project: buildCurrentProject(context.state),
      liveStudio: context.liveWorkshopStudio.current(),
    }));
  });

  app.get("/api/review/runtime-parity", requireRuntimeParityReadToken(context), (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(createRuntimeParityEvidence({
      camera: context.state.cameraWorkflow.camera,
      project: buildCurrentProject(context.state),
      statusText: context.state.launched ? "Alice web project is launched." : "Alice web project is ready.",
      liveStudio: context.liveWorkshopStudio.current(),
    }));
  });
}

function requireRuntimeParityReadToken(context: ServerContext) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = context.localApiSecurity.token;
    if (!token || !hasValidToken(req.get(LOCAL_API_TOKEN_HEADER), token)) {
      res.status(401).json({ error: "Missing or invalid local API token" });
      return;
    }
    next();
  };
}
