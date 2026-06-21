import { createWebXREvidence, type WebXREvidence } from "./webxr-capabilities";

export interface WebXRPoseState {
  readonly matrix: readonly number[];
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly orientation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number };
}

export interface WebXRGamepadButtonState {
  readonly pressed: boolean;
  readonly touched: boolean;
  readonly value: number;
}

export interface WebXRGamepadState {
  readonly axes: readonly number[];
  readonly buttons: readonly WebXRGamepadButtonState[];
}

export interface WebXRHandJointState extends WebXRPoseState {
  readonly name: string;
  readonly radius?: number;
}

export interface WebXRHandState {
  readonly joints: readonly WebXRHandJointState[];
}

export interface WebXRInputSourceState {
  readonly id: string;
  readonly handedness: string;
  readonly profiles: readonly string[];
  readonly targetRayMode: string;
  readonly targetRay?: WebXRPoseState;
  readonly grip?: WebXRPoseState;
  readonly hand?: WebXRHandState;
  readonly gamepad?: WebXRGamepadState;
  readonly selectPressed: boolean;
  readonly squeezePressed: boolean;
  readonly evidence: readonly WebXREvidence[];
}

export interface WebXRInputState {
  readonly sources: readonly WebXRInputSourceState[];
  readonly evidence: readonly WebXREvidence[];
}

export interface WebXRInputTrackerSnapshot {
  isSelectPressed(source: unknown): boolean;
  isSqueezePressed(source: unknown): boolean;
}

export interface WebXRInputTracker {
  handleSelectStart(event: { readonly inputSource?: unknown }): void;
  handleSelectEnd(event: { readonly inputSource?: unknown }): void;
  handleSqueezeStart(event: { readonly inputSource?: unknown }): void;
  handleSqueezeEnd(event: { readonly inputSource?: unknown }): void;
  snapshot(): WebXRInputTrackerSnapshot;
  clear(): void;
}

type XRInputSourceLike = {
  readonly handedness?: string;
  readonly profiles?: readonly string[];
  readonly targetRayMode?: string;
  readonly targetRaySpace?: unknown;
  readonly gripSpace?: unknown;
  readonly gamepad?: {
    readonly axes?: ArrayLike<number>;
    readonly buttons?: ArrayLike<{ readonly pressed?: boolean; readonly touched?: boolean; readonly value?: number }>;
  };
  readonly hand?: unknown;
};

type XRFrameLike = {
  readonly getPose?: (space: any, baseSpace?: unknown) => unknown;
  readonly getJointPose?: (jointSpace: any, baseSpace?: unknown) => unknown;
};

