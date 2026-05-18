import type { Vec3, BoundingBox } from "./story-api/types";
import { SModel } from "./story-api/entities";

function assertFiniteVec3(v: Vec3, label: string): void {
  if (
    !Number.isFinite(v.x) ||
    !Number.isFinite(v.y) ||
    !Number.isFinite(v.z)
  ) {
    throw new TypeError(`${label} coordinates must be finite numbers`);
  }
}

/** Euclidean distance between two 3D points. */
export function euclideanDistance(a: Vec3, b: Vec3): number {
  assertFiniteVec3(a, "first point");
  assertFiniteVec3(b, "second point");
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** True when two points are within (or at) the given distance. */
export function isWithinDistance(a: Vec3, b: Vec3, threshold: number): boolean {
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new TypeError("threshold must be a non-negative finite number");
  }
  assertFiniteVec3(a, "first point");
  assertFiniteVec3(b, "second point");
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz <= threshold * threshold;
}

/** Compute an axis-aligned bounding box centered on an SModel's position. */
export function aabbFromEntity(entity: SModel): BoundingBox {
  if (!(entity instanceof SModel)) {
    throw new TypeError("entity must be an instance of SModel");
  }
  const { x, y, z } = entity.position;
  const { width, height, depth } = entity.size;
  const hw = width / 2;
  const hh = height / 2;
  const hd = depth / 2;
  return {
    min: { x: x - hw, y: y - hh, z: z - hd },
    max: { x: x + hw, y: y + hh, z: z + hd },
  };
}

/** True when two AABBs overlap (touching faces count as intersection). */
export function aabbIntersects(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.min.x <= b.max.x &&
    a.max.x >= b.min.x &&
    a.min.y <= b.max.y &&
    a.max.y >= b.min.y &&
    a.min.z <= b.max.z &&
    a.max.z >= b.min.z
  );
}

/** True when a point lies inside (or on the boundary of) an AABB. */
export function aabbContainsPoint(box: BoundingBox, point: Vec3): boolean {
  return (
    point.x >= box.min.x &&
    point.x <= box.max.x &&
    point.y >= box.min.y &&
    point.y <= box.max.y &&
    point.z >= box.min.z &&
    point.z <= box.max.z
  );
}

/** Alice3 Y-up direction constants. */
export const Direction = Object.freeze({
  FORWARD: Object.freeze<Vec3>({ x: 0, y: 0, z: -1 }),
  BACKWARD: Object.freeze<Vec3>({ x: 0, y: 0, z: 1 }),
  LEFT: Object.freeze<Vec3>({ x: -1, y: 0, z: 0 }),
  RIGHT: Object.freeze<Vec3>({ x: 1, y: 0, z: 0 }),
  UP: Object.freeze<Vec3>({ x: 0, y: 1, z: 0 }),
  DOWN: Object.freeze<Vec3>({ x: 0, y: -1, z: 0 }),
});
