/**
 * Render Pipeline — orchestrates the full rendering process matching Java's
 * GlrRenderContext multi-pass architecture.
 *
 * Java renders in passes: shadow → opaque → transparent → overlay.
 * This implements the same pattern for Three.js.
 */

// ── Render Layer ───────────────────────────────────────────────────

export enum RenderLayer {
  BACKGROUND = 0,
  SHADOW = 1,
  OPAQUE = 2,
  TRANSPARENT = 3,
  OVERLAY = 4,
  UI = 5,
}

export interface Renderable {
  id: string;
  layer: RenderLayer;
  sortOrder: number;
  visible: boolean;
  render(dt: number): void;
}

// ── Render Batch ───────────────────────────────────────────────────

export class RenderBatch {
  private items: Renderable[] = [];

  add(item: Renderable) { this.items.push(item); }
  remove(id: string) { this.items = this.items.filter(i => i.id !== id); }
  clear() { this.items = []; }
  get count() { return this.items.length; }

  getSorted(): Renderable[] {
    return [...this.items]
      .filter(i => i.visible)
      .sort((a, b) => a.layer - b.layer || a.sortOrder - b.sortOrder);
  }

  getByLayer(layer: RenderLayer): Renderable[] {
    return this.items.filter(i => i.visible && i.layer === layer);
  }

  renderAll(dt: number) {
    for (const item of this.getSorted()) item.render(dt);
  }
}

// ── Frame Stats ────────────────────────────────────────────────────

export class FrameStats {
  private frameTimes: number[] = [];
  private _drawCalls = 0;
  private _triangles = 0;
  private _maxSamples: number;

  constructor(maxSamples = 60) { this._maxSamples = maxSamples; }

  get drawCalls() { return this._drawCalls; }
  get triangles() { return this._triangles; }

  beginFrame() {
    this._drawCalls = 0;
    this._triangles = 0;
  }

  recordDraw(triangleCount: number) {
    this._drawCalls++;
    this._triangles += triangleCount;
  }

  endFrame(frameTimeMs: number) {
    this.frameTimes.push(frameTimeMs);
    if (this.frameTimes.length > this._maxSamples) this.frameTimes.shift();
  }

  get averageFrameTime(): number {
    if (this.frameTimes.length === 0) return 0;
    return this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
  }

  get fps(): number {
    const avg = this.averageFrameTime;
    return avg > 0 ? 1000 / avg : 0;
  }

  get minFrameTime(): number {
    return this.frameTimes.length > 0 ? Math.min(...this.frameTimes) : 0;
  }

  get maxFrameTime(): number {
    return this.frameTimes.length > 0 ? Math.max(...this.frameTimes) : 0;
  }

  get frameTimeVariance(): number {
    if (this.frameTimes.length < 2) return 0;
    const avg = this.averageFrameTime;
    const sumSq = this.frameTimes.reduce((sum, t) => sum + (t - avg) ** 2, 0);
    return sumSq / (this.frameTimes.length - 1);
  }

  get isStable(): boolean {
    return this.frameTimeVariance < (this.averageFrameTime * 0.5) ** 2;
  }

  reset() { this.frameTimes = []; this._drawCalls = 0; this._triangles = 0; }
}

// ── Frustum Culling ────────────────────────────────────────────────

export interface BoundingSphere {
  center: { x: number; y: number; z: number };
  radius: number;
}

export interface FrustumPlane {
  normal: { x: number; y: number; z: number };
  distance: number;
}

export function distanceToPlane(plane: FrustumPlane, point: { x: number; y: number; z: number }): number {
  return plane.normal.x * point.x + plane.normal.y * point.y + plane.normal.z * point.z + plane.distance;
}

export function isSphereInFrustum(planes: FrustumPlane[], sphere: BoundingSphere): boolean {
  for (const plane of planes) {
    if (distanceToPlane(plane, sphere.center) < -sphere.radius) return false;
  }
  return true;
}

export function buildFrustumPlanes(fov: number, aspect: number, near: number, far: number): FrustumPlane[] {
  const halfVFov = (fov * Math.PI / 180) / 2;
  const halfHFov = Math.atan(Math.tan(halfVFov) * aspect);

  const cosH = Math.cos(halfHFov);
  const sinH = Math.sin(halfHFov);
  const cosV = Math.cos(halfVFov);
  const sinV = Math.sin(halfVFov);

  return [
    { normal: { x: 0, y: 0, z: -1 }, distance: -near },   // near
    { normal: { x: 0, y: 0, z: 1 }, distance: far },     // far
    { normal: { x: cosH, y: 0, z: -sinH }, distance: 0 },  // left
    { normal: { x: -cosH, y: 0, z: -sinH }, distance: 0 }, // right
    { normal: { x: 0, y: cosV, z: -sinV }, distance: 0 },  // bottom
    { normal: { x: 0, y: -cosV, z: -sinV }, distance: 0 }, // top
  ];
}

// ── Depth Sorting ──────────────────────────────────────────────────

export interface DepthSortable {
  id: string;
  distanceToCamera: number;
}

export function sortBackToFront(items: DepthSortable[]): DepthSortable[] {
  return [...items].sort((a, b) => b.distanceToCamera - a.distanceToCamera);
}

export function sortFrontToBack(items: DepthSortable[]): DepthSortable[] {
  return [...items].sort((a, b) => a.distanceToCamera - b.distanceToCamera);
}

// ── Render Loop ────────────────────────────────────────────────────

export type RenderLoopState = 'stopped' | 'running' | 'paused';

export class RenderLoop {
  private _state: RenderLoopState = 'stopped';
  private _targetFps: number;
  private _frameCallback: ((dt: number) => void) | null = null;
  private _lastTime = 0;
  private _frameId = 0;
  private _totalFrames = 0;
  private _accumulatedTime = 0;

  constructor(targetFps = 60) { this._targetFps = targetFps; }

  get state() { return this._state; }
  get targetFps() { return this._targetFps; }
  get totalFrames() { return this._totalFrames; }
  get frameInterval() { return 1000 / this._targetFps; }

  setTargetFps(fps: number) { this._targetFps = Math.max(1, Math.min(240, fps)); }

  start(callback: (dt: number) => void) {
    this._frameCallback = callback;
    this._state = 'running';
    this._lastTime = 0;
  }

  pause() { if (this._state === 'running') this._state = 'paused'; }
  resume() { if (this._state === 'paused') { this._state = 'running'; this._lastTime = 0; } }
  stop() { this._state = 'stopped'; this._frameCallback = null; }

  tick(currentTime: number): boolean {
    if (this._state !== 'running' || !this._frameCallback) return false;
    const dt = currentTime - this._lastTime;
    this._accumulatedTime += dt;
    this._lastTime = currentTime;

    if (this._accumulatedTime >= this.frameInterval) {
      this._frameCallback(this._accumulatedTime / 1000);
      this._accumulatedTime -= this.frameInterval;
      this._totalFrames++;
      return true;
    }
    return false;
  }

  reset() {
    this._totalFrames = 0;
    this._accumulatedTime = 0;
    this._lastTime = 0;
  }
}