export function createWebXRInputTracker(): WebXRInputTracker {
  let selectPressed = new WeakSet<object>();
  let squeezePressed = new WeakSet<object>();

  function withObjectSource(event: { readonly inputSource?: unknown }, action: (source: object) => void): void {
    if (typeof event.inputSource === "object" && event.inputSource !== null) {
      action(event.inputSource);
    }
  }

  return {
    handleSelectStart(event): void {
      withObjectSource(event, (source) => selectPressed.add(source));
    },
    handleSelectEnd(event): void {
      withObjectSource(event, (source) => selectPressed.delete(source));
    },
    handleSqueezeStart(event): void {
      withObjectSource(event, (source) => squeezePressed.add(source));
    },
    handleSqueezeEnd(event): void {
      withObjectSource(event, (source) => squeezePressed.delete(source));
    },
    snapshot(): WebXRInputTrackerSnapshot {
      return {
        isSelectPressed(source: unknown): boolean {
          return typeof source === "object" && source !== null && selectPressed.has(source);
        },
        isSqueezePressed(source: unknown): boolean {
          return typeof source === "object" && source !== null && squeezePressed.has(source);
        },
      };
    },
    clear(): void {
      selectPressed = new WeakSet<object>();
      squeezePressed = new WeakSet<object>();
    },
  };
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFiniteMatrix(matrix: unknown): matrix is ArrayLike<number> {
  if (!matrix || typeof matrix !== "object" || typeof (matrix as ArrayLike<number>).length !== "number") {
    return false;
  }
  const values = Array.from(matrix as ArrayLike<number>);
  return values.length === 16 && values.every(Number.isFinite);
}

function isFiniteVector3(value: unknown): value is { x: number; y: number; z: number } {
  const vector = value as { x?: unknown; y?: unknown; z?: unknown } | undefined;
  return finiteNumber(vector?.x) && finiteNumber(vector?.y) && finiteNumber(vector?.z);
}

function isFiniteQuaternion(value: unknown): value is { x: number; y: number; z: number; w: number } {
  const quaternion = value as { x?: unknown; y?: unknown; z?: unknown; w?: unknown } | undefined;
  return finiteNumber(quaternion?.x) && finiteNumber(quaternion?.y) && finiteNumber(quaternion?.z) && finiteNumber(quaternion?.w);
}

function normalizePose(rawPose: unknown, evidence: WebXREvidence[]): WebXRPoseState | undefined {
  const transform = (rawPose as { transform?: unknown } | undefined)?.transform as {
    matrix?: unknown;
    position?: unknown;
    orientation?: unknown;
  } | undefined;
  if (!transform || !isFiniteMatrix(transform.matrix)) {
    evidence.push(createWebXREvidence(
      "non-finite-pose",
      "degraded",
      "XR pose data contained NaN, Infinity, or an invalid matrix.",
    ));
    return undefined;
  }

  const matrix = Array.from(transform.matrix);
  const position = isFiniteVector3(transform.position)
    ? { x: transform.position.x, y: transform.position.y, z: transform.position.z }
    : { x: matrix[12], y: matrix[13], z: matrix[14] };
  const orientation = isFiniteQuaternion(transform.orientation)
    ? { x: transform.orientation.x, y: transform.orientation.y, z: transform.orientation.z, w: transform.orientation.w }
    : { x: 0, y: 0, z: 0, w: 1 };

  if (!isFiniteVector3(position) || !isFiniteQuaternion(orientation)) {
    evidence.push(createWebXREvidence(
      "non-finite-pose",
      "degraded",
      "XR pose data contained NaN, Infinity, or invalid transform components.",
    ));
    return undefined;
  }

  return { matrix, position, orientation };
}

function sourceId(source: XRInputSourceLike): string {
  const handedness = source.handedness || "none";
  const targetRayMode = source.targetRayMode || "unknown";
  const profile = source.profiles?.[0] || "generic";
  return `${handedness}:${targetRayMode}:${profile}`;
}

function normalizeGamepad(source: XRInputSourceLike, evidence: WebXREvidence[]): WebXRGamepadState | undefined {
  if (!source.gamepad) {
    evidence.push(createWebXREvidence(
      "controller-missing-gamepad",
      "degraded",
      "Controller gamepad axes or buttons are unavailable.",
    ));
    return undefined;
  }
  const axes = Array.from(source.gamepad.axes ?? []);
  if (!axes.every(Number.isFinite)) {
    evidence.push(createWebXREvidence(
      "non-finite-pose",
      "degraded",
      "Controller gamepad axes contained NaN or Infinity.",
    ));
    return undefined;
  }
  const buttons = Array.from(source.gamepad.buttons ?? []).map((button) => ({
    pressed: Boolean(button.pressed),
    touched: Boolean(button.touched),
    value: finiteNumber(button.value) ? button.value : 0,
  }));
  return { axes, buttons };
}

function handEntries(hand: unknown): Array<[string, unknown]> {
  if (!hand) {
    return [];
  }
  if (typeof (hand as { entries?: unknown }).entries === "function") {
    return Array.from((hand as Map<string, unknown>).entries());
  }
  if (Symbol.iterator in Object(hand)) {
    return Array.from(hand as Iterable<[string, unknown]>);
  }
  return Object.entries(hand as Record<string, unknown>);
}

function normalizeHand(
  source: XRInputSourceLike,
  frame: XRFrameLike | undefined,
  referenceSpace: unknown,
  evidence: WebXREvidence[],
): WebXRHandState | undefined {
  if (!source.hand) {
    if ("hand" in source) {
      evidence.push(createWebXREvidence(
        "hand-tracking-unsupported",
        "degraded",
        "Hand tracking is not available for this input source.",
      ));
    }
    return undefined;
  }

  const joints: WebXRHandJointState[] = [];
  for (const [name, jointSpace] of handEntries(source.hand)) {
    const rawPose = frame?.getJointPose?.(jointSpace, referenceSpace) ?? frame?.getPose?.(jointSpace, referenceSpace);
    const jointEvidence: WebXREvidence[] = [];
    const pose = normalizePose(rawPose, jointEvidence);
    if (pose) {
      const radius = (rawPose as { radius?: unknown } | undefined)?.radius;
      joints.push(finiteNumber(radius) ? { name, ...pose, radius } : { name, ...pose });
    } else if (jointEvidence.length > 0) {
      evidence.push(createWebXREvidence(
        "hand-pose-unavailable",
        "degraded",
        "Hand joints exist but a frame did not provide valid joint poses.",
      ));
      break;
    }
  }

  return { joints };
}

function readPose(
  frame: XRFrameLike | undefined,
  space: unknown,
  referenceSpace: unknown,
  missingEvidence: WebXREvidence,
  evidence: WebXREvidence[],
): WebXRPoseState | undefined {
  if (!space || typeof frame?.getPose !== "function") {
    evidence.push(missingEvidence);
    return undefined;
  }
  const poseEvidence: WebXREvidence[] = [];
  const pose = normalizePose(frame.getPose(space, referenceSpace), poseEvidence);
  evidence.push(...poseEvidence);
  return pose;
}

export function normalizeWebXRInput(
  session: { readonly inputSources?: Iterable<unknown> } | undefined,
  frame: XRFrameLike | undefined,
  referenceSpace: unknown,
  trackerSnapshot?: WebXRInputTrackerSnapshot,
): WebXRInputState {
  const sources = Array.from(session?.inputSources ?? []);
  const normalizedSources: WebXRInputSourceState[] = [];
  const allEvidence: WebXREvidence[] = [];

  if (sources.length === 0) {
    allEvidence.push(createWebXREvidence(
      "input-sources-unavailable",
      "degraded",
      "The XR session has no usable input sources.",
    ));
  }

  for (const rawSource of sources) {
    const source = rawSource as XRInputSourceLike;
    const evidence: WebXREvidence[] = [];
    const targetRay = readPose(
      frame,
      source.targetRaySpace,
      referenceSpace,
      createWebXREvidence("controller-missing-target-ray", "degraded", "The controller cannot provide a target ray pose."),
      evidence,
    );
    const grip = readPose(
      frame,
      source.gripSpace,
      referenceSpace,
      createWebXREvidence("controller-missing-grip", "degraded", "The controller cannot provide a grip pose."),
      evidence,
    );
    const gamepad = normalizeGamepad(source, evidence);
    const hand = normalizeHand(source, frame, referenceSpace, evidence);

    normalizedSources.push({
      id: sourceId(source),
      handedness: source.handedness || "none",
      profiles: [...(source.profiles ?? [])],
      targetRayMode: source.targetRayMode || "unknown",
      targetRay,
      grip,
      hand,
      gamepad,
      selectPressed: trackerSnapshot?.isSelectPressed(rawSource) ?? false,
      squeezePressed: trackerSnapshot?.isSqueezePressed(rawSource) ?? false,
      evidence,
    });
    allEvidence.push(...evidence);
  }

  return { sources: normalizedSources, evidence: allEvidence };
}
