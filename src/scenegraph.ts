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

function cloneBounds(bounds: GeometryBounds): GeometryBounds {
  return {
    min: bounds.min.clone(),
    max: bounds.max.clone(),
  };
}

function combineBounds(boundsList: readonly GeometryBounds[]): GeometryBounds | null {
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

function transformedBounds(bounds: GeometryBounds, matrix: THREE.Matrix4): GeometryBounds {
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

function toVector3(value: Vector3Like): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function toQuaternion(value: QuaternionLike): THREE.Quaternion {
  return new THREE.Quaternion(value.x, value.y, value.z, value.w).normalize();
}

export class AffineMatrix4x4 {
  static readonly IDENTITY = new AffineMatrix4x4();

  private readonly matrix: THREE.Matrix4;

  constructor(matrix?: THREE.Matrix4 | readonly number[]) {
    if (matrix instanceof THREE.Matrix4) {
      this.matrix = matrix.clone();
    } else if (matrix) {
      this.matrix = new THREE.Matrix4().fromArray([...matrix]);
    } else {
      this.matrix = new THREE.Matrix4().identity();
    }
  }

  static createTranslation(x: number, y: number, z: number): AffineMatrix4x4 {
    return new AffineMatrix4x4(new THREE.Matrix4().makeTranslation(x, y, z));
  }

  static createOrientation(quaternion: QuaternionLike): AffineMatrix4x4 {
    return new AffineMatrix4x4(new THREE.Matrix4().makeRotationFromQuaternion(toQuaternion(quaternion)));
  }

  static createWithDiagonal(diagonal: Vector3Like): AffineMatrix4x4 {
    return new AffineMatrix4x4(new THREE.Matrix4().makeScale(diagonal.x, diagonal.y, diagonal.z));
  }

  static compose(
    translation: Vector3Like,
    quaternion: QuaternionLike,
    scale: Vector3Like = { x: 1, y: 1, z: 1 },
  ): AffineMatrix4x4 {
    return new AffineMatrix4x4(
      new THREE.Matrix4().compose(
        toVector3(translation),
        toQuaternion(quaternion),
        toVector3(scale),
      ),
    );
  }

  static fromThreeMatrix(matrix: THREE.Matrix4): AffineMatrix4x4 {
    return new AffineMatrix4x4(matrix);
  }

  static fromColumnMajorArray12(values: readonly number[]): AffineMatrix4x4 {
    if (values.length != 12) {
      throw new TypeError(`expected 12 values, received ${values.length}`);
    }
    return new AffineMatrix4x4([
      values[0], values[1], values[2], 0,
      values[3], values[4], values[5], 0,
      values[6], values[7], values[8], 0,
      values[9], values[10], values[11], 1,
    ]);
  }

  clone(): AffineMatrix4x4 {
    return new AffineMatrix4x4(this.matrix);
  }

  isAffine(): boolean {
    const elements = this.matrix.elements;
    return (
      Math.abs(elements[3]) < 1e-9 &&
      Math.abs(elements[7]) < 1e-9 &&
      Math.abs(elements[11]) < 1e-9 &&
      Math.abs(elements[15] - 1) < 1e-9
    );
  }

  isNaN(): boolean {
    return this.matrix.elements.some((value) => Number.isNaN(value));
  }

  isIdentity(epsilon = 1e-9): boolean {
    return this.isWithinEpsilonOf(AffineMatrix4x4.IDENTITY, epsilon);
  }

  isWithinEpsilonOf(other: AffineMatrix4x4, epsilon = 1e-9): boolean {
    return this.matrix.elements.every(
      (value, index) => Math.abs(value - other.matrix.elements[index]) <= epsilon,
    );
  }

  invert(): AffineMatrix4x4 {
    return new AffineMatrix4x4(this.matrix.clone().invert());
  }

  times(other: AffineMatrix4x4): AffineMatrix4x4 {
    return new AffineMatrix4x4(this.matrix.clone().multiply(other.matrix));
  }

  plusPreservingAffine(other: AffineMatrix4x4): AffineMatrix4x4 {
    const elements = this.matrix.elements.map(
      (value, index) => value + other.matrix.elements[index],
    );
    elements[15] = 1;
    return new AffineMatrix4x4(elements);
  }

  scaleTranslation(scale: number | Vector3Like): AffineMatrix4x4 {
    const factor = typeof scale === "number"
      ? new THREE.Vector3(scale, scale, scale)
      : toVector3(scale);
    const next = this.matrix.clone();
    next.elements[12] *= factor.x;
    next.elements[13] *= factor.y;
    next.elements[14] *= factor.z;
    return new AffineMatrix4x4(next);
  }

  transformPoint(point: Vector3Like): THREE.Vector3 {
    return toVector3(point).applyMatrix4(this.matrix);
  }

  transformVector(vector: Vector3Like): THREE.Vector3 {
    const matrix = new THREE.Matrix3().setFromMatrix4(this.matrix);
    return toVector3(vector).applyMatrix3(matrix);
  }

  toThreeMatrix4(): THREE.Matrix4 {
    return this.matrix.clone();
  }

  toArray(): number[] {
    return [...this.matrix.elements];
  }

  decompose(): {
    translation: THREE.Vector3;
    quaternion: THREE.Quaternion;
    scale: THREE.Vector3;
  } {
    const translation = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    this.matrix.decompose(translation, quaternion, scale);
    return { translation, quaternion, scale };
  }

  get translation(): THREE.Vector3 {
    return this.decompose().translation;
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
    return new THREE.Vector4(this.e41(), this.e42(), this.e43(), this.e44());
  }

  columnRight(): THREE.Vector4 {
    return new THREE.Vector4(this.e11(), this.e21(), this.e31(), this.e41());
  }

  columnUp(): THREE.Vector4 {
    return new THREE.Vector4(this.e12(), this.e22(), this.e32(), this.e42());
  }

  columnBackward(): THREE.Vector4 {
    return new THREE.Vector4(this.e13(), this.e23(), this.e33(), this.e43());
  }

  columnTranslation(): THREE.Vector4 {
    return new THREE.Vector4(this.e14(), this.e24(), this.e34(), this.e44());
  }

  e11(): number { return this.matrix.elements[0]; }
  e21(): number { return this.matrix.elements[1]; }
  e31(): number { return this.matrix.elements[2]; }
  e41(): number { return this.matrix.elements[3]; }
  e12(): number { return this.matrix.elements[4]; }
  e22(): number { return this.matrix.elements[5]; }
  e32(): number { return this.matrix.elements[6]; }
  e42(): number { return this.matrix.elements[7]; }
  e13(): number { return this.matrix.elements[8]; }
  e23(): number { return this.matrix.elements[9]; }
  e33(): number { return this.matrix.elements[10]; }
  e43(): number { return this.matrix.elements[11]; }
  e14(): number { return this.matrix.elements[12]; }
  e24(): number { return this.matrix.elements[13]; }
  e34(): number { return this.matrix.elements[14]; }
  e44(): number { return this.matrix.elements[15]; }
}

let nextComponentId = 0;

export class Component {
  #parent: Composite | null = null;
  readonly id = `sg-${nextComponentId++}`;

  constructor(public name: string) {}

  get parent(): Composite | null {
    return this.#parent;
  }

  setParent(parent: Composite | null): void {
    this.#parent = parent;
  }

  getRoot(): Component {
    let current: Component = this;
    while (current.parent) {
      current = current.parent;
    }
    return current;
  }

  get localAffineMatrix(): AffineMatrix4x4 {
    return AffineMatrix4x4.IDENTITY;
  }

  get absoluteAffineMatrix(): AffineMatrix4x4 {
    return this.parent
      ? this.parent.absoluteAffineMatrix.times(this.localAffineMatrix)
      : this.localAffineMatrix;
  }

  get absoluteMatrix(): THREE.Matrix4 {
    return this.absoluteAffineMatrix.toThreeMatrix4();
  }

  get inverseAbsoluteMatrix(): THREE.Matrix4 {
    return this.absoluteMatrix.clone().invert();
  }

  get inverseAbsoluteAffineMatrix(): AffineMatrix4x4 {
    return this.absoluteAffineMatrix.invert();
  }

  getTransformation(asSeenBy: Component | null): THREE.Matrix4 {
    return this.getAffineTransformation(asSeenBy).toThreeMatrix4();
  }

  getAffineTransformation(asSeenBy: Component | null): AffineMatrix4x4 {
    if (!asSeenBy) {
      return this.absoluteAffineMatrix;
    }
    return asSeenBy.inverseAbsoluteAffineMatrix.times(this.absoluteAffineMatrix);
  }

  isDescendantOf(possibleAncestor: Composite | null): boolean {
    if (!possibleAncestor) {
      return false;
    }
    let current = this.parent;
    while (current) {
      if (current === possibleAncestor) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  toThreeObject(): THREE.Object3D {
    return new THREE.Group();
  }
}

export class Composite extends Component {
  #children: Component[] = [];

  get children(): readonly Component[] {
    return [...this.#children];
  }

  add(child: Component): void {
    if (child === this) {
      throw new Error("Cannot add a component as its own child");
    }
    if (this.isDescendantOf(child as Composite) || child.isDescendantOf(this)) {
      throw new Error("Cannot create a scenegraph cycle");
    }
    if (child.parent) {
      child.parent.remove(child);
    }
    this.#children.push(child);
    child.setParent(this);
  }

  remove(child: Component): boolean {
    const index = this.#children.indexOf(child);
    if (index === -1) {
      return false;
    }
    this.#children.splice(index, 1);
    child.setParent(null);
    return true;
  }

  hasChild(child: Component): boolean {
    return this.#children.includes(child);
  }

  traverse(visitor: (component: Component) => void): void {
    visitor(this);
    for (const child of this.#children) {
      if (child instanceof Composite) {
        child.traverse(visitor);
      } else {
        visitor(child);
      }
    }
  }

  protected populateThreeObject(object: THREE.Object3D): void {
    for (const child of this.#children) {
      object.add(child.toThreeObject());
    }
  }

  override toThreeObject(): THREE.Object3D {
    const group = new THREE.Group();
    group.name = this.name;
    this.populateThreeObject(group);
    return group;
  }
}

export class Transformable extends Composite {
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  readonly scale = new THREE.Vector3(1, 1, 1);

  setTranslation(x: number, y: number, z: number): this {
    this.position.set(x, y, z);
    return this;
  }

  translateBy(x: number, y: number, z: number): this {
    this.position.add(new THREE.Vector3(x, y, z));
    return this;
  }

  setQuaternion(x: number, y: number, z: number, w: number): this {
    this.quaternion.set(x, y, z, w).normalize();
    return this;
  }

  setScale(x: number, y: number, z: number): this {
    this.scale.set(x, y, z);
    return this;
  }

  rotateAroundAxis(axis: Vector3Like, radians: number): this {
    const rotation = new THREE.Quaternion().setFromAxisAngle(toVector3(axis).normalize(), radians);
    this.quaternion.multiply(rotation).normalize();
    return this;
  }

  lookAt(target: Vector3Like): this {
    const matrix = new THREE.Matrix4().lookAt(this.position, toVector3(target), new THREE.Vector3(0, 1, 0));
    this.quaternion.setFromRotationMatrix(matrix);
    return this;
  }

  get localMatrix(): THREE.Matrix4 {
    return new THREE.Matrix4().compose(this.position, this.quaternion, this.scale);
  }

  override get localAffineMatrix(): AffineMatrix4x4 {
    return AffineMatrix4x4.fromThreeMatrix(this.localMatrix);
  }

  protected applyTransform(object: THREE.Object3D): void {
    object.position.copy(this.position);
    object.quaternion.copy(this.quaternion);
    object.scale.copy(this.scale);
  }

  override toThreeObject(): THREE.Object3D {
    const group = new THREE.Group();
    group.name = this.name;
    this.applyTransform(group);
    this.populateThreeObject(group);
    return group;
  }
}

export abstract class Geometry {
  #bounds: GeometryBounds | null = null;

  constructor(public readonly kind: string) {}

  protected abstract computeBounds(): GeometryBounds;

  get bounds(): GeometryBounds {
    if (!this.#bounds) {
      this.#bounds = this.computeBounds();
    }
    return cloneBounds(this.#bounds);
  }

  markDirty(): void {
    this.#bounds = null;
  }

  abstract toThreeGeometry(): THREE.BufferGeometry;
}

export class Box extends Geometry {
  readonly minimum = new THREE.Vector3(-0.5, -0.5, -0.5);
  readonly maximum = new THREE.Vector3(0.5, 0.5, 0.5);

  constructor(width = 1, height = 1, depth = 1) {
    super("box");
    this.setSize(width, height, depth);
  }

  get width(): number {
    return this.maximum.x - this.minimum.x;
  }

  get height(): number {
    return this.maximum.y - this.minimum.y;
  }

  get depth(): number {
    return this.maximum.z - this.minimum.z;
  }

  setSize(width: number, height: number, depth: number): this {
    this.minimum.set(-width / 2, -height / 2, -depth / 2);
    this.maximum.set(width / 2, height / 2, depth / 2);
    this.markDirty();
    return this;
  }

  setMinimum(x: number, y: number, z: number): this {
    this.minimum.set(x, y, z);
    this.markDirty();
    return this;
  }

  setMaximum(x: number, y: number, z: number): this {
    this.maximum.set(x, y, z);
    this.markDirty();
    return this;
  }

  protected override computeBounds(): GeometryBounds {
    return { min: this.minimum.clone(), max: this.maximum.clone() };
  }

  override toThreeGeometry(): THREE.BufferGeometry {
    return new THREE.BoxGeometry(this.width, this.height, this.depth);
  }
}

export class Sphere extends Geometry {
  constructor(public radius = 0.5) {
    super("sphere");
  }

  protected override computeBounds(): GeometryBounds {
    return {
      min: new THREE.Vector3(-this.radius, -this.radius, -this.radius),
      max: new THREE.Vector3(this.radius, this.radius, this.radius),
    };
  }

  override toThreeGeometry(): THREE.BufferGeometry {
    return new THREE.SphereGeometry(this.radius, 24, 16);
  }
}

export type CylinderOriginAlignment = "top" | "center" | "bottom";
export type CylinderBottomToTopAxis =
  | "positiveX"
  | "positiveY"
  | "positiveZ"
  | "negativeX"
  | "negativeY"
  | "negativeZ";

function cylinderAxisVector(axis: CylinderBottomToTopAxis): THREE.Vector3 {
  switch (axis) {
    case "positiveX": return new THREE.Vector3(1, 0, 0);
    case "positiveY": return new THREE.Vector3(0, 1, 0);
    case "positiveZ": return new THREE.Vector3(0, 0, 1);
    case "negativeX": return new THREE.Vector3(-1, 0, 0);
    case "negativeY": return new THREE.Vector3(0, -1, 0);
    case "negativeZ": return new THREE.Vector3(0, 0, -1);
  }
}

export class Cylinder extends Geometry {
  originAlignment: CylinderOriginAlignment = "bottom";
  bottomToTopAxis: CylinderBottomToTopAxis = "positiveY";
  hasBottomCap = true;
  hasTopCap = true;

  constructor(
    public length = 1,
    public bottomRadius = 1,
    public topRadius = 1,
  ) {
    super("cylinder");
  }

  get actualTopRadius(): number {
    return Number.isNaN(this.topRadius) ? this.bottomRadius : this.topRadius;
  }

  private get maxRadius(): number {
    return Math.max(this.bottomRadius, this.actualTopRadius);
  }

  private getTop(): number {
    switch (this.originAlignment) {
      case "bottom": return this.length;
      case "center": return this.length * 0.5;
      case "top": return 0;
    }
  }

  private getBottom(): number {
    switch (this.originAlignment) {
      case "bottom": return 0;
      case "center": return -this.length * 0.5;
      case "top": return -this.length;
    }
  }

  getCenterOfTop(): THREE.Vector3 {
    return this.offsetPoint(this.getTop());
  }

  getCenterOfBottom(): THREE.Vector3 {
    return this.offsetPoint(this.getBottom());
  }

  private offsetPoint(offset: number): THREE.Vector3 {
    return cylinderAxisVector(this.bottomToTopAxis).multiplyScalar(offset);
  }

  protected override computeBounds(): GeometryBounds {
    const top = this.getTop();
    const bottom = this.getBottom();
    const radius = this.maxRadius;
    switch (this.bottomToTopAxis) {
      case "positiveX":
        return { min: new THREE.Vector3(bottom, -radius, -radius), max: new THREE.Vector3(top, radius, radius) };
      case "positiveY":
        return { min: new THREE.Vector3(-radius, bottom, -radius), max: new THREE.Vector3(radius, top, radius) };
      case "positiveZ":
        return { min: new THREE.Vector3(-radius, -radius, bottom), max: new THREE.Vector3(radius, radius, top) };
      case "negativeX":
        return { min: new THREE.Vector3(top, -radius, -radius), max: new THREE.Vector3(bottom, radius, radius) };
      case "negativeY":
        return { min: new THREE.Vector3(-radius, top, -radius), max: new THREE.Vector3(radius, bottom, radius) };
      case "negativeZ":
        return { min: new THREE.Vector3(-radius, -radius, top), max: new THREE.Vector3(radius, radius, bottom) };
    }
  }

  override toThreeGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.CylinderGeometry(
      this.actualTopRadius,
      this.bottomRadius,
      this.length,
      32,
      1,
      !(this.hasBottomCap && this.hasTopCap),
    );
    const axis = cylinderAxisVector(this.bottomToTopAxis).normalize();
    const baseAxis = new THREE.Vector3(0, 1, 0);
    const rotation = new THREE.Quaternion().setFromUnitVectors(baseAxis, axis);
    geometry.applyQuaternion(rotation);
    const centerOffset = this.getTop() - this.length * 0.5;
    geometry.translate(axis.x * centerOffset, axis.y * centerOffset, axis.z * centerOffset);
    return geometry;
  }
}

export type DiscAxis = "x" | "y" | "z";

export class Disc extends Geometry {
  axis: DiscAxis = "y";
  isFrontFaceVisible = true;
  isBackFaceVisible = true;

  constructor(
    public outerRadius = 1,
    public innerRadius = 0,
  ) {
    super("disc");
  }

  protected override computeBounds(): GeometryBounds {
    const radius = this.outerRadius;
    switch (this.axis) {
      case "x": return { min: new THREE.Vector3(0, -radius, -radius), max: new THREE.Vector3(0, radius, radius) };
      case "y": return { min: new THREE.Vector3(-radius, 0, -radius), max: new THREE.Vector3(radius, 0, radius) };
      case "z": return { min: new THREE.Vector3(-radius, -radius, 0), max: new THREE.Vector3(radius, radius, 0) };
    }
  }

  override toThreeGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.RingGeometry(this.innerRadius, this.outerRadius, 32);
    if (this.axis === "x") {
      geometry.rotateZ(Math.PI / 2);
    } else if (this.axis === "y") {
      geometry.rotateX(-Math.PI / 2);
    }
    return geometry;
  }
}

export type TorusCoordinatePlane = "xy" | "xz" | "yz";

export class Torus extends Geometry {
  coordinatePlane: TorusCoordinatePlane = "xz";

  constructor(
    public majorRadius = 0.9,
    public minorRadius = 0.1,
  ) {
    super("torus");
  }

  protected override computeBounds(): GeometryBounds {
    const yesRadius = this.majorRadius + this.minorRadius;
    const noRadius = this.minorRadius;
    switch (this.coordinatePlane) {
      case "xy":
        return { min: new THREE.Vector3(-yesRadius, -yesRadius, -noRadius), max: new THREE.Vector3(yesRadius, yesRadius, noRadius) };
      case "xz":
        return { min: new THREE.Vector3(-yesRadius, -noRadius, -yesRadius), max: new THREE.Vector3(yesRadius, noRadius, yesRadius) };
      case "yz":
        return { min: new THREE.Vector3(-noRadius, -yesRadius, -yesRadius), max: new THREE.Vector3(noRadius, yesRadius, yesRadius) };
    }
  }

  override toThreeGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.TorusGeometry(this.majorRadius, this.minorRadius, 16, 48);
    if (this.coordinatePlane === "xy") {
      geometry.rotateX(Math.PI / 2);
    } else if (this.coordinatePlane === "yz") {
      geometry.rotateY(Math.PI / 2);
    }
    return geometry;
  }
}

export class IndexedTriangleArray extends Geometry {
  readonly vertices: number[];
  readonly indices: number[];
  readonly normals: number[];
  readonly uvs: number[];

  constructor(options: {
    readonly vertices: readonly number[];
    readonly indices: readonly number[];
    readonly normals?: readonly number[];
    readonly uvs?: readonly number[];
  }) {
    super("indexedTriangleArray");
    if (options.indices.length % 3 !== 0) {
      throw new TypeError("IndexedTriangleArray requires triangle indices");
    }
    this.vertices = [...options.vertices];
    this.indices = [...options.indices];
    this.normals = [...(options.normals ?? [])];
    this.uvs = [...(options.uvs ?? [])];
  }

  get indicesPerPolygon(): number {
    return 3;
  }

  protected override computeBounds(): GeometryBounds {
    const points: THREE.Vector3[] = [];
    for (let index = 0; index < this.vertices.length; index += 3) {
      points.push(new THREE.Vector3(this.vertices[index], this.vertices[index + 1], this.vertices[index + 2]));
    }
    const box = new THREE.Box3().setFromPoints(points);
    return { min: box.min.clone(), max: box.max.clone() };
  }

  override toThreeGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.vertices, 3),
    );
    geometry.setIndex(this.indices);
    if (this.normals.length > 0) {
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    } else {
      geometry.computeVertexNormals();
    }
    if (this.uvs.length > 0) {
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    }
    return geometry;
  }
}

