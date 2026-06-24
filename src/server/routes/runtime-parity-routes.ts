import type { NextFunction, Request, Response } from "express";
import type { Express } from "express";
import { buildCurrentProject } from "../state.js";
import type { ServerContext } from "../context.js";
import { hasValidToken, LOCAL_API_TOKEN_HEADER } from "../security.js";
import {
  createAccessibilityRescueCaptionEvidence,
  createCameraVrComfortEvidence,
  createGalleryWalkRubricEvidence,
  createRuntimeParityEvidence,
} from "../../runtime-parity-evidence.js";

export function registerRuntimeParityRoutes(app: Express, context: ServerContext): void {
  app.get("/api/vr/camera-comfort", requireRuntimeParityReadToken(context), (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(createCameraVrComfortEvidence({
      camera: context.state.cameraWorkflow.camera,
    }));
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
