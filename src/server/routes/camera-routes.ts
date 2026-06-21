import { timingSafeEqual } from "crypto";
import type { Express, NextFunction, Request, Response } from "express";
import {
  CAMERA_WORKFLOW_SCHEMA_VERSION,
  CameraMarkerNotFoundError,
  applyCameraPreset,
  deleteCameraMarker,
  focusCamera,
  listCameraMarkers,
  moveCamera,
  orbitCamera,
  panCamera,
  restoreCameraMarker,
  saveCameraMarker,
  setCameraMode,
  zoomCamera,
  type CameraMode,
  type CameraPreset,
  type CameraVector3,
  type CameraWorkflowState,
} from "../../camera-workflow.js";
import type { ServerContext } from "../context.js";
import { LOCAL_API_TOKEN_HEADER } from "../security.js";
import { readJsonObjectBody } from "../validation.js";

type CameraOperation = (state: CameraWorkflowState) => CameraWorkflowState;

export function registerCameraRoutes(app: Express, context: ServerContext): void {
  app.get("/api/camera/state", requireCameraReadToken(context), (_req, res) => {
    res.json(cameraEnvelope(context.state.cameraWorkflow, "state"));
  });

  app.get("/api/camera/markers", requireCameraReadToken(context), (_req, res) => {
    res.json(cameraEnvelope(context.state.cameraWorkflow, "markers"));
  });

  app.post("/api/camera/move", (req, res, next) => {
    runCameraOperation(context, req, res, next, "move", (state, body) =>
      moveCamera(state, {
        forward: readOptionalFiniteNumber(body, "forward"),
        right: readOptionalFiniteNumber(body, "right"),
        up: readOptionalFiniteNumber(body, "up"),
      }),
    );
  });

  app.post("/api/camera/pan", (req, res, next) => {
    runCameraOperation(context, req, res, next, "pan", (state, body) =>
      panCamera(state, {
        right: readOptionalFiniteNumber(body, "right"),
        up: readOptionalFiniteNumber(body, "up"),
      }),
    );
  });

  app.post("/api/camera/zoom", (req, res, next) => {
    runCameraOperation(context, req, res, next, "zoom", (state, body) =>
      zoomCamera(state, { delta: readRequiredFiniteNumber(body, "delta") }),
    );
  });

  app.post("/api/camera/focus", (req, res, next) => {
    runCameraOperation(context, req, res, next, "focus", (state, body) =>
      focusCamera(state, {
        target: readRequiredVector(body, "target"),
        distance: readOptionalFiniteNumber(body, "distance"),
      }),
    );
  });

  app.post("/api/camera/orbit", (req, res, next) => {
    runCameraOperation(context, req, res, next, "orbit", (state, body) =>
      orbitCamera(state, {
        yawDegrees: readOptionalFiniteNumber(body, "yawDegrees"),
        pitchDegrees: readOptionalFiniteNumber(body, "pitchDegrees"),
      }),
    );
  });

  app.post("/api/camera/preset", (req, res, next) => {
    runCameraOperation(context, req, res, next, "preset", (state, body) =>
      applyCameraPreset(state, readRequiredString(body, "preset") as CameraPreset),
    );
  });

  app.post("/api/camera/mode", (req, res, next) => {
    runCameraOperation(context, req, res, next, "mode", (state, body) =>
      setCameraMode(state, readRequiredString(body, "mode") as CameraMode),
    );
  });

  app.post("/api/camera/markers", (req, res, next) => {
    runCameraOperation(context, req, res, next, "save-marker", (state, body) =>
      saveCameraMarker(state, { name: readRequiredString(body, "name") }),
      (before, after) => {
        const marker = after.markers.find((candidate) => candidate.id === after.activeMarkerId);
        return cameraEnvelope(after, "save-marker", marker ? { marker } : {});
      },
    );
  });

  app.post("/api/camera/markers/:markerId/restore", (req, res, next) => {
    runCameraOperation(context, req, res, next, "restore-marker", (state) =>
      restoreCameraMarker(state, readMarkerId(req)),
    );
  });

  app.delete("/api/camera/markers/:markerId", (req, res, next) => {
    runCameraOperation(context, req, res, next, "delete-marker", (state) =>
      deleteCameraMarker(state, readMarkerId(req)),
    );
  });
}

function requireCameraReadToken(context: ServerContext) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = context.localApiSecurity.token;
    if (token && !hasValidToken(req.get(LOCAL_API_TOKEN_HEADER), token)) {
      res.status(401).json({ error: "Missing or invalid local API token" });
      return;
    }
    next();
  };
}

function runCameraOperation(
  context: ServerContext,
  req: Request,
  res: Response,
  next: NextFunction,
  operation: string,
  operationHandler: (state: CameraWorkflowState, body: Record<string, unknown>) => CameraWorkflowState,
  responseBuilder: (
    before: CameraWorkflowState,
    after: CameraWorkflowState,
  ) => Record<string, unknown> = (_before, after) => cameraEnvelope(after, operation),
): void {
  const body = readJsonObjectBody(req.body);
  if (!body.ok) {
    res.status(400).json({ error: body.error });
    return;
  }

  try {
    const before = context.state.cameraWorkflow;
    const after = operationHandler(before, body.body);
    context.state.cameraWorkflow = after;
    res.json(responseBuilder(before, after));
  } catch (error) {
    if (error instanceof CameraMarkerNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof TypeError) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}

function cameraEnvelope(
  state: CameraWorkflowState,
  operation: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schema_version: CAMERA_WORKFLOW_SCHEMA_VERSION,
    status: "ok",
    operation,
    camera: state.camera,
    markers: listCameraMarkers(state),
    activeMarkerId: state.activeMarkerId,
    ...extra,
  };
}

function readMarkerId(req: Request): string {
  const markerId = req.params.markerId;
  if (typeof markerId !== "string" || !markerId.trim()) {
    throw new TypeError("markerId must be a non-empty string");
  }
  return markerId;
}

function readRequiredString(body: Record<string, unknown>, fieldName: string): string {
  const value = body[fieldName];
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${fieldName} is required and must be a non-empty string`);
  }
  return value.trim();
}

function readOptionalFiniteNumber(
  body: Record<string, unknown>,
  fieldName: string,
): number | undefined {
  if (body[fieldName] === undefined) return undefined;
  return readRequiredFiniteNumber(body, fieldName);
}

function readRequiredFiniteNumber(body: Record<string, unknown>, fieldName: string): number {
  const value = body[fieldName];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${fieldName} must be a finite numeric value`);
  }
  return value;
}

function readRequiredVector(body: Record<string, unknown>, fieldName: string): CameraVector3 {
  const value = body[fieldName];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be a camera vector`);
  }
  const vectorBody = value as Record<string, unknown>;
  return {
    x: readRequiredFiniteNumber(vectorBody, "x"),
    y: readRequiredFiniteNumber(vectorBody, "y"),
    z: readRequiredFiniteNumber(vectorBody, "z"),
  };
}

function hasValidToken(value: string | undefined, expected: string): boolean {
  if (!value) return false;
  const provided = Buffer.from(value);
  const required = Buffer.from(expected);
  return provided.length === required.length && timingSafeEqual(provided, required);
}
