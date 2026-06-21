export const CAMERA_WORKFLOW_SCHEMA_VERSION = "eatme.alice-camera-workflow-state/v1";

export const CAMERA_MIN_ORBIT_DISTANCE = 1;
export const CAMERA_MIN_PITCH_DEGREES = -89;
export const CAMERA_MAX_PITCH_DEGREES = 89;
export const CAMERA_MIN_FIELD_OF_VIEW_DEGREES = 1;
export const CAMERA_MAX_FIELD_OF_VIEW_DEGREES = 120;
export const CAMERA_MARKER_NAME_MAX_LENGTH = 80;

export type CameraMode = "orbit" | "first-person";
export type CameraPreset = "home" | "front" | "back" | "left" | "right" | "top" | "isometric";

export interface CameraVector3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraSnapshot {
  mode: CameraMode;
  position: CameraVector3;
  target: CameraVector3;
  up: CameraVector3;
  yawDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
  fieldOfViewDegrees: number;
  activePreset: CameraPreset | null;
}

export interface CameraMarker {
  id: string;
  name: string;
  camera: CameraSnapshot;
  createdAt: string;
}

export interface CameraWorkflowState {
  camera: CameraSnapshot;
  markers: CameraMarker[];
  activeMarkerId: string | null;
}

export interface CameraMoveInput {
  forward?: number;
  right?: number;
  up?: number;
}

export interface CameraPanInput {
  right?: number;
  up?: number;
}

export interface CameraZoomInput {
  delta: number;
}

export interface CameraFocusInput {
  target: CameraVector3;
  distance?: number;
}

export interface CameraOrbitInput {
  yawDegrees?: number;
  pitchDegrees?: number;
}

export interface CameraMarkerInput {
  name: string;
}

const WORLD_UP: CameraVector3 = { x: 0, y: 1, z: 0 };
const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;

let markerSequence = 0;

export class CameraMarkerNotFoundError extends Error {
  constructor() {
    super("Camera marker not found");
    this.name = "CameraMarkerNotFoundError";
  }
}

const CAMERA_PRESETS: Record<CameraPreset, Omit<CameraSnapshot, "mode" | "activePreset">> = {
  home: buildPresetCamera({ x: 0, y: 5, z: 20 }, { x: 0, y: 1, z: 0 }),
  front: buildPresetCamera({ x: 0, y: 3, z: 18 }, { x: 0, y: 1, z: 0 }),
  back: buildPresetCamera({ x: 0, y: 3, z: -18 }, { x: 0, y: 1, z: 0 }),
  left: buildPresetCamera({ x: -18, y: 3, z: 0 }, { x: 0, y: 1, z: 0 }),
  right: buildPresetCamera({ x: 18, y: 3, z: 0 }, { x: 0, y: 1, z: 0 }),
  top: buildPresetCamera({ x: 0, y: 22, z: 0.01 }, { x: 0, y: 1, z: 0 }),
  isometric: buildPresetCamera({ x: 14, y: 10, z: 14 }, { x: 0, y: 1, z: 0 }),
};

export function createDefaultCameraWorkflowState(): CameraWorkflowState {
  return {
    camera: {
      mode: "orbit",
      ...cloneSnapshotFields(CAMERA_PRESETS.home),
      activePreset: "home",
    },
    markers: [],
    activeMarkerId: null,
  };
}

export function cloneCameraWorkflowState(state: CameraWorkflowState): CameraWorkflowState {
  return {
    camera: cloneCameraSnapshot(state.camera),
    markers: state.markers.map(cloneCameraMarker),
    activeMarkerId: state.activeMarkerId,
  };
}

export function validateCameraWorkflowState(state: CameraWorkflowState): CameraWorkflowState {
  if (!state || typeof state !== "object") {
    throw new TypeError("camera workflow state must be an object");
  }
  validateCameraSnapshot(state.camera);
  if (!Array.isArray(state.markers)) {
    throw new TypeError("camera workflow markers must be an array");
  }
  for (const marker of state.markers) {
    validateCameraMarker(marker);
  }
  if (state.activeMarkerId !== null && typeof state.activeMarkerId !== "string") {
    throw new TypeError("activeMarkerId must be a string or null");
  }
  if (
    state.activeMarkerId !== null &&
    !state.markers.some((marker) => marker.id === state.activeMarkerId)
  ) {
    throw new TypeError("activeMarkerId must reference an existing camera marker");
  }
  return cloneCameraWorkflowState(state);
}

