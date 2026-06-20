/**
 * Renderer Adapters — bridge between Alice scene graph nodes and Three.js rendering.
 * Mirrors Java's 77 GlrXxx adapter classes in core/glrender/imp/adapters/.
 */

// ── Adapter Base ───────────────────────────────────────────────────

export interface SceneGraphNode {
  id: string;
  type: string;
  children?: SceneGraphNode[];
}

export abstract class RenderAdapter<T extends SceneGraphNode = SceneGraphNode> {
  protected node: T;
  private _dirty = true;

  constructor(node: T) { this.node = node; }

  get isDirty() { return this._dirty; }
  markDirty() { this._dirty = true; }
  markClean() { this._dirty = false; }

  abstract update(): void;
  abstract dispose(): void;
}

export abstract class ResourceFreeRenderAdapter<T extends SceneGraphNode = SceneGraphNode> extends RenderAdapter<T> {
  readonly ownsDisposableResources = false;

  dispose(): void {
    // Resource-free adapters only cache scalar scene parameters.
  }
}

// ── Adapter Factory ────────────────────────────────────────────────

type AdapterConstructor = new (node: SceneGraphNode) => RenderAdapter;

export class AdapterFactory {
  private static registry = new Map<string, AdapterConstructor>();
  private static instances = new Map<string, RenderAdapter>();

  static register(type: string, ctor: AdapterConstructor) {
    this.registry.set(type, ctor);
  }

  static create(node: SceneGraphNode): RenderAdapter | null {
    const ctor = this.registry.get(node.type);
    if (!ctor) return null;
    const adapter = new ctor(node);
    this.instances.set(node.id, adapter);
    return adapter;
  }

  static get(nodeId: string): RenderAdapter | null {
    return this.instances.get(nodeId) ?? null;
  }

  static dispose(nodeId: string) {
    const adapter = this.instances.get(nodeId);
    if (adapter) {
      adapter.dispose();
      this.instances.delete(nodeId);
    }
  }

  static forgetAll() {
    for (const adapter of this.instances.values()) adapter.dispose();
    this.instances.clear();
  }

  static get registeredTypes() { return Array.from(this.registry.keys()); }
  static get instanceCount() { return this.instances.size; }
}

// ── Geometry Adapters ──────────────────────────────────────────────

export interface BoxParams { width: number; height: number; depth: number; }
export interface SphereParams { radius: number; widthSegments: number; heightSegments: number; }
export interface CylinderParams { radiusTop: number; radiusBottom: number; height: number; segments: number; }
export interface DiscParams { innerRadius: number; outerRadius: number; segments: number; }
export interface TorusParams { radius: number; tube: number; radialSegments: number; tubularSegments: number; }

export class BoxAdapter extends ResourceFreeRenderAdapter {
  params: BoxParams;
  constructor(node: SceneGraphNode) {
    super(node);
    this.params = { width: 1, height: 1, depth: 1 };
  }
  update() { this.markClean(); }

  get volume() { return this.params.width * this.params.height * this.params.depth; }
  get surfaceArea() {
    const { width: w, height: h, depth: d } = this.params;
    return 2 * (w * h + h * d + w * d);
  }
}

export class SphereAdapter extends ResourceFreeRenderAdapter {
  params: SphereParams;
  constructor(node: SceneGraphNode) {
    super(node);
    this.params = { radius: 0.5, widthSegments: 32, heightSegments: 16 };
  }
  update() { this.markClean(); }

  get volume() { return (4 / 3) * Math.PI * this.params.radius ** 3; }
  get surfaceArea() { return 4 * Math.PI * this.params.radius ** 2; }
  get vertexCount() { return (this.params.widthSegments + 1) * (this.params.heightSegments + 1); }
}

export class CylinderAdapter extends ResourceFreeRenderAdapter {
  params: CylinderParams;
  constructor(node: SceneGraphNode) {
    super(node);
    this.params = { radiusTop: 0.5, radiusBottom: 0.5, height: 1, segments: 32 };
  }
  update() { this.markClean(); }

  get volume() {
    const { radiusTop: rt, radiusBottom: rb, height: h } = this.params;
    return (Math.PI * h / 3) * (rt * rt + rb * rb + rt * rb);
  }
}

export class DiscAdapter extends ResourceFreeRenderAdapter {
  params: DiscParams;
  constructor(node: SceneGraphNode) {
    super(node);
    this.params = { innerRadius: 0, outerRadius: 0.5, segments: 32 };
  }
  update() { this.markClean(); }

  get area() {
    return Math.PI * (this.params.outerRadius ** 2 - this.params.innerRadius ** 2);
  }
}

export class TorusAdapter extends ResourceFreeRenderAdapter {
  params: TorusParams;
  constructor(node: SceneGraphNode) {
    super(node);
    this.params = { radius: 1, tube: 0.4, radialSegments: 16, tubularSegments: 48 };
  }
  update() { this.markClean(); }

