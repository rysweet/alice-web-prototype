import * as THREE from "three";
import { QuaternionLike, REASONABLE_EPSILON, Vector3Like, toQuaternion } from "./scenegraph-math-primitives";
import { Angle, Vector3, normalizeAxis, registerScaleMatrixFactory, toAngle, toMathVector3 } from "./scenegraph-math-vectors";

export class OrthogonalMatrix3x3 {
  static readonly IDENTITY = new OrthogonalMatrix3x3(
    Vector3.POSITIVE_X_AXIS,
    Vector3.POSITIVE_Y_AXIS,
    Vector3.POSITIVE_Z_AXIS,
  );

  static readonly NaN = new OrthogonalMatrix3x3(Vector3.NaN, Vector3.NaN, Vector3.NaN);

  constructor(
    public readonly right: Vector3 = Vector3.POSITIVE_X_AXIS,
    public readonly up: Vector3 = Vector3.POSITIVE_Y_AXIS,
    public readonly backward: Vector3 = Vector3.POSITIVE_Z_AXIS,
  ) {}

  static fromQuaternion(value: QuaternionLike): OrthogonalMatrix3x3 {
    const quaternion = toQuaternion(value);
    const { x, y, z, w } = quaternion;
    return new OrthogonalMatrix3x3(
      new Vector3(1 - (2 * ((y * y) + (z * z))), 2 * ((x * y) + (z * w)), 2 * ((x * z) - (y * w))),
      new Vector3(2 * ((x * y) - (z * w)), 1 - (2 * ((x * x) + (z * z))), 2 * ((y * z) + (x * w))),
      new Vector3(2 * ((x * z) + (y * w)), 2 * ((y * z) - (x * w)), 1 - (2 * ((x * x) + (y * y)))),
    );
  }

  static fromAxisAngle(axis: Vector3Like, angle: Angle | number): OrthogonalMatrix3x3 {
    return new AxisRotation(normalizeAxis(axis), toAngle(angle)).asMatrix3x3();
  }

  static fromEulerAngles(pitch: Angle | number, yaw: Angle | number, roll: Angle | number): OrthogonalMatrix3x3 {
    const theta = toAngle(yaw).getAsRadians();
    const phi = toAngle(pitch).getAsRadians();
    const psi = toAngle(roll).getAsRadians();
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const cosPsi = Math.cos(psi);
    const sinPsi = Math.sin(psi);
    const right = new Vector3(cosPsi * cosTheta, sinPsi * cosTheta, -sinTheta);
    const up = new Vector3(
      (cosPsi * sinTheta * sinPhi) - (sinPsi * cosPhi),
      (sinPsi * sinTheta * sinPhi) + (cosPsi * cosPhi),
      cosTheta * sinPhi,
    );
    const backward = new Vector3(
      (cosPsi * sinTheta * cosPhi) + (sinPsi * sinPhi),
      (sinPsi * sinTheta * cosPhi) - (cosPsi * sinPhi),
      cosTheta * cosPhi,
    );
    return new OrthogonalMatrix3x3(right, up, backward);
  }

  static fromRowMajorElements(
    e11: number, e12: number, e13: number,
    e21: number, e22: number, e23: number,
    e31: number, e32: number, e33: number,
  ): OrthogonalMatrix3x3 {
    return new OrthogonalMatrix3x3(
      new Vector3(e11, e21, e31),
      new Vector3(e12, e22, e32),
      new Vector3(e13, e23, e33),
    );
  }

  isNaN(): boolean {
    return this.right.isNaN() || this.up.isNaN() || this.backward.isNaN();
  }

  isIdentity(epsilon = REASONABLE_EPSILON): boolean {
    return this.isWithinEpsilonOf(OrthogonalMatrix3x3.IDENTITY, epsilon);
  }

  isWithinEpsilonOf(other: OrthogonalMatrix3x3, epsilon = REASONABLE_EPSILON): boolean {
    return (
      this.right.isWithinEpsilonOf(other.right, epsilon) &&
      this.up.isWithinEpsilonOf(other.up, epsilon) &&
      this.backward.isWithinEpsilonOf(other.backward, epsilon)
    );
  }

  plus(other: OrthogonalMatrix3x3): OrthogonalMatrix3x3 {
    return new OrthogonalMatrix3x3(
      this.right.plus(other.right),
      this.up.plus(other.up),
      this.backward.plus(other.backward),
    );
  }

  times(other: number): OrthogonalMatrix3x3;
  times(other: OrthogonalMatrix3x3): OrthogonalMatrix3x3;
  times(other: number | OrthogonalMatrix3x3): OrthogonalMatrix3x3 {
    if (typeof other === "number") {
      return new OrthogonalMatrix3x3(
        this.right.times(other),
        this.up.times(other),
        this.backward.times(other),
      );
    }
    return new OrthogonalMatrix3x3(
      this.transformVector(other.right),
      this.transformVector(other.up),
      this.transformVector(other.backward),
    );
  }

  multiply(other: OrthogonalMatrix3x3): OrthogonalMatrix3x3 {
    return this.times(other);
  }

  transformVector(vector: Vector3Like): Vector3 {
    const source = toMathVector3(vector);
    return new Vector3(
      (this.e11() * source.x) + (this.e12() * source.y) + (this.e13() * source.z),
      (this.e21() * source.x) + (this.e22() * source.y) + (this.e23() * source.z),
      (this.e31() * source.x) + (this.e32() * source.y) + (this.e33() * source.z),
    );
  }

