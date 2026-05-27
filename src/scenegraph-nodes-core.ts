import * as THREE from "three";
import { SingleAppearance, TexturedAppearance } from "./scenegraph-geometry-appearance";
import { Box, Geometry, Sphere } from "./scenegraph-geometry-primitives";
import { AffineMatrix4x4 } from "./scenegraph-math-affine";
import { GeometryBounds, combineBounds, transformedBounds } from "./scenegraph-math-primitives";
import { Component, Composite, Transformable } from "./scenegraph-transforms-core";

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
