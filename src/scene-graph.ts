/**
 * Scene Graph — Composite hierarchy with transform operations.
 *
 * TypeScript port of Java Alice's core/scenegraph. Provides a tree of typed
 * nodes (GroupNode, VisualNode, CameraNode, LightNode) with local transforms
 * and parent-chain world-transform computation. Renderer-agnostic.
 */

import type { Vec3, Orientation } from './story-api/types';

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export interface Transform {
  readonly position: Vec3;
  readonly orientation: Orientation;
  readonly scale: Vec3;
}

export interface Color3 {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export type LightType = 'ambient' | 'directional' | 'point';

// ---------------------------------------------------------------------------
// Module-level ID counter (never reset)
// ---------------------------------------------------------------------------

let nextNodeId = 0;

// ---------------------------------------------------------------------------
// Quaternion math utilities
// ---------------------------------------------------------------------------

export const quaternionIdentity: Orientation = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

export function quaternionFromAxisAngle(axis: Vec3, angle: number): Orientation {
  const half = angle / 2;
  const s = Math.sin(half);
  return {
    x: axis.x * s,
    y: axis.y * s,
    z: axis.z * s,
    w: Math.cos(half),
  };
}

export function quaternionToAxisAngle(q: Orientation): { axis: Vec3; angle: number } {
  const sinSqr = q.x * q.x + q.y * q.y + q.z * q.z;
  if (sinSqr < 1e-10) {
    return { axis: { x: 0, y: 1, z: 0 }, angle: 0 };
  }
  const sinHalf = Math.sqrt(sinSqr);
  const angle = 2 * Math.atan2(sinHalf, q.w);
  return {
    axis: { x: q.x / sinHalf, y: q.y / sinHalf, z: q.z / sinHalf },
    angle,
  };
}

/** Compose two quaternions: parent × child (parent-first order). */
export function quaternionMultiply(a: Orientation, b: Orientation): Orientation {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** Rotate a Vec3 by a unit quaternion. */
export function rotateVec3ByQuaternion(v: Vec3, q: Orientation): Vec3 {
  // Optimised formula: v' = v + 2w(q×v) + 2(q×(q×v))
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isFiniteVec3(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function isFiniteOrientation(o: Orientation): boolean {
  return (
    Number.isFinite(o.x) &&
    Number.isFinite(o.y) &&
    Number.isFinite(o.z) &&
    Number.isFinite(o.w)
  );
}

function defaultTransform(): Transform {
  return {
    position: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

// ---------------------------------------------------------------------------
// SceneGraphNode — abstract base
// ---------------------------------------------------------------------------

export abstract class SceneGraphNode {
  readonly id: number;
  name: string;

  private _parent: SceneGraphNode | null = null;
  private _children: SceneGraphNode[] = [];
  private _localTransform: Transform = defaultTransform();

  constructor(name: string) {
    this.id = nextNodeId++;
    this.name = name;
  }

  get parent(): SceneGraphNode | null {
    return this._parent;
  }

  /** Returns a snapshot — mutating the returned array does not affect the node. */
  get children(): readonly SceneGraphNode[] {
    return [...this._children];
  }

  get localTransform(): Transform {
    return this._localTransform;
  }

  set localTransform(value: Transform) {
    if (
      !isFiniteVec3(value.position) ||
      !isFiniteOrientation(value.orientation) ||
      !isFiniteVec3(value.scale)
    ) {
      return;
    }
    this._localTransform = {
      position: { ...value.position },
      orientation: { ...value.orientation },
      scale: { ...value.scale },
    };
  }

  /** Computed world transform — walks the parent chain on every access. */
  get worldTransform(): Transform {
    const chain: SceneGraphNode[] = [];
    let cur: SceneGraphNode | null = this; // eslint-disable-line @typescript-eslint/no-this-alias
    while (cur) {
      chain.push(cur);
      cur = cur._parent;
    }
    chain.reverse(); // root-first

    let wPos: Vec3 = { x: 0, y: 0, z: 0 };
    let wOri: Orientation = { x: 0, y: 0, z: 0, w: 1 };
    let wScl: Vec3 = { x: 1, y: 1, z: 1 };

    for (const node of chain) {
      const local = node._localTransform;

      // Scale then rotate the child's local position, then add parent world position
      const scaled: Vec3 = {
        x: wScl.x * local.position.x,
        y: wScl.y * local.position.y,
        z: wScl.z * local.position.z,
      };
      const rotated = rotateVec3ByQuaternion(scaled, wOri);
      wPos = {
        x: wPos.x + rotated.x,
        y: wPos.y + rotated.y,
        z: wPos.z + rotated.z,
      };

      // Compose orientation (parent-first)
      wOri = quaternionMultiply(wOri, local.orientation);

      // Component-wise scale multiply
      wScl = {
        x: wScl.x * local.scale.x,
        y: wScl.y * local.scale.y,
        z: wScl.z * local.scale.z,
      };
    }

    return { position: wPos, orientation: wOri, scale: wScl };
  }

  // -- Tree operations -------------------------------------------------------

  addChild(child: SceneGraphNode): void {
    if (child === this) {
      throw new Error('Cannot add node as its own child');
    }

    // Cycle detection: walk up from `this` — if `child` is found, it's an ancestor
    let ancestor: SceneGraphNode | null = this._parent;
    while (ancestor) {
      if (ancestor === child) {
        throw new Error('Cannot add ancestor as child \u2014 cycle detected');
      }
      ancestor = ancestor._parent;
    }

    // Auto-remove from previous parent (re-parenting)
    if (child._parent) {
      child._parent.removeChild(child);
    }

    this._children.push(child);
    child._parent = this;
  }

  removeChild(child: SceneGraphNode): boolean {
    const idx = this._children.indexOf(child);
    if (idx === -1) return false;
    this._children.splice(idx, 1);
    child._parent = null;
    return true;
  }

  hasChild(child: SceneGraphNode): boolean {
    return this._children.includes(child);
  }

  /** Depth-first pre-order traversal from this node. */
  traverse(callback: (node: SceneGraphNode) => void): void {
    callback(this);
    for (const child of this._children) {
      child.traverse(callback);
    }
  }

  /** Find first descendant (or self) matching predicate, DFS pre-order. */
  find(predicate: (node: SceneGraphNode) => boolean): SceneGraphNode | null {
    if (predicate(this)) return this;
    for (const child of this._children) {
      const found = child.find(predicate);
      if (found) return found;
    }
    return null;
  }

  /** Find all descendants (and self) matching predicate, DFS pre-order. */
  findAll(predicate: (node: SceneGraphNode) => boolean): SceneGraphNode[] {
    const result: SceneGraphNode[] = [];
    this.traverse((node) => {
      if (predicate(node)) result.push(node);
    });
    return result;
  }
}

// ---------------------------------------------------------------------------
// GroupNode — non-visual container
// ---------------------------------------------------------------------------

export class GroupNode extends SceneGraphNode {
  constructor(name: string) {
    super(name);
  }
}

// ---------------------------------------------------------------------------
// VisualNode — renderable mesh
// ---------------------------------------------------------------------------

export class VisualNode extends SceneGraphNode {
  private _meshRef: string | null = null;
  private _color: Color3 = { r: 1, g: 1, b: 1 };
  private _opacity = 1.0;
  private _visible = true;

  constructor(name: string) {
    super(name);
  }

  get meshRef(): string | null {
    return this._meshRef;
  }
  set meshRef(value: string | null) {
    this._meshRef = value;
  }

  get color(): Color3 {
    return this._color;
  }
  set color(value: Color3) {
    this._color = { ...value };
  }

  get opacity(): number {
    return this._opacity;
  }
  set opacity(value: number) {
    if (!Number.isFinite(value)) return;
    this._opacity = Math.max(0, Math.min(1, value));
  }

  get visible(): boolean {
    return this._visible;
  }
  set visible(value: boolean) {
    this._visible = value;
  }
}

// ---------------------------------------------------------------------------
// CameraNode — camera parameters
// ---------------------------------------------------------------------------

export class CameraNode extends SceneGraphNode {
  private _fov = 60;
  private _near = 0.1;
  private _far = 1000;
  private _aspect = 16 / 9;

  constructor(name: string) {
    super(name);
  }

  get fov(): number {
    return this._fov;
  }
  set fov(value: number) {
    if (!Number.isFinite(value) || value <= 0) return;
    this._fov = value;
  }

  get near(): number {
    return this._near;
  }
  set near(value: number) {
    if (!Number.isFinite(value) || value <= 0) return;
    this._near = value;
  }

  get far(): number {
    return this._far;
  }
  set far(value: number) {
    if (!Number.isFinite(value) || value <= 0 || value <= this._near) return;
    this._far = value;
  }

  get aspect(): number {
    return this._aspect;
  }
  set aspect(value: number) {
    if (!Number.isFinite(value) || value <= 0) return;
    this._aspect = value;
  }
}

// ---------------------------------------------------------------------------
// LightNode — light parameters
// ---------------------------------------------------------------------------

export class LightNode extends SceneGraphNode {
  readonly lightType: LightType;
  private _color: Color3 = { r: 1, g: 1, b: 1 };
  private _intensity = 1.0;

  constructor(name: string, lightType: LightType) {
    super(name);
    this.lightType = lightType;
  }

  get color(): Color3 {
    return this._color;
  }
  set color(value: Color3) {
    this._color = { ...value };
  }

  get intensity(): number {
    return this._intensity;
  }
  set intensity(value: number) {
    if (!Number.isFinite(value)) return;
    this._intensity = Math.max(0, Math.min(10, value));
  }
}

// ---------------------------------------------------------------------------
// SceneGraph — root container and lookup utilities
// ---------------------------------------------------------------------------

export class SceneGraph {
  readonly root: GroupNode;

  constructor() {
    this.root = new GroupNode('root');
  }

  get nodeCount(): number {
    let count = 0;
    this.root.traverse(() => count++);
    return count;
  }

  getNodeById(id: number): SceneGraphNode | null {
    return this.root.find((n) => n.id === id);
  }

  getNodesByName(name: string): SceneGraphNode[] {
    return this.root.findAll((n) => n.name === name);
  }

  traverse(callback: (node: SceneGraphNode) => void): void {
    this.root.traverse(callback);
  }

  find(predicate: (node: SceneGraphNode) => boolean): SceneGraphNode | null {
    return this.root.find(predicate);
  }

  findAll(predicate: (node: SceneGraphNode) => boolean): SceneGraphNode[] {
    return this.root.findAll(predicate);
  }

  removeNode(node: SceneGraphNode): boolean {
    if (node === this.root) {
      throw new Error('Cannot remove root node');
    }
    if (!node.parent) return false;
    return node.parent.removeChild(node);
  }

  clear(): void {
    for (const child of [...this.root.children]) {
      this.root.removeChild(child);
    }
  }
}