export class Mesh extends IndexedTriangleArray {
  textureId = -1;
  textureIdArray: number[] = [];
  cullBackfaces = true;
  useAlphaTest = false;

  constructor(options: ConstructorParameters<typeof IndexedTriangleArray>[0]) {
    super(options);
  }

  createCopy(): Mesh {
    const copy = new Mesh({
      vertices: this.vertices,
      indices: this.indices,
      normals: this.normals,
      uvs: this.uvs,
    });
    copy.textureId = this.textureId;
    copy.textureIdArray = [...this.textureIdArray];
    copy.cullBackfaces = this.cullBackfaces;
    copy.useAlphaTest = this.useAlphaTest;
    return copy;
  }

  transform(matrix: AffineMatrix4x4 | THREE.Matrix4): void {
    const affine = matrix instanceof AffineMatrix4x4 ? matrix.toThreeMatrix4() : matrix.clone();
    for (let index = 0; index < this.vertices.length; index += 3) {
      const point = new THREE.Vector3(
        this.vertices[index],
        this.vertices[index + 1],
        this.vertices[index + 2],
      ).applyMatrix4(affine);
      this.vertices[index] = point.x;
      this.vertices[index + 1] = point.y;
      this.vertices[index + 2] = point.z;
    }
    this.markDirty();
  }

