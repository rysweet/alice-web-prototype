import { createWebXREvidence, type WebXREvidence } from "./webxr-capabilities";
import type { WebXRInputState } from "./webxr-input";

export type { WebXRInputState } from "./webxr-input";

export type WebXRLocomotionMode =
  | "disabled"
  | "controller-smooth"
  | "point-click"
  | "click-move"
  | "combined";

export interface WebXRLocomotionConfig {
  readonly mode: WebXRLocomotionMode;
  readonly smoothSpeedMetersPerSecond: number;
  readonly clickMoveMaxDistanceMeters: number;
  readonly clickMoveStepMeters: number;
  readonly verticalMovement: boolean;
  readonly movementSurfaceNames: readonly string[];
}

export interface WebXRLocomotionOptions extends Partial<WebXRLocomotionConfig> {}

export interface WebXRLocomotionUpdateResult {
  readonly type: "none" | "movement";
  readonly deltaMeters: { readonly x: number; readonly y: number; readonly z: number };
  readonly clamped: boolean;
  readonly evidence: WebXREvidence[];
}

export interface WebXRLocomotion {
  readonly mode: WebXRLocomotionMode;
  readonly config: WebXRLocomotionConfig;
  update(input: WebXRInputState, deltaSeconds: number): WebXRLocomotionUpdateResult;
}

export interface WebXRObjectHit {
  readonly objectName: string;
  readonly distanceMeters: number;
  readonly point: { readonly x: number; readonly y: number; readonly z: number };
  readonly pickable: boolean;
}

export interface WebXRMovementHit {
  readonly surfaceName: string;
  readonly distanceMeters: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
}

export interface WebXRInteractionResolutionOptions {
  readonly mode: WebXRLocomotionMode;
  readonly objectHits: readonly WebXRObjectHit[];
  readonly movementHits: readonly WebXRMovementHit[];
  readonly movementSurfaceNames: readonly string[];
  readonly clickMoveMaxDistanceMeters?: number;
  readonly clickMoveStepMeters?: number;
  readonly verticalMovement?: boolean;
  readonly currentRigPosition?: { readonly x: number; readonly y: number; readonly z: number };
}

export type WebXRInteractionResult =
  | {
      readonly type: "none";
      readonly moved: false;
      readonly evidence: WebXREvidence[];
    }
  | {
      readonly type: "object-interaction";
      readonly objectName: string;
      readonly point: { readonly x: number; readonly y: number; readonly z: number };
      readonly moved: false;
      readonly evidence: WebXREvidence[];
    }
  | {
      readonly type: "movement";
      readonly target: {
        readonly surfaceName: string;
        readonly position: { readonly x: number; readonly y: number; readonly z: number };
      };
      readonly moved: true;
      readonly evidence: WebXREvidence[];
    }
  | {
      readonly type: "invalid-target";
      readonly moved: false;
      readonly evidence: WebXREvidence[];
    };

const DEFAULT_CONFIG: WebXRLocomotionConfig = {
  mode: "combined",
  smoothSpeedMetersPerSecond: 1.5,
  clickMoveMaxDistanceMeters: 25,
  clickMoveStepMeters: 0,
  verticalMovement: false,
  movementSurfaceNames: ["ground", "floor", "terrain"],
};

const ZERO_DELTA = { x: 0, y: 0, z: 0 } as const;

function clampUnit(value: number): { value: number; clamped: boolean } {
  if (value > 1) {
    return { value: 1, clamped: true };
  }
  if (value < -1) {
    return { value: -1, clamped: true };
  }
  return { value, clamped: false };
}

function movementAxes(input: WebXRInputState): readonly number[] | undefined {
  return input.sources.find((source) => source.gamepad?.axes && source.gamepad.axes.length >= 2)?.gamepad?.axes;
}

function hasMovementIntent(input: WebXRInputState): boolean {
  const axes = movementAxes(input);
  return Boolean(axes?.some((axis) => Number.isFinite(axis) && Math.abs(axis) > 0.001));
}

