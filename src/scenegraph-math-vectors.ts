import * as THREE from "three";
import type { OrthogonalMatrix3x3 } from "./scenegraph-math-orientation";
import { REASONABLE_EPSILON, Vector3Like, wrapPositive, wrapSigned } from "./scenegraph-math-primitives";

export function toAngle(value: Angle | number): Angle {
  return value instanceof Angle ? value : Angle.fromRadians(value);
}

export function toMathVector3(value: Vector3Like): Vector3 {
  return value instanceof Vector3 ? value : new Vector3(value.x, value.y, value.z);
}

export function normalizeAxis(value: Vector3Like): Vector3 {
  const axis = Vector3.createNormalized(value.x, value.y, value.z);
  return axis.isNaN() ? Vector3.POSITIVE_X_AXIS : axis;
}

export class Angle {
  static readonly NaN = new Angle(Number.NaN);
  static readonly ZERO = new Angle(0);
  static readonly PI = new Angle(Math.PI);
  static readonly TAU = new Angle(Math.PI * 2);

  constructor(public readonly radians: number) {}

  static fromRadians(radians: number): Angle {
    return new Angle(radians);
  }

  static fromDegrees(degrees: number): Angle {
    return new Angle((degrees * Math.PI) / 180);
  }

  isNaN(): boolean {
    return Number.isNaN(this.radians);
  }

  isZero(): boolean {
    return this.radians === 0;
  }

  isCloseTo(other: Angle, epsilon = REASONABLE_EPSILON): boolean {
    return this === other || (this.isNaN() && other.isNaN()) || Math.abs(this.radians - other.radians) <= epsilon;
  }

  getAsRadians(): number {
    return this.radians;
  }

  getAsDegrees(): number {
    return (this.radians * 180) / Math.PI;
  }

  wrapped(): Angle {
    return new Angle(wrapSigned(this.radians, Angle.TAU.radians));
  }

  wrappedPositive(): Angle {
    return new Angle(wrapPositive(this.radians, Angle.TAU.radians));
  }

  negated(): Angle {
    return new Angle(-this.radians);
  }

  minus(other: Angle): Angle {
    return other.isZero() ? this : new Angle(this.radians - other.radians);
  }

  times(factor: number): Angle {
    return new Angle(this.radians * factor);
  }

  interpolateToward(other: Angle, portion: number): Angle {
    return new Angle(this.radians + ((other.radians - this.radians) * portion));
  }
}

let scaleMatrixFactory: ((vector: Vector3) => OrthogonalMatrix3x3) | null = null;

export function registerScaleMatrixFactory(factory: (vector: Vector3) => OrthogonalMatrix3x3): void {
  scaleMatrixFactory = factory;
}