  scale(scale: number): void {
    for (let index = 0; index < this.vertices.length; index += 1) {
      this.vertices[index] *= scale;
    }
    this.markDirty();
  }

  invertNormals(): void {
    for (let index = 0; index < this.normals.length; index += 1) {
      this.normals[index] *= -1;
    }
  }

  invertIndices(): void {
    for (let index = 0; index < this.indices.length; index += 3) {
      const temp = this.indices[index + 1];
      this.indices[index + 1] = this.indices[index + 2];
      this.indices[index + 2] = temp;
    }
  }

  getReferencedTextureIds(): number[] {
    if (this.textureIdArray.length === 0) {
      return this.textureId >= 0 ? [this.textureId] : [];
    }
    return [...new Set(this.textureIdArray)];
  }
}

export class PlaneGeometry extends Geometry {
  constructor(public width: number, public depth: number) {
    super("plane");
  }

  protected override computeBounds(): GeometryBounds {
    return {
      min: new THREE.Vector3(-this.width / 2, 0, -this.depth / 2),
      max: new THREE.Vector3(this.width / 2, 0, this.depth / 2),
    };
  }

  override toThreeGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(this.width, this.depth);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }
}

export abstract class Appearance {
  visible = true;
  abstract toThreeMaterial(side?: THREE.Side): THREE.Material;
}

