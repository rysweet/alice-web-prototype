import type { NextFunction, Request, Response } from "express";
import type { Express } from "express";
import { buildCurrentProject } from "../state.js";
import type { ServerContext } from "../context.js";
import { hasValidToken, LOCAL_API_TOKEN_HEADER } from "../security.js";
import {
  createAccessibilityRescueCaptionEvidence,
  type BrowserWebXRLocomotionObservation,
  createCameraVrComfortEvidence,
  createGalleryWalkRubricEvidence,
  createRuntimeParityEvidence,
} from "../../runtime-parity-evidence.js";
import { createWebXRLocomotion, type WebXRInputState, type WebXRLocomotionMode } from "../../webxr-locomotion.js";
import { readJsonObjectBody } from "../validation.js";

export function registerRuntimeParityRoutes(app: Express, context: ServerContext): void {
  app.get("/api/vr/camera-comfort", requireRuntimeParityReadToken(context), (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(createCameraVrComfortEvidence({
      camera: context.state.cameraWorkflow.camera,
      browserWebXRLocomotionObservation: context.state.browserWebXRLocomotionObservation,
    }));
  });

  app.post("/api/vr/webxr-locomotion-evidence", requireRuntimeParityReadToken(context), (req, res) => {
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    try {
      const observation = createBrowserWebXRLocomotionObservation(body.body);
      context.state.browserWebXRLocomotionObservation = observation;
      res.setHeader("Cache-Control", "no-store");
      res.json({
        schema_version: "alice.browser-webxr-locomotion-evidence/v1",
        status: "observed",
        trueHeadsetVrSupported: false,
        nativeVrSupported: false,
        observation,
        cameraComfort: createCameraVrComfortEvidence({
          camera: context.state.cameraWorkflow.camera,
          browserWebXRLocomotionObservation: observation,
        }),
      });
    } catch (error) {
      if (error instanceof TypeError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
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
      browserWebXRLocomotionObservation: context.state.browserWebXRLocomotionObservation,
    }));
  });
}

function createBrowserWebXRLocomotionObservation(body: Record<string, unknown>): BrowserWebXRLocomotionObservation {
  const mode = readOptionalLocomotionMode(body.mode);
  const axes = readAxes(body.axes);
  const deltaSeconds = readOptionalFiniteNumber(body.deltaSeconds) ?? 1;
  const locomotion = createWebXRLocomotion(mode ? { mode } : {});
  const input: WebXRInputState = {
    sources: [
      {
        id: "api:browser-webxr-locomotion-probe",
        handedness: "right",
        profiles: ["alice-browser-webxr-locomotion-probe"],
        targetRayMode: "tracked-pointer",
        selectPressed: false,
        squeezePressed: false,
        gamepad: {
          axes,
          buttons: [],
        },
        evidence: [],
      },
    ],
    evidence: [],
  };
  const result = locomotion.update(input, deltaSeconds);
  return {
    observed: true,
    evidenceSource: "browser-webxr-locomotion-api",
    sessionState: "not-started",
    referenceSpaceType: "unknown",
    inputSourceCount: 1,
    locomotionMode: locomotion.mode,
    locomotionEvidenceCodes: result.evidence.map((item) => item.code),
    locomotionResult: result.type,
    deltaMeters: result.deltaMeters,
    clamped: result.clamped,
    headsetSessionObserved: false,
    nativeVrObserved: false,
    unsupportedReason: "This is bounded browser WebXR locomotion engine evidence from an explicit local API probe; no headset/native VR session was observed.",
  };
}

function readAxes(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new TypeError("axes must contain at least two finite numeric values");
  }
  return [readFiniteNumber(value[0], "axes[0]"), readFiniteNumber(value[1], "axes[1]")];
}

function readOptionalFiniteNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  return readFiniteNumber(value, "deltaSeconds");
}

function readFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${fieldName} must be a finite numeric value`);
  }
  return value;
}

function readOptionalLocomotionMode(value: unknown): WebXRLocomotionMode | undefined {
  if (value === undefined) return undefined;
  if (
    value === "disabled"
    || value === "controller-smooth"
    || value === "point-click"
    || value === "click-move"
    || value === "combined"
  ) {
    return value;
  }
  throw new TypeError("mode must be disabled, controller-smooth, point-click, click-move, or combined");
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