export function moveCamera(state: CameraWorkflowState, input: CameraMoveInput): CameraWorkflowState {
  const current = validateCameraWorkflowState(state);
  const forwardAmount = readFiniteNumber(input.forward ?? 0, "forward");
  const rightAmount = readFiniteNumber(input.right ?? 0, "right");
  const upAmount = readFiniteNumber(input.up ?? 0, "up");
  const basis = cameraBasis(current.camera);
  const delta = addVectors(
    scaleVector(basis.forward, forwardAmount),
    scaleVector(basis.right, rightAmount),
    scaleVector(WORLD_UP, upAmount),
  );

  current.camera.position = addVectors(current.camera.position, delta);
  current.camera.target = addVectors(current.camera.target, delta);
  current.camera.activePreset = null;
  return validateCameraWorkflowState(current);
}

export function panCamera(state: CameraWorkflowState, input: CameraPanInput): CameraWorkflowState {
  const current = validateCameraWorkflowState(state);
  const rightAmount = readFiniteNumber(input.right ?? 0, "right");
  const upAmount = readFiniteNumber(input.up ?? 0, "up");
  const basis = cameraBasis(current.camera);
  const delta = addVectors(scaleVector(basis.right, rightAmount), scaleVector(WORLD_UP, upAmount));

  current.camera.position = addVectors(current.camera.position, delta);
  current.camera.target = addVectors(current.camera.target, delta);
  current.camera.activePreset = null;
  return validateCameraWorkflowState(current);
}

export function zoomCamera(state: CameraWorkflowState, input: CameraZoomInput): CameraWorkflowState {
  const current = validateCameraWorkflowState(state);
  const delta = readFiniteNumber(input.delta, "delta");

  if (current.camera.mode === "first-person") {
    current.camera.fieldOfViewDegrees = clamp(
      current.camera.fieldOfViewDegrees + delta,
      CAMERA_MIN_FIELD_OF_VIEW_DEGREES,
      CAMERA_MAX_FIELD_OF_VIEW_DEGREES,
    );
    current.camera.activePreset = null;
    return validateCameraWorkflowState(current);
  }

  const basis = cameraBasis(current.camera);
  const currentDistance = distance(current.camera.position, current.camera.target);
  const nextDistance = Math.max(CAMERA_MIN_ORBIT_DISTANCE, currentDistance + delta);
  current.camera.position = subtractVectors(
    current.camera.target,
    scaleVector(basis.forward, nextDistance),
  );
  current.camera.activePreset = null;
  return validateCameraWorkflowState(current);
}

export function focusCamera(state: CameraWorkflowState, input: CameraFocusInput): CameraWorkflowState {
  const current = validateCameraWorkflowState(state);
  const nextTarget = validateVector(input.target, "target");
  const basis = cameraBasis(current.camera);
  const nextDistance = input.distance === undefined
    ? distance(current.camera.position, current.camera.target)
    : Math.max(CAMERA_MIN_ORBIT_DISTANCE, readFiniteNumber(input.distance, "distance"));

  current.camera.target = nextTarget;
  current.camera.position = subtractVectors(nextTarget, scaleVector(basis.forward, nextDistance));
  current.camera.activePreset = null;
  return validateCameraWorkflowState(current);
}

export function orbitCamera(state: CameraWorkflowState, input: CameraOrbitInput): CameraWorkflowState {
  const current = validateCameraWorkflowState(state);
  const yawDelta = readFiniteNumber(input.yawDegrees ?? 0, "yawDegrees");
  const pitchDelta = readFiniteNumber(input.pitchDegrees ?? 0, "pitchDegrees");
  const distanceToTarget = Math.max(
    CAMERA_MIN_ORBIT_DISTANCE,
    distance(current.camera.position, current.camera.target),
  );

  current.camera.yawDegrees = normalizeYawDegrees(current.camera.yawDegrees + yawDelta);
  current.camera.pitchDegrees = clamp(
    current.camera.pitchDegrees + pitchDelta,
    CAMERA_MIN_PITCH_DEGREES,
    CAMERA_MAX_PITCH_DEGREES,
  );

  const forward = forwardVectorFromAngles(current.camera.yawDegrees, current.camera.pitchDegrees);
  if (current.camera.mode === "first-person") {
    current.camera.target = addVectors(current.camera.position, scaleVector(forward, distanceToTarget));
  } else {
    current.camera.position = subtractVectors(
      current.camera.target,
      scaleVector(forward, distanceToTarget),
    );
  }
  current.camera.activePreset = null;
  return validateCameraWorkflowState(current);
}

export function applyCameraPreset(
  state: CameraWorkflowState,
  preset: CameraPreset,
): CameraWorkflowState {
  assertCameraPreset(preset);
  const current = validateCameraWorkflowState(state);
  current.camera = {
    mode: "orbit",
    ...cloneSnapshotFields(CAMERA_PRESETS[preset]),
    activePreset: preset,
  };
  current.activeMarkerId = null;
  return validateCameraWorkflowState(current);
}

export function setCameraMode(state: CameraWorkflowState, mode: CameraMode): CameraWorkflowState {
  assertCameraMode(mode);
  const current = validateCameraWorkflowState(state);
  current.camera.mode = mode;
  current.camera.activePreset = null;
  return validateCameraWorkflowState(current);
}