export function createWebXRLocomotion(options: WebXRLocomotionOptions = {}): WebXRLocomotion {
  const config: WebXRLocomotionConfig = {
    ...DEFAULT_CONFIG,
    ...options,
    movementSurfaceNames: options.movementSurfaceNames ?? DEFAULT_CONFIG.movementSurfaceNames,
  };

  return {
    mode: config.mode,
    config,
    update(input: WebXRInputState, deltaSeconds: number): WebXRLocomotionUpdateResult {
      const evidence: WebXREvidence[] = [];
      if (config.mode === "disabled") {
        if (hasMovementIntent(input)) {
          evidence.push(createWebXREvidence(
            "locomotion-disabled",
            "degraded",
            "Movement input was received while locomotion is disabled.",
          ));
        }
        return { type: "none", deltaMeters: ZERO_DELTA, clamped: false, evidence };
      }

      if (config.mode !== "controller-smooth" && config.mode !== "combined") {
        return { type: "none", deltaMeters: ZERO_DELTA, clamped: false, evidence };
      }

      const axes = movementAxes(input);
      if (!axes || axes.length < 2) {
        return { type: "none", deltaMeters: ZERO_DELTA, clamped: false, evidence };
      }
      if (!Number.isFinite(deltaSeconds) || !Number.isFinite(axes[0]) || !Number.isFinite(axes[1])) {
        evidence.push(createWebXREvidence(
          "non-finite-pose",
          "degraded",
          "Controller locomotion input contained NaN or Infinity.",
        ));
        return { type: "none", deltaMeters: ZERO_DELTA, clamped: false, evidence };
      }

      const xAxis = clampUnit(axes[0]);
      const zAxis = clampUnit(axes[1]);
      const scale = Math.max(0, config.smoothSpeedMetersPerSecond) * Math.max(0, deltaSeconds);
      const deltaMeters = {
        x: xAxis.value * scale,
        y: 0,
        z: zAxis.value * scale,
      };
      const moving = Math.abs(deltaMeters.x) > 0 || Math.abs(deltaMeters.z) > 0;
      return {
        type: moving ? "movement" : "none",
        deltaMeters,
        clamped: xAxis.clamped || zAxis.clamped,
        evidence,
      };
    },
  };
}

function nearestObjectHit(hits: readonly WebXRObjectHit[]): WebXRObjectHit | undefined {
  return hits
    .filter((hit) => hit.pickable && Number.isFinite(hit.distanceMeters))
    .sort((left, right) => left.distanceMeters - right.distanceMeters)[0];
}

function nearestMovementHit(
  hits: readonly WebXRMovementHit[],
  surfaceNames: readonly string[],
  maxDistance: number,
): WebXRMovementHit | undefined {
  const allowed = new Set(surfaceNames.map((name) => name.toLowerCase()));
  return hits
    .filter((hit) => (
      Number.isFinite(hit.distanceMeters)
      && hit.distanceMeters <= maxDistance
      && allowed.has(hit.surfaceName.toLowerCase())
      && Number.isFinite(hit.position.x)
      && Number.isFinite(hit.position.y)
      && Number.isFinite(hit.position.z)
    ))
    .sort((left, right) => left.distanceMeters - right.distanceMeters)[0];
}

function steppedTarget(
  current: { readonly x: number; readonly y: number; readonly z: number },
  target: { readonly x: number; readonly y: number; readonly z: number },
  stepMeters: number,
): { readonly x: number; readonly y: number; readonly z: number } {
  if (stepMeters <= 0) {
    return target;
  }
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dz = target.z - current.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= stepMeters || distance === 0) {
    return target;
  }
  const ratio = stepMeters / distance;
  return {
    x: current.x + dx * ratio,
    y: current.y + dy * ratio,
    z: current.z + dz * ratio,
  };
}

export function resolveWebXRInteraction(options: WebXRInteractionResolutionOptions): WebXRInteractionResult {
  const evidence: WebXREvidence[] = [];
  if (options.mode === "disabled") {
    return {
      type: "none",
      moved: false,
      evidence: [createWebXREvidence("locomotion-disabled", "degraded", "Interaction input was received while locomotion is disabled.")],
    };
  }

  const objectHit = nearestObjectHit(options.objectHits);
  if ((options.mode === "point-click" || options.mode === "combined") && objectHit) {
    return {
      type: "object-interaction",
      objectName: objectHit.objectName,
      point: objectHit.point,
      moved: false,
      evidence,
    };
  }

  if (options.mode !== "click-move" && options.mode !== "combined") {
    return { type: "none", moved: false, evidence };
  }

  const currentRigPosition = options.currentRigPosition ?? { x: 0, y: 0, z: 0 };
  const maxDistance = options.clickMoveMaxDistanceMeters ?? DEFAULT_CONFIG.clickMoveMaxDistanceMeters;
  const movementHit = nearestMovementHit(options.movementHits, options.movementSurfaceNames, maxDistance);
  if (!movementHit) {
    if (options.movementHits.length > 0) {
      evidence.push(createWebXREvidence(
        "invalid-movement-target",
        "degraded",
        "Select hit a surface that is not a valid movement target.",
      ));
      return { type: "invalid-target", moved: false, evidence };
    }
    return { type: "none", moved: false, evidence };
  }

  const rawTarget = {
    x: movementHit.position.x,
    y: options.verticalMovement ? movementHit.position.y : currentRigPosition.y,
    z: movementHit.position.z,
  };
  const position = steppedTarget(currentRigPosition, rawTarget, options.clickMoveStepMeters ?? DEFAULT_CONFIG.clickMoveStepMeters);
  return {
    type: "movement",
    target: {
      surfaceName: movementHit.surfaceName,
      position,
    },
    moved: true,
    evidence,
  };
}