export class SingleAppearance extends Appearance implements VisualAppearance {
  color = 0xffffff;
  opacity = 1;
  ambientColor: number | null = null;
  fillingStyle: "solid" | "wireframe" = "solid";
  shadingStyle: "smooth" | "flat" = "smooth";
  specularHighlightColor = 0x000000;
  emissiveColor = 0x000000;
  specularHighlightExponent = 0;
  isEthereal = false;

  clone(): SingleAppearance {
    const copy = new SingleAppearance();
    Object.assign(copy, this);
    return copy;
  }

  toThreeMaterial(side = THREE.FrontSide): THREE.Material {
    return new THREE.MeshPhongMaterial({
      color: this.color,
      emissive: this.emissiveColor,
      specular: this.specularHighlightColor,
      shininess: this.specularHighlightExponent,
      opacity: this.opacity,
      transparent: this.opacity < 1 || this.isEthereal,
      wireframe: this.fillingStyle === "wireframe",
      flatShading: this.shadingStyle === "flat",
      side,
      depthWrite: !this.isEthereal,
    });
  }
}

export class TexturedAppearance extends SingleAppearance {
  texture: THREE.Texture | null = null;
  diffuseColorTexture: THREE.Texture | null = null;
  bumpTexture: THREE.Texture | null = null;
  textureId = -1;
  isDiffuseColorTextureAlphaBlended = false;
  isDiffuseColorTextureClamped = false;