export function saveCameraMarker(
  state: CameraWorkflowState,
  input: CameraMarkerInput,
): CameraWorkflowState {
  const current = validateCameraWorkflowState(state);
  const name = validateMarkerName(input.name);
  const marker: CameraMarker = {
    id: createMarkerId(),
    name,
    camera: cloneCameraSnapshot(current.camera),
    createdAt: new Date().toISOString(),
  };

  current.markers = [...current.markers, marker];
  current.activeMarkerId = marker.id;
  return validateCameraWorkflowState(current);
}

export function restoreCameraMarker(
  state: CameraWorkflowState,
  markerId: string,
): CameraWorkflowState {
  const current = validateCameraWorkflowState(state);
  const marker = current.markers.find((candidate) => candidate.id === markerId);
  if (!marker) {
    throw new CameraMarkerNotFoundError();
  }

  current.camera = cloneCameraSnapshot(marker.camera);
  current.activeMarkerId = marker.id;
  return validateCameraWorkflowState(current);
}

export function deleteCameraMarker(
  state: CameraWorkflowState,
  markerId: string,
): CameraWorkflowState {
  const current = validateCameraWorkflowState(state);
  const markerExists = current.markers.some((marker) => marker.id === markerId);
  if (!markerExists) {
    throw new CameraMarkerNotFoundError();
  }

  current.markers = current.markers.filter((marker) => marker.id !== markerId);
  if (current.activeMarkerId === markerId) {
    current.activeMarkerId = null;
  }
  return validateCameraWorkflowState(current);
}

export function listCameraMarkers(state: CameraWorkflowState): CameraMarker[] {
  return validateCameraWorkflowState(state).markers;
}

function buildPresetCamera(
  position: CameraVector3,
  target: CameraVector3,
): Omit<CameraSnapshot, "mode" | "activePreset"> {
  const direction = normalizeVector(subtractVectors(target, position), "preset direction");
  return {
    position: cloneVector(position),
    target: cloneVector(target),
    up: cloneVector(WORLD_UP),
    yawDegrees: yawDegreesFromForward(direction),
    pitchDegrees: pitchDegreesFromForward(direction),
    rollDegrees: 0,
    fieldOfViewDegrees: 60,
  };
}

function cloneSnapshotFields(
  camera: Omit<CameraSnapshot, "mode" | "activePreset">,
): Omit<CameraSnapshot, "mode" | "activePreset"> {
  return {
    position: cloneVector(camera.position),
    target: cloneVector(camera.target),
    up: cloneVector(camera.up),
    yawDegrees: camera.yawDegrees,
    pitchDegrees: camera.pitchDegrees,
    rollDegrees: camera.rollDegrees,
    fieldOfViewDegrees: camera.fieldOfViewDegrees,
  };
}

function cloneCameraSnapshot(camera: CameraSnapshot): CameraSnapshot {
  return {
    mode: camera.mode,
    ...cloneSnapshotFields(camera),
    activePreset: camera.activePreset,
  };
}

function cloneCameraMarker(marker: CameraMarker): CameraMarker {
  return {
    id: marker.id,
    name: marker.name,
    camera: cloneCameraSnapshot(marker.camera),
    createdAt: marker.createdAt,
  };
}

function validateCameraSnapshot(camera: CameraSnapshot): void {
  if (!camera || typeof camera !== "object") {
    throw new TypeError("camera snapshot must be an object");
  }
  assertCameraMode(camera.mode);
  validateVector(camera.position, "position");
  validateVector(camera.target, "target");
  validateVector(camera.up, "up");
  readFiniteNumber(camera.yawDegrees, "yawDegrees");
  readFiniteNumber(camera.pitchDegrees, "pitchDegrees");
  readFiniteNumber(camera.rollDegrees, "rollDegrees");
  readFiniteNumber(camera.fieldOfViewDegrees, "fieldOfViewDegrees");
  if (
    camera.pitchDegrees < CAMERA_MIN_PITCH_DEGREES ||
    camera.pitchDegrees > CAMERA_MAX_PITCH_DEGREES
  ) {
    throw new TypeError("pitchDegrees must be within camera pitch limits");
  }
  if (
    camera.fieldOfViewDegrees < CAMERA_MIN_FIELD_OF_VIEW_DEGREES ||
    camera.fieldOfViewDegrees > CAMERA_MAX_FIELD_OF_VIEW_DEGREES
  ) {
    throw new TypeError("fieldOfViewDegrees must be within camera field-of-view limits");
  }
  if (camera.activePreset !== null) {
    assertCameraPreset(camera.activePreset);
  }
  if (distance(camera.position, camera.target) < CAMERA_MIN_ORBIT_DISTANCE) {
    throw new TypeError("camera position and target must keep a safe orbit distance");
  }
}

