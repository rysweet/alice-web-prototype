import type {
  MoveDirection,
  Orientation,
  Position,
  Size,
  SpatialRelation,
  Vec3,
} from "./expanded-types";

export const ZERO_POSITION: Position = { x: 0, y: 0, z: 0 };
export const IDENTITY_ORIENTATION: Orientation = { x: 0, y: 0, z: 0, w: 1 };
export const UNIT_SIZE: Size = { width: 1, height: 1, depth: 1 };
export const UNIT_SCALE: Size = { width: 1, height: 1, depth: 1 };

export function clonePosition(value: Position): Position {
  return { ...value };
}

export function cloneOrientation(value: Orientation): Orientation {
  return { ...value };
}

export function cloneSize(value: Size): Size {
  return { ...value };
}

export function samePosition(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

export function sameOrientation(left: Orientation, right: Orientation): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z && left.w === right.w;
}

export function sameSize(left: Size, right: Size): boolean {
  return left.width === right.width && left.height === right.height && left.depth === right.depth;
}

export function isFiniteVec3(value: Vec3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

export function isFinitePosition(value: Position): boolean {
  return isFiniteVec3(value);
}

export function isFiniteOrientation(value: Orientation): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.w)
  );
}

export function isFiniteSize(value: Size): boolean {
  return (
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    Number.isFinite(value.depth)
  );
}

export function addVec3(left: Vec3, right: Vec3): Vec3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

export function subtractVec3(left: Vec3, right: Vec3): Vec3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

export function scaleVec3(value: Vec3, scalar: number): Vec3 {
  return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar };
}

export function dotVec3(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

export function magnitudeVec3(value: Vec3): number {
  return Math.sqrt(dotVec3(value, value));
}

export function normalizeVec3(value: Vec3): Vec3 {
  const magnitude = magnitudeVec3(value);
  if (magnitude === 0) {
    return ZERO_POSITION;
  }
  return scaleVec3(value, 1 / magnitude);
}

export function distanceBetween(left: Vec3, right: Vec3): number {
  return magnitudeVec3(subtractVec3(left, right));
}

export function interpolateNumber(left: number, right: number, portion: number): number {
  return left + ((right - left) * portion);
}

export function interpolatePosition(left: Position, right: Position, portion: number): Position {
  return {
    x: interpolateNumber(left.x, right.x, portion),
    y: interpolateNumber(left.y, right.y, portion),
    z: interpolateNumber(left.z, right.z, portion),
  };
}

export function interpolateSize(left: Size, right: Size, portion: number): Size {
  return {
    width: interpolateNumber(left.width, right.width, portion),
    height: interpolateNumber(left.height, right.height, portion),
    depth: interpolateNumber(left.depth, right.depth, portion),
  };
}

export function normalizeQuaternion(value: Orientation): Orientation {
  const magnitude = Math.hypot(value.x, value.y, value.z, value.w);
  if (magnitude === 0 || !Number.isFinite(magnitude)) {
    return IDENTITY_ORIENTATION;
  }
  return {
    x: value.x / magnitude,
    y: value.y / magnitude,
    z: value.z / magnitude,
    w: value.w / magnitude,
  };
}

export function quaternionMultiply(left: Orientation, right: Orientation): Orientation {
  return normalizeQuaternion({
    x: left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y,
    y: left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x,
    z: left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w,
    w: left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z,
  });
}

export function quaternionConjugate(value: Orientation): Orientation {
  return { x: -value.x, y: -value.y, z: -value.z, w: value.w };
}

export function quaternionFromAxisAngle(x: number, y: number, z: number, radians: number): Orientation {
  const axis = normalizeVec3({ x, y, z });
  const half = radians / 2;
  const sine = Math.sin(half);
  return normalizeQuaternion({
    x: axis.x * sine,
    y: axis.y * sine,
    z: axis.z * sine,
    w: Math.cos(half),
  });
}

export function rotateVector(orientation: Orientation, vector: Vec3): Vec3 {
  const q = normalizeQuaternion(orientation);
  const point: Orientation = { x: vector.x, y: vector.y, z: vector.z, w: 0 };
  const rotated = quaternionMultiply(quaternionMultiply(q, point), quaternionConjugate(q));
  return { x: rotated.x, y: rotated.y, z: rotated.z };
}

export function quaternionFromEuler(pitch: number, yaw: number, roll: number): Orientation {
  const yawQ = quaternionFromAxisAngle(0, 1, 0, yaw);
  const pitchQ = quaternionFromAxisAngle(1, 0, 0, pitch);
  const rollQ = quaternionFromAxisAngle(0, 0, 1, roll);
  return quaternionMultiply(yawQ, quaternionMultiply(pitchQ, rollQ));
}

export function orientationFromLookDirection(direction: Vec3): Orientation {
  const normalized = normalizeVec3(direction);
  if (samePosition(normalized, ZERO_POSITION)) {
    return IDENTITY_ORIENTATION;
  }
  const yaw = Math.atan2(normalized.x, -normalized.z);
  const pitch = Math.atan2(normalized.y, Math.hypot(normalized.x, normalized.z));
  return quaternionFromEuler(-pitch, yaw, 0);
}

export function vectorFromMoveDirection(direction: MoveDirection | Vec3): Vec3 {
  if (typeof direction !== "string") {
    return normalizeVec3(direction);
  }
  switch (direction) {
    case "FORWARD":
      return { x: 0, y: 0, z: -1 };
    case "BACKWARD":
      return { x: 0, y: 0, z: 1 };
    case "LEFT":
      return { x: -1, y: 0, z: 0 };
    case "RIGHT":
      return { x: 1, y: 0, z: 0 };
    case "UP":
      return { x: 0, y: 1, z: 0 };
    case "DOWN":
      return { x: 0, y: -1, z: 0 };
  }
}

export function relationOffset(relation: SpatialRelation, amount: number): Vec3 {
  switch (relation) {
    case "ABOVE":
      return { x: 0, y: amount, z: 0 };
    case "BELOW":
      return { x: 0, y: -amount, z: 0 };
    case "LEFT_OF":
      return { x: -amount, y: 0, z: 0 };
    case "RIGHT_OF":
      return { x: amount, y: 0, z: 0 };
    case "IN_FRONT_OF":
      return { x: 0, y: 0, z: -amount };
    case "BEHIND":
      return { x: 0, y: 0, z: amount };
  }
}
