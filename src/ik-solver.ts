import { lerpVec3, nlerp } from "./animation";
import type { Orientation, Vec3 } from "./story-api";

export interface IkAxisLimit {
  readonly min?: number;
  readonly max?: number;
}

export interface JointAngleLimits {
  readonly x?: IkAxisLimit;
  readonly y?: IkAxisLimit;
  readonly z?: IkAxisLimit;
  readonly twist?: IkAxisLimit;
}

export interface IkJoint {
  readonly name: string;
  readonly position: Vec3;
  readonly orientation: Orientation;
  readonly limits?: JointAngleLimits;
}

export interface IkChainDefinition {
  readonly joints: readonly IkJoint[];
  readonly rootIndex?: number;
  readonly endEffectorIndex?: number;
}

export type IkTargetKind = "reach-for" | "point-at" | "look-at";

export interface IkTarget {
  readonly position: Vec3;
  readonly kind?: IkTargetKind;
  readonly up?: Vec3;
}

export interface IkSolveOptions {
  readonly iterations?: number;
  readonly tolerance?: number;
}

export interface IkSolveResult {
  readonly joints: IkJoint[];
  readonly endEffector: Vec3;
  readonly distance: number;
  readonly iterationsUsed: number;
  readonly reached: boolean;
}

const X_AXIS: Vec3 = { x: 1, y: 0, z: 0 };
const Y_AXIS: Vec3 = { x: 0, y: 1, z: 0 };
const Z_AXIS: Vec3 = { x: 0, y: 0, z: 1 };
const IDENTITY: Orientation = { x: 0, y: 0, z: 0, w: 1 };

