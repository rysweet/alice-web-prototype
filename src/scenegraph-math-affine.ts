import * as THREE from "three";
import { AxisRotation, OrthogonalMatrix3x3 } from "./scenegraph-math-orientation";
import { QuaternionLike, REASONABLE_EPSILON, Vector3Like } from "./scenegraph-math-primitives";
import { Angle, Point3, Vector3 } from "./scenegraph-math-vectors";

export class AffineMatrix4x4 {
  static readonly IDENTITY = new AffineMatrix4x4();

  constructor(
    public readonly orientation: OrthogonalMatrix3x3 = OrthogonalMatrix3x3.IDENTITY,
    public readonly translation: Point3 = Point3.ORIGIN,
  ) {}

  static fromTranslation(x: number, y: number, z: number): AffineMatrix4x4 {
    return new AffineMatrix4x4(OrthogonalMatrix3x3.IDENTITY, new Point3(x, y, z));
  }

  static createTranslation(x: number, y: number, z: number): AffineMatrix4x4 {
    return AffineMatrix4x4.fromTranslation(x, y, z);
  }

  static createOrientation(orientation: QuaternionLike | AxisRotation | OrthogonalMatrix3x3): AffineMatrix4x4 {
    const matrix = orientation instanceof OrthogonalMatrix3x3
      ? orientation
      : orientation instanceof AxisRotation
        ? orientation.asMatrix3x3()
        : OrthogonalMatrix3x3.fromQuaternion(orientation);
    return new AffineMatrix4x4(matrix, Point3.ORIGIN);
  }

  static fromScale(scale: number | Vector3Like): AffineMatrix4x4 {
    const diagonal = typeof scale === "number"
      ? new Vector3(scale, scale, scale)
      : Vector3.from(scale);
    return new AffineMatrix4x4(diagonal.asScaleMatrix(), Point3.ORIGIN);
  }

  static createWithDiagonal(diagonal: Vector3Like): AffineMatrix4x4 {
    return new AffineMatrix4x4(Vector3.from(diagonal).asScaleMatrix(), Point3.ORIGIN);
  }

  static fromAxisAngle(axis: Vector3Like, angle: Angle | number): AffineMatrix4x4 {
    return AffineMatrix4x4.createOrientation(OrthogonalMatrix3x3.fromAxisAngle(axis, angle));
  }

  static fromEulerAngles(pitch: Angle | number, yaw: Angle | number, roll: Angle | number): AffineMatrix4x4 {
    return AffineMatrix4x4.createOrientation(OrthogonalMatrix3x3.fromEulerAngles(pitch, yaw, roll));
  }

  static fromRotationX(radians: number): AffineMatrix4x4 {
    return AffineMatrix4x4.createOrientation(AxisRotation.createXAxisRotation(radians));
  }

  static fromRotationY(radians: number): AffineMatrix4x4 {
    return AffineMatrix4x4.createOrientation(AxisRotation.createYAxisRotation(radians));
  }

  static fromRotationZ(radians: number): AffineMatrix4x4 {
    return AffineMatrix4x4.createOrientation(AxisRotation.createZAxisRotation(radians));
  }

  static compose(
    translation: Vector3Like,
    rotation: QuaternionLike | AxisRotation | OrthogonalMatrix3x3,
    scale: number | Vector3Like = 1,
  ): AffineMatrix4x4 {
    const factor = typeof scale === "number"
      ? new Vector3(scale, scale, scale)
      : Vector3.from(scale);
    const orientation = rotation instanceof OrthogonalMatrix3x3
      ? rotation.withScale(factor)
      : rotation instanceof AxisRotation
        ? rotation.asMatrix3x3().withScale(factor)
        : OrthogonalMatrix3x3.fromQuaternion(rotation).withScale(factor);
    return new AffineMatrix4x4(orientation, Point3.from(translation));
  }

  static fromThreeMatrix(matrix: THREE.Matrix4): AffineMatrix4x4 {
    const elements = matrix.elements;
    return new AffineMatrix4x4(
      new OrthogonalMatrix3x3(
        new Vector3(elements[0], elements[1], elements[2]),
        new Vector3(elements[4], elements[5], elements[6]),
        new Vector3(elements[8], elements[9], elements[10]),
      ),
      new Point3(elements[12], elements[13], elements[14]),
    );
  }

  static fromColumnMajorArray12(values: readonly number[]): AffineMatrix4x4 {
    if (values.length !== 12) {
      throw new TypeError(`expected 12 values, received ${values.length}`);
    }
    return new AffineMatrix4x4(
      new OrthogonalMatrix3x3(
        new Vector3(values[0], values[1], values[2]),
        new Vector3(values[3], values[4], values[5]),
        new Vector3(values[6], values[7], values[8]),
      ),
      new Point3(values[9], values[10], values[11]),
    );
  }

  clone(): AffineMatrix4x4 {
    return new AffineMatrix4x4(this.orientation, this.translation);
  }

  isAffine(): boolean {
    return true;
  }

  isNaN(): boolean {
    return this.orientation.isNaN() || this.translation.isNaN();
  }

  isIdentity(epsilon = REASONABLE_EPSILON): boolean {
    return this.isWithinEpsilonOf(AffineMatrix4x4.IDENTITY, epsilon);
  }