function validateCameraMarker(marker: CameraMarker): void {
  if (!marker || typeof marker !== "object") {
    throw new TypeError("camera marker must be an object");
  }
  if (typeof marker.id !== "string" || !marker.id.trim()) {
    throw new TypeError("camera marker id must be a non-empty string");
  }
  validateMarkerName(marker.name);
  validateCameraSnapshot(marker.camera);
  if (typeof marker.createdAt !== "string" || Number.isNaN(Date.parse(marker.createdAt))) {
    throw new TypeError("camera marker createdAt must be an ISO timestamp");
  }
}

function validateMarkerName(value: string): string {
  if (typeof value !== "string") {
    throw new TypeError("camera marker name must be a string");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TypeError("camera marker name must be a non-empty string");
  }
  if (trimmed.length > CAMERA_MARKER_NAME_MAX_LENGTH) {
    throw new TypeError(`camera marker name must be ${CAMERA_MARKER_NAME_MAX_LENGTH} characters or fewer`);
  }
  return trimmed;
}

function assertCameraMode(mode: string): asserts mode is CameraMode {
  if (mode !== "orbit" && mode !== "first-person") {
    throw new TypeError(`unknown camera mode: ${mode}`);
  }
}

function assertCameraPreset(preset: string): asserts preset is CameraPreset {
  if (!(preset in CAMERA_PRESETS)) {
    throw new TypeError(`unknown camera preset: ${preset}`);
  }
}

function validateVector(value: CameraVector3, fieldName: string): CameraVector3 {
  if (!value || typeof value !== "object") {
    throw new TypeError(`${fieldName} must be a camera vector`);
  }
  return {
    x: readFiniteNumber(value.x, `${fieldName}.x`),
    y: readFiniteNumber(value.y, `${fieldName}.y`),
    z: readFiniteNumber(value.z, `${fieldName}.z`),
  };
}

function readFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${fieldName} must be a finite numeric value`);
  }
  return value;
}

function cameraBasis(camera: CameraSnapshot): { forward: CameraVector3; right: CameraVector3 } {
  const forward = normalizeVector(subtractVectors(camera.target, camera.position), "camera forward");
  let right = crossVectors(forward, WORLD_UP);
  if (vectorLength(right) < 0.000001) {
    right = { x: 1, y: 0, z: 0 };
  } else {
    right = normalizeVector(right, "camera right");
  }
  return { forward, right };
}

function forwardVectorFromAngles(yawDegrees: number, pitchDegrees: number): CameraVector3 {
  const yaw = yawDegrees * DEGREES_TO_RADIANS;
  const pitch = pitchDegrees * DEGREES_TO_RADIANS;
  const cosPitch = Math.cos(pitch);
  return normalizeVector({
    x: Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cosPitch,
  }, "camera angle forward");
}

function yawDegreesFromForward(forward: CameraVector3): number {
  return normalizeYawDegrees(Math.atan2(forward.x, -forward.z) * RADIANS_TO_DEGREES);
}

function pitchDegreesFromForward(forward: CameraVector3): number {
  return clamp(
    Math.asin(clamp(forward.y, -1, 1)) * RADIANS_TO_DEGREES,
    CAMERA_MIN_PITCH_DEGREES,
    CAMERA_MAX_PITCH_DEGREES,
  );
}

function cloneVector(vector: CameraVector3): CameraVector3 {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function addVectors(...vectors: CameraVector3[]): CameraVector3 {
  return vectors.reduce<CameraVector3>(
    (sum, vector) => ({ x: sum.x + vector.x, y: sum.y + vector.y, z: sum.z + vector.z }),
    { x: 0, y: 0, z: 0 },
  );
}

function subtractVectors(left: CameraVector3, right: CameraVector3): CameraVector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scaleVector(vector: CameraVector3, scale: number): CameraVector3 {
  return { x: vector.x * scale, y: vector.y * scale, z: vector.z * scale };
}

function crossVectors(left: CameraVector3, right: CameraVector3): CameraVector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function normalizeVector(vector: CameraVector3, fieldName: string): CameraVector3 {
  const length = vectorLength(vector);
  if (!Number.isFinite(length) || length === 0) {
    throw new TypeError(`${fieldName} must have a non-zero finite length`);
  }
  return scaleVector(vector, 1 / length);
}

function vectorLength(vector: CameraVector3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function distance(left: CameraVector3, right: CameraVector3): number {
  return vectorLength(subtractVectors(left, right));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeYawDegrees(value: number): number {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return Object.is(normalized, -180) ? 180 : normalized;
}

function createMarkerId(): string {
  markerSequence += 1;
  return `camera-marker-${Date.now().toString(36)}-${markerSequence.toString(36)}`;
}