  override clone(): TexturedAppearance {
    const copy = new TexturedAppearance();
    Object.assign(copy, this);
    return copy;
  }

  setDiffuseColorTextureAlphaBlended(isDiffuseColorTextureAlphaBlended: boolean): void {
    this.isDiffuseColorTextureAlphaBlended = isDiffuseColorTextureAlphaBlended;
  }

  setDiffuseColorTextureClamped(isDiffuseColorTextureClamped: boolean): void {
    this.isDiffuseColorTextureClamped = isDiffuseColorTextureClamped;
  }

  setDiffuseColorTexture(diffuseColorTexture: THREE.Texture | null): void {
    this.diffuseColorTexture = diffuseColorTexture;
  }

  setDiffuseColorTextureAndInferAlphaBlend(diffuseColorTexture: THREE.Texture | null): void {
    this.diffuseColorTexture = diffuseColorTexture;
    const inferredAlphaBlend = diffuseColorTexture
      ? ((diffuseColorTexture.userData?.isPotentiallyAlphaBlended as boolean | undefined)
          ?? (diffuseColorTexture.format === THREE.RGBAFormat || diffuseColorTexture.format === THREE.AlphaFormat))
      : false;
    this.isDiffuseColorTextureAlphaBlended = inferredAlphaBlend;
  }