  get volume() {
    return 2 * Math.PI * Math.PI * this.params.radius * this.params.tube ** 2;
  }
  get surfaceArea() {
    return 4 * Math.PI * Math.PI * this.params.radius * this.params.tube;
  }
}

// ── Visual Adapter ─────────────────────────────────────────────────

export interface AppearanceParams {
  diffuseColor: { r: number; g: number; b: number };
  opacity: number;
  specularHighlightExponent: number;
  emissiveColor: { r: number; g: number; b: number };
  textureId?: string;
  isTwoSided: boolean;
}

export const DEFAULT_APPEARANCE: AppearanceParams = {
  diffuseColor: { r: 1, g: 1, b: 1 },
  opacity: 1,
  specularHighlightExponent: 50,
  emissiveColor: { r: 0, g: 0, b: 0 },
  isTwoSided: false,
};

export class VisualAdapter extends RenderAdapter {
  appearance: AppearanceParams;
  geometryAdapter: RenderAdapter | null = null;
  readonly ownsDisposableResources = true;
  visible = true;

  constructor(node: SceneGraphNode) {
    super(node);
    this.appearance = { ...DEFAULT_APPEARANCE };
  }

  update() {
    if (this.geometryAdapter?.isDirty) this.geometryAdapter.update();
    this.markClean();
  }

  dispose() {
    this.geometryAdapter?.dispose();
    this.geometryAdapter = null;
  }

  get isTransparent() { return this.appearance.opacity < 1; }
  get isEmissive() {
    const { r, g, b } = this.appearance.emissiveColor;
    return r > 0 || g > 0 || b > 0;
  }
}

// ── Light Adapters ─────────────────────────────────────────────────

export interface LightParams {
  color: { r: number; g: number; b: number };
  intensity: number;
}

export class AmbientLightAdapter extends ResourceFreeRenderAdapter {
  params: LightParams;
  constructor(node: SceneGraphNode) {
    super(node);
    this.params = { color: { r: 1, g: 1, b: 1 }, intensity: 0.5 };
  }
  update() { this.markClean(); }
}

export class DirectionalLightAdapter extends ResourceFreeRenderAdapter {
  params: LightParams & { direction: { x: number; y: number; z: number } };
  constructor(node: SceneGraphNode) {
    super(node);
    this.params = { color: { r: 1, g: 1, b: 1 }, intensity: 1, direction: { x: 0, y: -1, z: 0 } };
  }
  update() { this.markClean(); }
}

export class SpotLightAdapter extends ResourceFreeRenderAdapter {
  params: LightParams & { angle: number; penumbra: number; distance: number };
  constructor(node: SceneGraphNode) {
    super(node);
    this.params = { color: { r: 1, g: 1, b: 1 }, intensity: 1, angle: Math.PI / 4, penumbra: 0.1, distance: 100 };
  }
  update() { this.markClean(); }

  get coneRadius() { return Math.tan(this.params.angle) * this.params.distance; }
}

// ── Camera Adapter ─────────────────────────────────────────────────

export class CameraAdapter extends ResourceFreeRenderAdapter {
  fov = 50;
  near = 0.1;
  far = 1000;
  aspect = 16 / 9;
  constructor(node: SceneGraphNode) { super(node); }
  update() { this.markClean(); }

  get projectionMatrix(): number[] {
    const f = 1 / Math.tan((this.fov * Math.PI / 180) / 2);
    const rangeInv = 1 / (this.near - this.far);
    return [
      f / this.aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (this.near + this.far) * rangeInv, -1,
      0, 0, 2 * this.near * this.far * rangeInv, 0,
    ];
  }

  screenToRay(nx: number, ny: number): { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } } {
    const halfFov = (this.fov * Math.PI / 180) / 2;
    const dx = (2 * nx - 1) * Math.tan(halfFov) * this.aspect;
    const dy = (1 - 2 * ny) * Math.tan(halfFov);
    const len = Math.sqrt(dx * dx + dy * dy + 1);
    return {
      origin: { x: 0, y: 0, z: 0 },
      direction: { x: dx / len, y: dy / len, z: -1 / len },
    };
  }
}

// ── Scene Adapter ──────────────────────────────────────────────────

export class SceneAdapter extends RenderAdapter {
  backgroundColor = { r: 0.8, g: 0.9, b: 1.0 };
  ambientLightIntensity = 0.3;
  readonly ownsDisposableResources = true;
  private childAdapters: RenderAdapter[] = [];

  constructor(node: SceneGraphNode) { super(node); }

  addChild(adapter: RenderAdapter) { this.childAdapters.push(adapter); }
  removeChild(adapter: RenderAdapter) {
    this.childAdapters = this.childAdapters.filter(a => a !== adapter);
  }
  get children() { return [...this.childAdapters]; }
  get childCount() { return this.childAdapters.length; }

  update() {
    for (const child of this.childAdapters) {
      if (child.isDirty) child.update();
    }
    this.markClean();
  }

  dispose() {
    for (const child of this.childAdapters) child.dispose();
    this.childAdapters = [];
  }
}
