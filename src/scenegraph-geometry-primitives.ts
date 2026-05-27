import * as THREE from "three";
import { AffineMatrix4x4 } from "./scenegraph-math-affine";
import { GeometryBounds, cloneBounds } from "./scenegraph-math-primitives";

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