  determinant(): number {
    return (
      (this.e11() * ((this.e22() * this.e33()) - (this.e23() * this.e32()))) -
      (this.e12() * ((this.e21() * this.e33()) - (this.e23() * this.e31()))) +
      (this.e13() * ((this.e21() * this.e32()) - (this.e22() * this.e31())))
    );
  }

  inverse(): OrthogonalMatrix3x3 {
    const a = this.e11();
    const b = this.e12();
    const c = this.e13();
    const d = this.e21();
    const e = this.e22();
    const f = this.e23();
    const g = this.e31();
    const h = this.e32();
    const i = this.e33();
    const determinant = this.determinant();
    if (Math.abs(determinant) <= REASONABLE_EPSILON) {
      throw new Error("Matrix is not invertible");
    }
    return OrthogonalMatrix3x3.fromRowMajorElements(
      ((e * i) - (f * h)) / determinant,
      ((c * h) - (b * i)) / determinant,
      ((b * f) - (c * e)) / determinant,
      ((f * g) - (d * i)) / determinant,
      ((a * i) - (c * g)) / determinant,
      ((c * d) - (a * f)) / determinant,
      ((d * h) - (e * g)) / determinant,
      ((b * g) - (a * h)) / determinant,
      ((a * e) - (b * d)) / determinant,
    );
  }

  normalized(): OrthogonalMatrix3x3 {
    return new OrthogonalMatrix3x3(
      this.right.normalized(),
      this.up.normalized(),
      this.backward.normalized(),
    );
  }

  unitAxes(): OrthogonalMatrix3x3 {
    const xScale = this.right.magnitude();
    const yScale = this.up.magnitude();
    const zScale = this.backward.magnitude();
    return new OrthogonalMatrix3x3(
      xScale === 0 ? Vector3.POSITIVE_X_AXIS : this.right.dividedBy(xScale),
      yScale === 0 ? Vector3.POSITIVE_Y_AXIS : this.up.dividedBy(yScale),
      zScale === 0 ? Vector3.POSITIVE_Z_AXIS : this.backward.dividedBy(zScale),
    );
  }

  withScale(scale: number | Vector3Like): OrthogonalMatrix3x3 {
    const factor = typeof scale === "number"
      ? new Vector3(scale, scale, scale)
      : Vector3.from(scale);
    const basis = this.unitAxes();
    return new OrthogonalMatrix3x3(
      basis.right.times(factor.x),
      basis.up.times(factor.y),
      basis.backward.times(factor.z),
    );
  }

  scaleFactors(): Vector3 {
    return new Vector3(
      this.right.magnitude(),
      this.up.magnitude(),
      this.backward.magnitude(),
    );
  }

  toQuaternion(): THREE.Quaternion {
    const basis = this.unitAxes();
    return new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().fromArray([
        basis.e11(), basis.e21(), basis.e31(), 0,
        basis.e12(), basis.e22(), basis.e32(), 0,
        basis.e13(), basis.e23(), basis.e33(), 0,
        0, 0, 0, 1,
      ]),
    ).normalize();
  }

  e11(): number { return this.right.x; }
  e21(): number { return this.right.y; }
  e31(): number { return this.right.z; }
  e12(): number { return this.up.x; }
  e22(): number { return this.up.y; }
  e32(): number { return this.up.z; }
  e13(): number { return this.backward.x; }
  e23(): number { return this.backward.y; }
  e33(): number { return this.backward.z; }
}

export class AxisRotation {
  static readonly NaN = new AxisRotation(Vector3.NaN, Angle.NaN);
  static readonly IDENTITY = new AxisRotation(Vector3.POSITIVE_X_AXIS, Angle.ZERO);

  constructor(
    public readonly axis: Vector3 = Vector3.POSITIVE_X_AXIS,
    public readonly angle: Angle = Angle.ZERO,
  ) {}

  static createXAxisRotation(angle: Angle | number): AxisRotation {
    return new AxisRotation(Vector3.POSITIVE_X_AXIS, toAngle(angle));
  }

  static createYAxisRotation(angle: Angle | number): AxisRotation {
    return new AxisRotation(Vector3.POSITIVE_Y_AXIS, toAngle(angle));
  }

  static createZAxisRotation(angle: Angle | number): AxisRotation {
    return new AxisRotation(Vector3.POSITIVE_Z_AXIS, toAngle(angle));
  }

  isNaN(): boolean {
    return this.axis.isNaN() || this.angle.isNaN();
  }

  isIdentity(): boolean {
    return this.angle.isZero();
  }

  asMatrix3x3(): OrthogonalMatrix3x3 {
    if (this.isNaN()) {
      return OrthogonalMatrix3x3.NaN;
    }
    const axis = normalizeAxis(this.axis);
    const theta = this.angle.getAsRadians();
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const t = 1 - c;
    const xyt = axis.x * axis.y * t;
    const zs = axis.z * s;
    const xzt = axis.x * axis.z * t;
    const ys = axis.y * s;
    const yzt = axis.y * axis.z * t;
    const xs = axis.x * s;
    const right = new Vector3(c + (axis.x * axis.x * t), xyt + zs, xzt - ys);
    const up = new Vector3(xyt - zs, c + (axis.y * axis.y * t), yzt + xs);
    const backward = new Vector3(xzt + ys, yzt - xs, c + (axis.z * axis.z * t));
    return new OrthogonalMatrix3x3(right, up, backward);
  }
}

registerScaleMatrixFactory((vector) => new OrthogonalMatrix3x3(
  new Vector3(vector.x, 0, 0),
  new Vector3(0, vector.y, 0),
  new Vector3(0, 0, vector.z),
));