  setBumpTexture(bumpTexture: THREE.Texture | null): void {
    this.bumpTexture = bumpTexture;
  }

  override toThreeMaterial(side = THREE.FrontSide): THREE.Material {
    const material = super.toThreeMaterial(side) as THREE.MeshPhongMaterial;
    const texture = this.diffuseColorTexture ?? this.texture;
    if (texture) {
      texture.wrapS = this.isDiffuseColorTextureClamped
        ? THREE.ClampToEdgeWrapping
        : THREE.RepeatWrapping;
      texture.wrapT = texture.wrapS;
      material.map = texture;
    }
    if (this.bumpTexture) {
      material.bumpMap = this.bumpTexture;
    }
    material.transparent = this.isDiffuseColorTextureAlphaBlended || material.transparent;
    return material;
  }
}

export class Visual extends Component {
  readonly geometries: Geometry[] = [];
  frontFacingAppearance: SingleAppearance | TexturedAppearance = new SingleAppearance();
  backFacingAppearance: SingleAppearance | TexturedAppearance | null = null;
  readonly appearance = this.frontFacingAppearance;
  readonly geometryScale = new THREE.Vector3(1, 1, 1);
  isShowing = true;
  isPickable = true;

  addGeometry(geometry: Geometry): void {
    this.geometries.push(geometry);
  }

  clearGeometries(): void {
    this.geometries.length = 0;
  }

  setGeometryScale(x: number, y: number, z: number): this {
    this.geometryScale.set(x, y, z);
    return this;
  }

  get bounds(): GeometryBounds | null {
    const bounds = combineBounds(this.geometries.map((geometry) => geometry.bounds));
    if (!bounds) {
      return null;
    }
    const scaleMatrix = new THREE.Matrix4().makeScale(
      this.geometryScale.x,
      this.geometryScale.y,
      this.geometryScale.z,
    );
    return transformedBounds(bounds, scaleMatrix);
  }

