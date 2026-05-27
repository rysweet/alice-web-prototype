import * as THREE from "three";
import { AffineMatrix4x4 } from "./scenegraph-math-affine";
import { AxisRotation, OrthogonalMatrix3x3 } from "./scenegraph-math-orientation";
import { QuaternionLike, Vector3Like, toVector3 } from "./scenegraph-math-primitives";
import { Angle, Point3, Vector3, normalizeAxis } from "./scenegraph-math-vectors";

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

  getWorldTransform(): AffineMatrix4x4 {
    const chain: AffineMatrix4x4[] = [];
    let current: Component | null = this;
    while (current) {
      chain.push(current.localAffineMatrix);
      current = current.parent;
    }
    let world = AffineMatrix4x4.IDENTITY;
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      world = world.multiply(chain[index]);
    }
    return world;
  }

  get absoluteAffineMatrix(): AffineMatrix4x4 {
    return this.getWorldTransform();
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
    return asSeenBy.inverseAbsoluteAffineMatrix.multiply(this.absoluteAffineMatrix);
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
  localTransform = AffineMatrix4x4.IDENTITY;

  get position(): THREE.Vector3 {
    return this.localTransform.translation.toThreeVector3();
  }

  get quaternion(): THREE.Quaternion {
    return this.localTransform.quaternion;
  }

  get scale(): THREE.Vector3 {
    return this.localTransform.scale;
  }

  setTranslation(x: number, y: number, z: number): this {
    this.localTransform = this.localTransform.withTranslation(new Point3(x, y, z));
    return this;
  }

  translateBy(x: number, y: number, z: number): this {
    this.localTransform = this.localTransform.withTranslation(
      this.localTransform.translation.plus(new Vector3(x, y, z)),
    );
    return this;
  }

  setQuaternion(x: number, y: number, z: number, w: number): this {
    const scale = Vector3.from(this.localTransform.scale);
    const orientation = OrthogonalMatrix3x3.fromQuaternion({ x, y, z, w }).withScale(scale);
    this.localTransform = new AffineMatrix4x4(orientation, this.localTransform.translation);
    return this;
  }

  setScale(x: number, y: number, z: number): this {
    const orientation = this.localTransform.orientation.withScale(new Vector3(x, y, z));
    this.localTransform = new AffineMatrix4x4(orientation, this.localTransform.translation);
    return this;
  }

  applyRotation(rotation: AxisRotation | QuaternionLike | OrthogonalMatrix3x3): this {
    this.localTransform = this.localTransform.multiply(AffineMatrix4x4.createOrientation(rotation));
    return this;
  }

  rotateAroundAxis(axis: Vector3Like, radians: number): this {
    return this.applyRotation(new AxisRotation(normalizeAxis(axis), Angle.fromRadians(radians)));
  }

  lookAt(target: Vector3Like): this {
    const matrix = new THREE.Matrix4().lookAt(this.position, toVector3(target), new THREE.Vector3(0, 1, 0));
    const orientation = AffineMatrix4x4.fromThreeMatrix(matrix).orientation.withScale(Vector3.from(this.scale));
    this.localTransform = new AffineMatrix4x4(orientation, this.localTransform.translation);
    return this;
  }

  get localMatrix(): THREE.Matrix4 {
    return this.localTransform.toThreeMatrix4();
  }

  override get localAffineMatrix(): AffineMatrix4x4 {
    return this.localTransform;
  }

  protected applyTransform(object: THREE.Object3D): void {
    const { translation, quaternion, scale } = this.localTransform.decompose();
    object.position.copy(translation);
    object.quaternion.copy(quaternion);
    object.scale.copy(scale);
  }

  override toThreeObject(): THREE.Object3D {
    const group = new THREE.Group();
    group.name = this.name;
    this.applyTransform(group);
    this.populateThreeObject(group);
    return group;
  }
}
