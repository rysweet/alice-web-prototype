import type { Express } from "express";
import { buildCurrentProject } from "../state.js";
import type { ServerContext } from "../context.js";
import {
  createAccessibilityRescueCaptionEvidence,
  createCameraVrComfortEvidence,
  createGalleryWalkRubricEvidence,
  createRuntimeParityEvidence,
} from "../../runtime-parity-evidence.js";

export function registerRuntimeParityRoutes(app: Express, context: ServerContext): void {
  app.get("/api/vr/camera-comfort", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(createCameraVrComfortEvidence({
      camera: context.state.cameraWorkflow.camera,
    }));
  });

  app.get("/api/accessibility/rescue-camera-captions", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(createAccessibilityRescueCaptionEvidence({
      camera: context.state.cameraWorkflow.camera,
      project: buildCurrentProject(context.state),
      statusText: context.state.launched ? "Alice web project is launched." : "Alice web project is ready.",
    }));
  });

  app.get("/api/review/gallery-walk-rubric", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(createGalleryWalkRubricEvidence({
      project: buildCurrentProject(context.state),
    }));
  });

  app.get("/api/review/runtime-parity", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(createRuntimeParityEvidence({
      camera: context.state.cameraWorkflow.camera,
      project: buildCurrentProject(context.state),
      statusText: context.state.launched ? "Alice web project is launched." : "Alice web project is ready.",
    }));
  });
}