function cloneVec3(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

function cloneOrientation(value: Orientation): Orientation {
  return { x: value.x, y: value.y, z: value.z, w: value.w };
}

function cloneJoint(joint: IkJoint): IkJoint {
  return {
    name: joint.name,
    position: cloneVec3(joint.position),
    orientation: cloneOrientation(joint.orientation),
    limits: joint.limits,
  };
}

function add(left: Vec3, right: Vec3): Vec3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(vector: Vec3, scalar: number): Vec3 {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

function dot(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function length(vector: Vec3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function distance(left: Vec3, right: Vec3): number {
  return length(subtract(left, right));
}

function normalize(vector: Vec3): Vec3 {
  const magnitude = length(vector);
  if (magnitude === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return scale(vector, 1 / magnitude);
}

function clamp(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) {
    return min;
  }
  if (max !== undefined && value > max) {
    return max;
  }
  return value;
}

function quaternionNormalize(value: Orientation): Orientation {
  const magnitude = Math.hypot(value.x, value.y, value.z, value.w);
  if (magnitude === 0) {
    return IDENTITY;
  }
  return {
    x: value.x / magnitude,
    y: value.y / magnitude,
    z: value.z / magnitude,
    w: value.w / magnitude,
  };
}

function quaternionInverse(value: Orientation): Orientation {
  const normalized = quaternionNormalize(value);
  return { x: -normalized.x, y: -normalized.y, z: -normalized.z, w: normalized.w };
}

function quaternionMultiplyRaw(left: Orientation, right: Orientation): Orientation {
  return {
    w: left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z,
    x: left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y,
    y: left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x,
    z: left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w,
  };
}

function quaternionMultiply(left: Orientation, right: Orientation): Orientation {
  return quaternionNormalize(quaternionMultiplyRaw(left, right));
}

function quaternionFromAxisAngle(axis: Vec3, radians: number): Orientation {
  const direction = normalize(axis);
  const half = radians * 0.5;
  const sine = Math.sin(half);
  return quaternionNormalize({
    x: direction.x * sine,
    y: direction.y * sine,
    z: direction.z * sine,
    w: Math.cos(half),
  });
}

function quaternionFromTo(from: Vec3, to: Vec3): Orientation {
  const left = normalize(from);
  const right = normalize(to);
  const cosine = clamp(dot(left, right), -1, 1);
  if (cosine > 0.999999) {
    return IDENTITY;
  }
  if (cosine < -0.999999) {
    const fallbackAxis = Math.abs(left.x) < 0.9 ? cross(left, X_AXIS) : cross(left, Y_AXIS);
    return quaternionFromAxisAngle(fallbackAxis, Math.PI);
  }
  const axis = cross(left, right);
  return quaternionNormalize({
    x: axis.x,
    y: axis.y,
    z: axis.z,
    w: 1 + cosine,
  });
}

export function rotateVector(orientation: Orientation, vector: Vec3): Vec3 {
  const q = quaternionNormalize(orientation);
  const v: Orientation = { x: vector.x, y: vector.y, z: vector.z, w: 0 };
  const rotated = quaternionMultiplyRaw(quaternionMultiplyRaw(q, v), quaternionInverse(q));
  return { x: rotated.x, y: rotated.y, z: rotated.z };
}

export function forwardVectorOf(orientation: Orientation): Vec3 {
  return normalize(rotateVector(orientation, X_AXIS));
}

function basisToQuaternion(forward: Vec3, upHint: Vec3): Orientation {
  const xAxis = normalize(forward);
  const zAxis = normalize(cross(xAxis, upHint));
  const resolvedZ = length(zAxis) === 0 ? Z_AXIS : zAxis;
  const yAxis = normalize(cross(resolvedZ, xAxis));

  const m00 = xAxis.x;
  const m01 = yAxis.x;
  const m02 = resolvedZ.x;
  const m10 = xAxis.y;
  const m11 = yAxis.y;
  const m12 = resolvedZ.y;
  const m20 = xAxis.z;
  const m21 = yAxis.z;
  const m22 = resolvedZ.z;
  const trace = m00 + m11 + m22;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1.0) * 2;
    return quaternionNormalize({
      w: 0.25 * s,
      x: (m21 - m12) / s,
      y: (m02 - m20) / s,
      z: (m10 - m01) / s,
    });
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
    return quaternionNormalize({
      w: (m21 - m12) / s,
      x: 0.25 * s,
      y: (m01 + m10) / s,
      z: (m02 + m20) / s,
    });
  }
  if (m11 > m22) {
    const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
    return quaternionNormalize({
      w: (m02 - m20) / s,
      x: (m01 + m10) / s,
      y: 0.25 * s,
      z: (m12 + m21) / s,
    });
  }
  const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
  return quaternionNormalize({
    w: (m10 - m01) / s,
    x: (m02 + m20) / s,
    y: (m12 + m21) / s,
    z: 0.25 * s,
  });
}

function lookAtOrientation(origin: Vec3, target: Vec3, up: Vec3 = Y_AXIS): Orientation {
  const forward = normalize(subtract(target, origin));
  if (length(forward) === 0) {
    return IDENTITY;
  }
  return basisToQuaternion(forward, normalize(up));
}

export function orientationToEulerAngles(orientation: Orientation): Vec3 {
  const q = quaternionNormalize(orientation);
  const sinrCosp = 2 * (q.w * q.x + q.y * q.z);
  const cosrCosp = 1 - 2 * (q.x * q.x + q.y * q.y);
  const roll = Math.atan2(sinrCosp, cosrCosp);

  const sinp = 2 * (q.w * q.y - q.z * q.x);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);

  const sinyCosp = 2 * (q.w * q.z + q.x * q.y);
  const cosyCosp = 1 - 2 * (q.y * q.y + q.z * q.z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);

  return { x: roll, y: pitch, z: yaw };
}

function eulerToQuaternion(angles: Vec3): Orientation {
  const cx = Math.cos(angles.x * 0.5);
  const sx = Math.sin(angles.x * 0.5);
  const cy = Math.cos(angles.y * 0.5);
  const sy = Math.sin(angles.y * 0.5);
  const cz = Math.cos(angles.z * 0.5);
  const sz = Math.sin(angles.z * 0.5);
  return quaternionNormalize({
    w: cx * cy * cz + sx * sy * sz,
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
  });
}

export function applyJointLimits(orientation: Orientation, limits?: JointAngleLimits): Orientation {
  if (!limits) {
    return quaternionNormalize(orientation);
  }
  const euler = orientationToEulerAngles(orientation);
  const clamped = {
    x: clamp(euler.x, limits.x?.min, limits.x?.max),
    y: clamp(euler.y, limits.y?.min, limits.y?.max),
    z: clamp(
      clamp(euler.z, limits.z?.min, limits.z?.max),
      limits.twist?.min,
      limits.twist?.max,
    ),
  };
  return eulerToQuaternion(clamped);
}

function assertChain(definition: IkChainDefinition): void {
  if (definition.joints.length < 2) {
    throw new TypeError("IK chains require at least two joints");
  }
}

function cloneChain(definition: IkChainDefinition): IkJoint[] {
  assertChain(definition);
  return definition.joints.map(cloneJoint);
}

function chainLengths(joints: readonly IkJoint[]): number[] {
  const lengths: number[] = [];
  for (let index = 0; index < joints.length - 1; index += 1) {
    lengths.push(distance(joints[index]!.position, joints[index + 1]!.position));
  }
  return lengths;
}

function updateOrientationsFromPositions(joints: IkJoint[], target?: IkTarget): void {
  for (let index = 0; index < joints.length - 1; index += 1) {
    const joint = joints[index]!;
    const desired = lookAtOrientation(joint.position, joints[index + 1]!.position);
    joints[index] = {
      ...joint,
      orientation: applyJointLimits(desired, joint.limits),
    };
  }
  const endIndex = joints.length - 1;
  const end = joints[endIndex]!;
  if (target && target.kind !== "reach-for") {
    joints[endIndex] = {
      ...end,
      orientation: applyJointLimits(lookAtOrientation(end.position, target.position, target.up ?? Y_AXIS), end.limits),
    };
  }
}

function summarize(joints: IkJoint[], target: Vec3, iterationsUsed: number, tolerance: number): IkSolveResult {
  const endEffector = joints[joints.length - 1]!.position;
  const remaining = distance(endEffector, target);
  return {
    joints,
    endEffector,
    distance: remaining,
    iterationsUsed,
    reached: remaining <= tolerance,
  };
}

export function solveCcd(
  definition: IkChainDefinition,
  target: Vec3,
  options: IkSolveOptions = {},
): IkSolveResult {
  const joints = cloneChain(definition);
  const rootIndex = definition.rootIndex ?? 0;
  const endIndex = definition.endEffectorIndex ?? joints.length - 1;
  const iterations = Math.max(1, options.iterations ?? 12);
  const tolerance = Math.max(1e-6, options.tolerance ?? 1e-3);
  let iterationsUsed = 0;

  for (; iterationsUsed < iterations; iterationsUsed += 1) {
    if (distance(joints[endIndex]!.position, target) <= tolerance) {
      break;
    }
    for (let pivotIndex = endIndex - 1; pivotIndex >= rootIndex; pivotIndex -= 1) {
      const pivot = joints[pivotIndex]!;
      const toEnd = subtract(joints[endIndex]!.position, pivot.position);
      const toTarget = subtract(target, pivot.position);
      if (length(toEnd) === 0 || length(toTarget) === 0) {
        continue;
      }
      const delta = quaternionFromTo(toEnd, toTarget);
      const desired = quaternionMultiply(delta, pivot.orientation);
      const limited = applyJointLimits(desired, pivot.limits);
      const applied = quaternionMultiply(limited, quaternionInverse(pivot.orientation));
      joints[pivotIndex] = { ...pivot, orientation: limited };
      for (let jointIndex = pivotIndex + 1; jointIndex <= endIndex; jointIndex += 1) {
        const offset = subtract(joints[jointIndex]!.position, pivot.position);
        joints[jointIndex] = {
          ...joints[jointIndex]!,
          position: add(pivot.position, rotateVector(applied, offset)),
        };
      }
    }
  }

  updateOrientationsFromPositions(joints, { position: target, kind: "point-at" });
  return summarize(joints, target, iterationsUsed, tolerance);
}

export function solveFabrik(
  definition: IkChainDefinition,
  target: Vec3,
  options: IkSolveOptions = {},
): IkSolveResult {
  const joints = cloneChain(definition);
  const lengths = chainLengths(joints);
  const positions = joints.map((joint) => cloneVec3(joint.position));
  const iterations = Math.max(1, options.iterations ?? 12);
  const tolerance = Math.max(1e-6, options.tolerance ?? 1e-3);
  const root = cloneVec3(positions[0]!);
  const totalLength = lengths.reduce((sum, value) => sum + value, 0);
  let iterationsUsed = 0;

  if (distance(root, target) >= totalLength) {
    const direction = normalize(subtract(target, root));
    for (let index = 1; index < positions.length; index += 1) {
      positions[index] = add(positions[index - 1]!, scale(direction, lengths[index - 1]!));
    }
  } else {
    for (; iterationsUsed < iterations; iterationsUsed += 1) {
      positions[positions.length - 1] = cloneVec3(target);
      for (let index = positions.length - 2; index >= 0; index -= 1) {
        const direction = normalize(subtract(positions[index]!, positions[index + 1]!));
        positions[index] = add(positions[index + 1]!, scale(direction, lengths[index]!));
      }
      positions[0] = cloneVec3(root);
      for (let index = 1; index < positions.length; index += 1) {
        const direction = normalize(subtract(positions[index]!, positions[index - 1]!));
        positions[index] = add(positions[index - 1]!, scale(direction, lengths[index - 1]!));
      }
      if (distance(positions[positions.length - 1]!, target) <= tolerance) {
        break;
      }
    }
  }

  for (let index = 0; index < joints.length; index += 1) {
    joints[index] = { ...joints[index]!, position: positions[index]! };
  }
  updateOrientationsFromPositions(joints, { position: target, kind: "look-at" });
  return summarize(joints, target, iterationsUsed, tolerance);
}

export function trackIkTarget(
  definition: IkChainDefinition,
  target: IkTarget,
  solver: "ccd" | "fabrik" = "ccd",
  options: IkSolveOptions = {},
): IkSolveResult {
  const base = solver === "ccd"
    ? solveCcd(definition, target.position, options)
    : solveFabrik(definition, target.position, options);
  if (target.kind === "reach-for" || !base.joints.length) {
    return base;
  }
  const joints = base.joints.map(cloneJoint);
  const endIndex = joints.length - 1;
  const end = joints[endIndex]!;
  joints[endIndex] = {
    ...end,
    orientation: applyJointLimits(lookAtOrientation(end.position, target.position, target.up ?? Y_AXIS), end.limits),
  };
  return {
    ...base,
    joints,
    endEffector: joints[endIndex]!.position,
  };
}

export function blendIkWithKeyframe(
  ikPose: readonly IkJoint[],
  keyframePose: readonly IkJoint[],
  weight: number,
): IkJoint[] {
  const portion = clamp(weight, 0, 1);
  return ikPose.map((joint, index) => {
    const fallback = keyframePose[index] ?? joint;
    return {
      ...joint,
      position: lerpVec3(fallback.position, joint.position, portion),
      orientation: nlerp(fallback.orientation, joint.orientation, portion),
    };
  });
}