export class Vector3 implements Vector3Like {
  static readonly ZERO = new Vector3(0, 0, 0);
  static readonly NaN = new Vector3(Number.NaN, Number.NaN, Number.NaN);
  static readonly POSITIVE_X_AXIS = new Vector3(1, 0, 0);
  static readonly POSITIVE_Y_AXIS = new Vector3(0, 1, 0);
  static readonly POSITIVE_Z_AXIS = new Vector3(0, 0, 1);
  static readonly NEGATIVE_X_AXIS = new Vector3(-1, 0, 0);
  static readonly NEGATIVE_Y_AXIS = new Vector3(0, -1, 0);
  static readonly NEGATIVE_Z_AXIS = new Vector3(0, 0, -1);

  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
  ) {}

  static from(value: Vector3Like): Vector3 {
    return value instanceof Vector3 ? value : new Vector3(value.x, value.y, value.z);
  }

  static magnitudeSquared(x: number, y: number, z: number): number {
    return (x * x) + (y * y) + (z * z);
  }

  static magnitude(x: number, y: number, z: number): number {
    const magnitudeSquared = Vector3.magnitudeSquared(x, y, z);
    return magnitudeSquared === 1 ? 1 : Math.sqrt(magnitudeSquared);
  }

  static createNormalized(x: number, y: number, z: number): Vector3 {
    const magnitudeSquared = Vector3.magnitudeSquared(x, y, z);
    if (magnitudeSquared === 0 || !Number.isFinite(magnitudeSquared)) {
      return Vector3.NaN;
    }
    if (magnitudeSquared === 1) {
      return new Vector3(x, y, z);
    }
    const magnitude = Math.sqrt(magnitudeSquared);
    return new Vector3(x / magnitude, y / magnitude, z / magnitude);
  }

  isNaN(): boolean {
    return Number.isNaN(this.x) || Number.isNaN(this.y) || Number.isNaN(this.z);
  }

  plus(other: Vector3Like): Vector3 {
    const value = Vector3.from(other);
    return new Vector3(this.x + value.x, this.y + value.y, this.z + value.z);
  }

  minus(other: Vector3Like): Vector3 {
    const value = Vector3.from(other);
    return new Vector3(this.x - value.x, this.y - value.y, this.z - value.z);
  }

  times(factor: number): Vector3 {
    return new Vector3(this.x * factor, this.y * factor, this.z * factor);
  }

  dividedBy(divisor: number): Vector3 {
    return new Vector3(this.x / divisor, this.y / divisor, this.z / divisor);
  }

  negate(): Vector3 {
    return new Vector3(-this.x, -this.y, -this.z);
  }

  dotProduct(other: Vector3Like): number {
    const value = Vector3.from(other);
    return (this.x * value.x) + (this.y * value.y) + (this.z * value.z);
  }

  dot(other: Vector3Like): number {
    return this.dotProduct(other);
  }

  crossProduct(other: Vector3Like): Vector3 {
    const value = Vector3.from(other);
    return new Vector3(
      (this.y * value.z) - (this.z * value.y),
      (value.x * this.z) - (value.z * this.x),
      (this.x * value.y) - (this.y * value.x),
    );
  }

  cross(other: Vector3Like): Vector3 {
    return this.crossProduct(other);
  }

  magnitudeSquared(): number {
    return Vector3.magnitudeSquared(this.x, this.y, this.z);
  }

  magnitude(): number {
    return Vector3.magnitude(this.x, this.y, this.z);
  }

  normalized(): Vector3 {
    return Vector3.createNormalized(this.x, this.y, this.z);
  }

  normalize(): Vector3 {
    return this.normalized();
  }

  distanceTo(other: Vector3Like): number {
    return this.minus(other).magnitude();
  }

  isWithinEpsilonOf(other: Vector3Like, epsilon = REASONABLE_EPSILON): boolean {
    const value = Vector3.from(other);
    return (
      Math.abs(this.x - value.x) <= epsilon &&
      Math.abs(this.y - value.y) <= epsilon &&
      Math.abs(this.z - value.z) <= epsilon
    );
  }

  asPoint(): Point3 {
    return new Point3(this.x, this.y, this.z);
  }

  asScaleMatrix(): OrthogonalMatrix3x3 {
    if (!scaleMatrixFactory) {
      throw new Error("Scale matrix factory not registered");
    }
    return scaleMatrixFactory(this);
  }

  projectedOnto(target: Vector3Like): Vector3 {
    const unitTarget = Vector3.from(target).normalized();
    return unitTarget.times(this.dotProduct(unitTarget));
  }

  toThreeVector3(): THREE.Vector3 {
    return new THREE.Vector3(this.x, this.y, this.z);
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }
}

export class Point3 implements Vector3Like {
  static readonly ORIGIN = new Point3(0, 0, 0);
  static readonly NaN = new Point3(Number.NaN, Number.NaN, Number.NaN);

  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
  ) {}

  static from(value: Vector3Like): Point3 {
    return value instanceof Point3 ? value : new Point3(value.x, value.y, value.z);
  }

  isNaN(): boolean {
    return Number.isNaN(this.x) || Number.isNaN(this.y) || Number.isNaN(this.z);
  }

  plus(vector: Vector3Like): Point3 {
    const value = Vector3.from(vector);
    return new Point3(this.x + value.x, this.y + value.y, this.z + value.z);
  }

  minus(value: Point3): Vector3;
  minus(value: Vector3Like): Point3;
  minus(value: Point3 | Vector3Like): Point3 | Vector3 {
    if (value instanceof Point3) {
      return new Vector3(this.x - value.x, this.y - value.y, this.z - value.z);
    }
    const vector = Vector3.from(value);
    return new Point3(this.x - vector.x, this.y - vector.y, this.z - vector.z);
  }

  times(factor: number): Point3 {
    return new Point3(this.x * factor, this.y * factor, this.z * factor);
  }

  distanceSquaredFrom(other: Point3): number {
    const delta = other.minus(this) as Vector3;
    return delta.magnitudeSquared();
  }

  distanceFrom(other: Point3): number {
    return Math.sqrt(this.distanceSquaredFrom(other));
  }

  isWithinEpsilonOf(other: Vector3Like, epsilon = REASONABLE_EPSILON): boolean {
    return this.asVector().isWithinEpsilonOf(other, epsilon);
  }

  asVector(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  toThreeVector3(): THREE.Vector3 {
    return new THREE.Vector3(this.x, this.y, this.z);
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }
}