  protected createMesh(geometry: Geometry): THREE.Object3D {
    const threeGeometry = geometry.toThreeGeometry();
    if (this.backFacingAppearance) {
      const group = new THREE.Group();
      const front = new THREE.Mesh(
        threeGeometry,
        this.frontFacingAppearance.toThreeMaterial(THREE.FrontSide),
      );
      const back = new THREE.Mesh(
        threeGeometry.clone(),
        this.backFacingAppearance.toThreeMaterial(THREE.BackSide),
      );
      front.scale.copy(this.geometryScale);
      back.scale.copy(this.geometryScale);
      front.visible = this.isShowing && this.frontFacingAppearance.visible;
      back.visible = this.isShowing && this.backFacingAppearance.visible;
      group.add(front, back);
      return group;
    }
    const mesh = new THREE.Mesh(
      threeGeometry,
      this.frontFacingAppearance.toThreeMaterial(THREE.FrontSide),
    );
    mesh.scale.copy(this.geometryScale);
    mesh.visible = this.isShowing && this.frontFacingAppearance.visible;
    return mesh;
  }

  override toThreeObject(): THREE.Object3D {
    const group = new THREE.Group();
    group.name = this.name;
    for (const geometry of this.geometries) {
      group.add(this.createMesh(geometry));
    }
    return group;
  }
}

export class TextVisual extends Visual {
  constructor(
    name: string,
    public text = "",
    public fontSize = 1,
    public fontFamily = "sans-serif",
    public padding = 0.1,
  ) {
    super(name);
  }

  private textSize(): { width: number; height: number } {
    return {
      width: Math.max(this.fontSize * 0.6 * this.text.length, this.fontSize * 0.5),
      height: this.fontSize * 1.2,
    };
  }

  override get bounds(): GeometryBounds {
    const size = this.textSize();
    return {
      min: new THREE.Vector3(-size.width / 2 - this.padding, -size.height / 2 - this.padding, 0),
      max: new THREE.Vector3(size.width / 2 + this.padding, size.height / 2 + this.padding, 0),
    };
  }

  override toThreeObject(): THREE.Object3D {
    const size = this.textSize();
    const geometry = new THREE.PlaneGeometry(size.width + this.padding * 2, size.height + this.padding * 2);
    const mesh = new THREE.Mesh(
      geometry,
      this.frontFacingAppearance.toThreeMaterial(THREE.DoubleSide),
    );
    mesh.visible = this.isShowing && this.frontFacingAppearance.visible;
    const group = new THREE.Group();
    group.name = this.name;
    group.add(mesh);
    return group;
  }
}

export class Model extends Transformable {
  readonly visual: Visual;

  constructor(name: string, visual?: Visual) {
    super(name);
    this.visual = visual ?? new Visual(`${name}.visual`);
    this.add(this.visual);
  }
}

export class Background {
  constructor(public color = 0xffffff) {}
}

export abstract class Light extends Transformable {
  constructor(
    name: string,
    public color = 0xffffff,
    public brightness = 1,
  ) {
    super(name);
  }

  abstract override toThreeObject(): THREE.Object3D;
}

export class AmbientLight extends Light {
  constructor(name = "ambientLight", color = 0xffffff, brightness = 1) {
    super(name, color, brightness);
  }

  override toThreeObject(): THREE.Object3D {
    const light = new THREE.AmbientLight(this.color, this.brightness);
    light.name = this.name;
    return light;
  }
}

export class DirectionalLight extends Light {
  constructor(name = "directionalLight", color = 0xffffff, brightness = 1) {
    super(name, color, brightness);
  }

  override toThreeObject(): THREE.Object3D {
    const group = new THREE.Group();
    group.name = this.name;
    this.applyTransform(group);
    const light = new THREE.DirectionalLight(this.color, this.brightness);
    const target = new THREE.Object3D();
    target.position.set(0, 0, -1);
    light.target = target;
    group.add(light, target);
    return group;
  }
}

export class PointLight extends Light {
  constantAttenuation = 1;
  linearAttenuation = 0;
  quadraticAttenuation = 0;

  constructor(name = "pointLight", color = 0xffffff, brightness = 1) {
    super(name, color, brightness);
  }

  protected createPointLight(): THREE.PointLight {
    const decay = this.quadraticAttenuation > 0 ? 2 : this.linearAttenuation > 0 ? 1 : 0;
    return new THREE.PointLight(this.color, this.brightness, 0, decay);
  }

  override toThreeObject(): THREE.Object3D {
    const light = this.createPointLight();
    light.name = this.name;
    light.position.copy(this.position);
    return light;
  }
}

export class SpotLight extends PointLight {
  innerBeamAngle = 0.4;
  outerBeamAngle = 0.5;
  falloff = 1;

  constructor(name = "spotLight", color = 0xffffff, brightness = 1) {
    super(name, color, brightness);
  }

