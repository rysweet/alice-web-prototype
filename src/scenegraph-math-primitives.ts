import * as THREE from "three";

export interface GeometryBounds {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface QuaternionLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface VisualAppearance {
  color: number;
  opacity: number;
  visible: boolean;
}

export function cloneBounds(bounds: GeometryBounds): GeometryBounds {
  return {
    min: bounds.min.clone(),
    max: bounds.max.clone(),
  };
}

export function combineBounds(boundsList: readonly GeometryBounds[]): GeometryBounds | null {
  if (boundsList.length === 0) {
    return null;
  }
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const bounds of boundsList) {
    min.min(bounds.min);
    max.max(bounds.max);
  }
  return { min, max };
}

export function transformedBounds(bounds: GeometryBounds, matrix: THREE.Matrix4): GeometryBounds {
  const corners = [
    new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
    new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
    new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
    new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.max.z),
    new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
    new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
    new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
    new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
  ].map((corner) => corner.applyMatrix4(matrix));
  const box = new THREE.Box3().setFromPoints(corners);
  return { min: box.min.clone(), max: box.max.clone() };
}

export function toVector3(value: Vector3Like): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

export function toQuaternion(value: QuaternionLike): THREE.Quaternion {
  return new THREE.Quaternion(value.x, value.y, value.z, value.w).normalize();
}

export const REASONABLE_EPSILON = 1e-9;

export function wrapPositive(value: number, period: number): number {
  const wrapped = value % period;
  return wrapped < 0 ? wrapped + period : wrapped;
}

export function wrapSigned(value: number, period: number): number {
  return wrapPositive(value + period * 0.5, period) - period * 0.5;
}