  isWithinEpsilonOf(other: AffineMatrix4x4, epsilon = REASONABLE_EPSILON): boolean {
    return (
      this.orientation.isWithinEpsilonOf(other.orientation, epsilon) &&
      this.translation.isWithinEpsilonOf(other.translation, epsilon)
    );
  }

  invert(): AffineMatrix4x4 {
    const inverseOrientation = this.orientation.inverse();
    const inverseTranslation = inverseOrientation.transformVector(this.translation.asVector()).negate().asPoint();
    return new AffineMatrix4x4(inverseOrientation, inverseTranslation);
  }

  times(other: AffineMatrix4x4): AffineMatrix4x4 {
    return new AffineMatrix4x4(
      this.orientation.times(other.orientation),
      this.transformPoint(other.translation),
    );
  }

  multiply(other: AffineMatrix4x4): AffineMatrix4x4 {
    return this.times(other);
  }

  plusPreservingAffine(other: AffineMatrix4x4): AffineMatrix4x4 {
    if (this.isNaN()) {
      return other;
    }
    return new AffineMatrix4x4(
      this.orientation.plus(other.orientation),
      this.translation.plus(other.translation.asVector()),
    );
  }

  scaleTranslation(scale: number | Vector3Like): AffineMatrix4x4 {
    const factor = typeof scale === "number"
      ? new Vector3(scale, scale, scale)
      : Vector3.from(scale);
    return new AffineMatrix4x4(
      this.orientation,
      new Point3(
        this.translation.x * factor.x,
        this.translation.y * factor.y,
        this.translation.z * factor.z,
      ),
    );
  }

  transformPoint(point: Vector3Like): Point3 {
    const transformed = this.orientation.transformVector(point);
    return new Point3(
      transformed.x + this.translation.x,
      transformed.y + this.translation.y,
      transformed.z + this.translation.z,
    );
  }

  transformVector(vector: Vector3Like): Vector3 {
    return this.orientation.transformVector(vector);
  }

  toThreeMatrix4(): THREE.Matrix4 {
    return new THREE.Matrix4().fromArray([
      this.e11(), this.e21(), this.e31(), 0,
      this.e12(), this.e22(), this.e32(), 0,
      this.e13(), this.e23(), this.e33(), 0,
      this.e14(), this.e24(), this.e34(), 1,
    ]);
  }

  toArray(): number[] {
    return [...this.toThreeMatrix4().elements];
  }

  decompose(): {
    translation: THREE.Vector3;
    quaternion: THREE.Quaternion;
    scale: THREE.Vector3;
  } {
    return {
      translation: this.translation.toThreeVector3(),
      quaternion: this.orientation.toQuaternion(),
      scale: this.orientation.scaleFactors().toThreeVector3(),
    };
  }

  get quaternion(): THREE.Quaternion {
    return this.decompose().quaternion;
  }

  get scale(): THREE.Vector3 {
    return this.decompose().scale;
  }

  rowX(): THREE.Vector4 {
    return new THREE.Vector4(this.e11(), this.e12(), this.e13(), this.e14());
  }

  rowY(): THREE.Vector4 {
    return new THREE.Vector4(this.e21(), this.e22(), this.e23(), this.e24());
  }

  rowZ(): THREE.Vector4 {
    return new THREE.Vector4(this.e31(), this.e32(), this.e33(), this.e34());
  }

  rowW(): THREE.Vector4 {
    return new THREE.Vector4(0, 0, 0, 1);
  }

  columnRight(): THREE.Vector4 {
    return new THREE.Vector4(this.e11(), this.e21(), this.e31(), 0);
  }

  columnUp(): THREE.Vector4 {
    return new THREE.Vector4(this.e12(), this.e22(), this.e32(), 0);
  }

  columnBackward(): THREE.Vector4 {
    return new THREE.Vector4(this.e13(), this.e23(), this.e33(), 0);
  }

  columnTranslation(): THREE.Vector4 {
    return new THREE.Vector4(this.e14(), this.e24(), this.e34(), 1);
  }

  withTranslation(newTranslation: Vector3Like): AffineMatrix4x4 {
    return new AffineMatrix4x4(this.orientation, Point3.from(newTranslation));
  }

  withOrientation(newOrientation: OrthogonalMatrix3x3): AffineMatrix4x4 {
    return new AffineMatrix4x4(newOrientation, this.translation);
  }

  rotateAboutXAxis(angle: Angle | number): AffineMatrix4x4 {
    return this.times(AffineMatrix4x4.createOrientation(AxisRotation.createXAxisRotation(angle)));
  }

  rotateAboutYAxis(angle: Angle | number): AffineMatrix4x4 {
    return this.times(AffineMatrix4x4.createOrientation(AxisRotation.createYAxisRotation(angle)));
  }

  e11(): number { return this.orientation.right.x; }
  e21(): number { return this.orientation.right.y; }
  e31(): number { return this.orientation.right.z; }
  e41(): number { return 0; }
  e12(): number { return this.orientation.up.x; }
  e22(): number { return this.orientation.up.y; }
  e32(): number { return this.orientation.up.z; }
  e42(): number { return 0; }
  e13(): number { return this.orientation.backward.x; }
  e23(): number { return this.orientation.backward.y; }
  e33(): number { return this.orientation.backward.z; }
  e43(): number { return 0; }
  e14(): number { return this.translation.x; }
  e24(): number { return this.translation.y; }
  e34(): number { return this.translation.z; }
  e44(): number { return 1; }
}