  override toThreeObject(): THREE.Object3D {
    const group = new THREE.Group();
    group.name = this.name;
    this.applyTransform(group);
    const light = new THREE.SpotLight(this.color, this.brightness);
    light.angle = this.outerBeamAngle;
    light.penumbra = Math.max(0, Math.min(1, 1 - this.innerBeamAngle / this.outerBeamAngle));
    light.decay = this.falloff;
    const target = new THREE.Object3D();
    target.position.set(0, 0, -1);
    light.target = target;
    group.add(light, target);
    return group;
  }
}

export abstract class AbstractCamera extends Transformable {
  background: Background | null = null;
  readonly postRenderLayers: string[] = [];

  getMovableParent(): Transformable | null {
    return this.parent instanceof Transformable ? this.parent : null;
  }

  abstract toThreeCamera(): THREE.Camera;
}

export abstract class AbstractNearPlaneAndFarPlaneCamera extends AbstractCamera {
  nearClippingPlaneDistance = 0.125;
  farClippingPlaneDistance = 256;
}

export class SymmetricPerspectiveCamera extends AbstractNearPlaneAndFarPlaneCamera {
  static readonly DEFAULT_VERTICAL_VIEW_ANGLE = 0.5;
  static readonly DEFAULT_WIDTH_TO_HEIGHT_RATIO = 16 / 9;

  verticalViewingAngle = SymmetricPerspectiveCamera.DEFAULT_VERTICAL_VIEW_ANGLE;
  horizontalViewingAngle = Number.NaN;
  widthToHeightRatio = SymmetricPerspectiveCamera.DEFAULT_WIDTH_TO_HEIGHT_RATIO;

  get effectiveVerticalViewingAngle(): number {
    return Number.isNaN(this.horizontalViewingAngle)
      ? this.verticalViewingAngle
      : 2 * Math.atan(Math.tan(this.horizontalViewingAngle / 2) / this.widthToHeightRatio);
  }

  get effectiveHorizontalViewingAngle(): number {
    return Number.isNaN(this.horizontalViewingAngle)
      ? 2 * Math.atan(Math.tan(this.verticalViewingAngle / 2) * this.widthToHeightRatio)
      : this.horizontalViewingAngle;
  }

  toThreeCamera(): THREE.PerspectiveCamera {
    const fovDegrees = THREE.MathUtils.radToDeg(this.effectiveVerticalViewingAngle);
    const camera = new THREE.PerspectiveCamera(
      fovDegrees,
      this.widthToHeightRatio,
      this.nearClippingPlaneDistance,
      this.farClippingPlaneDistance,
    );
    camera.position.copy(this.position);
    camera.quaternion.copy(this.quaternion);
    camera.scale.copy(this.scale);
    return camera;
  }
}

export class OrthographicCamera extends AbstractNearPlaneAndFarPlaneCamera {
  picturePlane = { left: -1, right: 1, top: 1, bottom: -1 };

  toThreeCamera(): THREE.OrthographicCamera {
    const camera = new THREE.OrthographicCamera(
      this.picturePlane.left,
      this.picturePlane.right,
      this.picturePlane.top,
      this.picturePlane.bottom,
      this.nearClippingPlaneDistance,
      this.farClippingPlaneDistance,
    );
    camera.position.copy(this.position);
    camera.quaternion.copy(this.quaternion);
    camera.scale.copy(this.scale);
    return camera;
  }
}

export class Scene extends Composite {
  background: Background | null = null;
  globalBrightness = 1;

  override get absoluteAffineMatrix(): AffineMatrix4x4 {
    return AffineMatrix4x4.IDENTITY;
  }

  override get absoluteMatrix(): THREE.Matrix4 {
    return new THREE.Matrix4().identity();
  }

  override get inverseAbsoluteMatrix(): THREE.Matrix4 {
    return new THREE.Matrix4().identity();
  }

  isSceneOf(other: Component): boolean {
    return other.getRoot() === this;
  }

  toThreeScene(): THREE.Scene {
    const scene = new THREE.Scene();
    scene.name = this.name;
    if (this.background) {
      scene.background = new THREE.Color(this.background.color);
    }
    this.populateThreeObject(scene);
    return scene;
  }

  override toThreeObject(): THREE.Object3D {
    return this.toThreeScene();
  }
}

export interface ModelDescriptor {
  name: string;
  geometry: Geometry;
  color: number;
  position?: { x: number; y: number; z: number } | null;
  orientation?: { x: number; y: number; z: number; w: number } | null;
}

export function createModel(descriptor: ModelDescriptor): Model {
  const model = new Model(descriptor.name);
  model.visual.frontFacingAppearance.color = descriptor.color;
  model.visual.addGeometry(descriptor.geometry);
  if (descriptor.position) {
    model.setTranslation(
      descriptor.position.x,
      descriptor.position.y,
      descriptor.position.z,
    );
  }
  if (descriptor.orientation) {
    model.setQuaternion(
      descriptor.orientation.x,
      descriptor.orientation.y,
      descriptor.orientation.z,
      descriptor.orientation.w,
    );
  }
  return model;
}

export { Box as BoxGeometry, Sphere as SphereGeometry };
