export interface RenderVector3 {
  x: number;
  y: number;
  z: number;
}

export interface RenderableItem {
  id: string;
  materialId: string;
  distanceToCamera: number;
  triangleCount: number;
  textureIds?: readonly string[];
  castsShadow?: boolean;
  transparent?: boolean;
}

export interface ManagedRenderScene {
  name: string;
  renderables: RenderableItem[];
  environmentProbeId?: string | null;
}

export interface RenderCamera {
  near: number;
  far: number;
  position: RenderVector3;
}

export interface SceneTransition {
  fromScene: string | null;
  toScene: string;
  kind: "cut" | "fade" | "crossfade";
  durationMs: number;
  progress: number;
}

export interface RenderBatch {
  materialId: string;
  transparent: boolean;
  renderableIds: string[];
}

export interface ShadowCascade {
  index: number;
  near: number;
  far: number;
  renderableIds: string[];
}

export interface EnvironmentProbe {
  id: string;
  position: RenderVector3;
  capturedFaces: string[];
}

export interface RenderStatisticsSnapshot {
  drawCalls: number;
  triangles: number;
  textures: number;
  frameTimeMs: number;
  averageFrameTimeMs: number;
  framesRendered: number;
}

export interface SceneRenderResult {
  sceneName: string;
  orderedRenderableIds: string[];
  batches: RenderBatch[];
  shadowCascades: ShadowCascade[];
  selectedProbeId: string | null;
  stats: RenderStatisticsSnapshot;
}

function cloneVector3(value: RenderVector3): RenderVector3 {
  return { ...value };
}

function distanceBetween(a: RenderVector3, b: RenderVector3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export class RenderStatistics {
  private drawCallsThisFrame = 0;
  private trianglesThisFrame = 0;
  private frameTimeMs = 0;
  private readonly texturesThisFrame = new Set<string>();
  private framesRendered = 0;
  private totalFrameTimeMs = 0;

  beginFrame(): void {
    this.drawCallsThisFrame = 0;
    this.trianglesThisFrame = 0;
    this.frameTimeMs = 0;
    this.texturesThisFrame.clear();
  }

  recordDrawCall(triangleCount: number): void {
    this.drawCallsThisFrame += 1;
    this.trianglesThisFrame += triangleCount;
  }

  recordTextureBinding(textureId: string): void {
    this.texturesThisFrame.add(textureId);
  }

  recordTextureBindings(textureIds: readonly string[] = []): void {
    textureIds.forEach((textureId) => this.recordTextureBinding(textureId));
  }

  finishFrame(frameTimeMs: number): RenderStatisticsSnapshot {
    this.frameTimeMs = Math.max(0, frameTimeMs);
    this.framesRendered += 1;
    this.totalFrameTimeMs += this.frameTimeMs;
    return this.snapshot();
  }

  snapshot(): RenderStatisticsSnapshot {
    return {
      drawCalls: this.drawCallsThisFrame,
      triangles: this.trianglesThisFrame,
      textures: this.texturesThisFrame.size,
      frameTimeMs: this.frameTimeMs,
      averageFrameTimeMs: this.framesRendered === 0 ? 0 : this.totalFrameTimeMs / this.framesRendered,
      framesRendered: this.framesRendered,
    };
  }
}

export class RenderQueue {
  private readonly items: RenderableItem[] = [];

  enqueue(item: RenderableItem): void {
    this.items.push({
      ...item,
      textureIds: item.textureIds ? [...item.textureIds] : [],
    });
  }

  enqueueAll(items: readonly RenderableItem[]): void {
    items.forEach((item) => this.enqueue(item));
  }

  clear(): void {
    this.items.length = 0;
  }

  size(): number {
    return this.items.length;
  }

  sorted(): RenderableItem[] {
    return [...this.items].sort((left, right) => {
      const leftTransparent = left.transparent ?? false;
      const rightTransparent = right.transparent ?? false;
      if (leftTransparent !== rightTransparent) {
        return leftTransparent ? 1 : -1;
      }
      if (!leftTransparent && left.materialId !== right.materialId) {
        return left.materialId.localeCompare(right.materialId);
      }
      if (left.distanceToCamera !== right.distanceToCamera) {
        return leftTransparent
          ? right.distanceToCamera - left.distanceToCamera
          : left.distanceToCamera - right.distanceToCamera;
      }
      return left.id.localeCompare(right.id);
    });
  }

  buildBatches(sortedItems: readonly RenderableItem[] = this.sorted()): RenderBatch[] {
    const batches: RenderBatch[] = [];
    for (const item of sortedItems) {
      const transparent = item.transparent ?? false;
      const previous = batches[batches.length - 1] ?? null;
      if (!previous || previous.materialId !== item.materialId || previous.transparent !== transparent) {
        batches.push({
          materialId: item.materialId,
          transparent,
          renderableIds: [item.id],
        });
      } else {
        previous.renderableIds.push(item.id);
      }
    }
    return batches;
  }
}

export class ShadowMapper {
  constructor(
    readonly cascadeCount = 4,
    readonly cascadeBlend = 0.5,
  ) {}

  computeCascadeSplits(near: number, far: number): number[] {
    const safeNear = Math.max(near, 0.001);
    const safeFar = Math.max(far, safeNear);
    const splits: number[] = [];
    for (let index = 1; index <= this.cascadeCount; index += 1) {
      const ratio = index / this.cascadeCount;
      const logarithmic = safeNear * ((safeFar / safeNear) ** ratio);
      const linear = safeNear + ((safeFar - safeNear) * ratio);
      splits.push((this.cascadeBlend * logarithmic) + ((1 - this.cascadeBlend) * linear));
    }
    splits[splits.length - 1] = safeFar;
    return splits;
  }

  buildShadowCascades(
    renderables: readonly RenderableItem[],
    near: number,
    far: number,
  ): ShadowCascade[] {
    const splits = this.computeCascadeSplits(near, far);
    let previousSplit = near;
    return splits.map((split, index) => {
      const renderableIds = renderables
        .filter((renderable) => (renderable.castsShadow ?? false))
        .filter((renderable) => renderable.distanceToCamera > previousSplit && renderable.distanceToCamera <= split)
        .map((renderable) => renderable.id);
      const cascade: ShadowCascade = {
        index,
        near: previousSplit,
        far: split,
        renderableIds,
      };
      previousSplit = split;
      return cascade;
    });
  }
}

export class EnvironmentMap {
  private readonly probes = new Map<string, EnvironmentProbe>();

  registerProbe(id: string, position: RenderVector3): void {
    if (this.probes.has(id)) {
      throw new Error(`environment probe "${id}" already exists`);
    }
    this.probes.set(id, {
      id,
      position: cloneVector3(position),
      capturedFaces: [],
    });
  }

  captureProbe(id: string, faces: readonly string[] = ["px", "nx", "py", "ny", "pz", "nz"]): EnvironmentProbe {
    const probe = this.requireProbe(id);
    probe.capturedFaces = [...faces];
    return this.getProbe(id)!;
  }

  getProbe(id: string): EnvironmentProbe | null {
    const probe = this.probes.get(id);
    if (!probe) {
      return null;
    }
    return {
      id: probe.id,
      position: cloneVector3(probe.position),
      capturedFaces: [...probe.capturedFaces],
    };
  }

  chooseProbe(position: RenderVector3): EnvironmentProbe | null {
    let best: EnvironmentProbe | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const probe of this.probes.values()) {
      const distance = distanceBetween(position, probe.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = probe;
      }
    }
    return best ? this.getProbe(best.id) : null;
  }

  sampleReflection(id: string, roughness: number): { probeId: string; mipLevel: number; facesCaptured: number } {
    const probe = this.requireProbe(id);
    const mipLevel = Math.round(Math.min(Math.max(roughness, 0), 1) * 5);
    return {
      probeId: probe.id,
      mipLevel,
      facesCaptured: probe.capturedFaces.length,
    };
  }

  private requireProbe(id: string): EnvironmentProbe {
    const probe = this.probes.get(id);
    if (!probe) {
      throw new Error(`environment probe "${id}" does not exist`);
    }
    return probe;
  }
}

export class SceneRenderer {
  constructor(
    private readonly queue = new RenderQueue(),
    private readonly shadowMapper = new ShadowMapper(),
    private readonly environmentMap = new EnvironmentMap(),
    private readonly statistics = new RenderStatistics(),
  ) {}

  renderScene(
    scene: ManagedRenderScene,
    camera: RenderCamera,
    options: { frameTimeMs?: number } = {},
  ): SceneRenderResult {
    this.statistics.beginFrame();
    this.queue.clear();
    this.queue.enqueueAll(scene.renderables);

    const sorted = this.queue.sorted();
    const batches = this.queue.buildBatches(sorted);
    const renderablesById = new Map(sorted.map((renderable) => [renderable.id, renderable] as const));

    batches.forEach((batch) => {
      const triangleCount = batch.renderableIds.reduce(
        (sum, id) => sum + (renderablesById.get(id)?.triangleCount ?? 0),
        0,
      );
      this.statistics.recordDrawCall(triangleCount);
      batch.renderableIds.forEach((id) => {
        this.statistics.recordTextureBindings(renderablesById.get(id)?.textureIds ?? []);
      });
    });

    const selectedProbeId = scene.environmentProbeId
      ?? this.environmentMap.chooseProbe(camera.position)?.id
      ?? null;
    const shadowCascades = this.shadowMapper.buildShadowCascades(scene.renderables, camera.near, camera.far);
    const stats = this.statistics.finishFrame(options.frameTimeMs ?? 16.67);

    return {
      sceneName: scene.name,
      orderedRenderableIds: sorted.map((renderable) => renderable.id),
      batches,
      shadowCascades,
      selectedProbeId,
      stats,
    };
  }
}

export class SceneManager {
  private readonly scenes = new Map<string, ManagedRenderScene>();
  private activeSceneName: string | null = null;
  private transition: SceneTransition | null = null;

  get sceneNames(): string[] {
    return [...this.scenes.keys()];
  }

  get activeScene(): ManagedRenderScene | null {
    return this.activeSceneName ? this.getScene(this.activeSceneName) : null;
  }

  get lastTransition(): SceneTransition | null {
    return this.transition ? { ...this.transition } : null;
  }

  addScene(scene: ManagedRenderScene): void {
    if (this.scenes.has(scene.name)) {
      throw new Error(`scene "${scene.name}" already exists`);
    }
    this.scenes.set(scene.name, {
      ...scene,
      renderables: scene.renderables.map((renderable) => ({
        ...renderable,
        textureIds: renderable.textureIds ? [...renderable.textureIds] : [],
      })),
    });
    if (this.activeSceneName === null) {
      this.activeSceneName = scene.name;
    }
  }

  getScene(name: string): ManagedRenderScene | null {
    const scene = this.scenes.get(name);
    if (!scene) {
      return null;
    }
    return {
      ...scene,
      renderables: scene.renderables.map((renderable) => ({
        ...renderable,
        textureIds: renderable.textureIds ? [...renderable.textureIds] : [],
      })),
    };
  }

  setActiveScene(
    name: string,
    transition: Partial<Omit<SceneTransition, "fromScene" | "toScene" | "progress">> = {},
  ): void {
    if (!this.scenes.has(name)) {
      throw new Error(`scene "${name}" does not exist`);
    }
    if (this.activeSceneName === name) {
      return;
    }
    this.transition = {
      fromScene: this.activeSceneName,
      toScene: name,
      kind: transition.kind ?? "cut",
      durationMs: Math.max(0, transition.durationMs ?? 0),
      progress: 0,
    };
    this.activeSceneName = name;
  }

  updateTransition(elapsedMs: number): SceneTransition | null {
    if (!this.transition) {
      return null;
    }
    if (this.transition.durationMs === 0) {
      this.transition.progress = 1;
      return this.lastTransition;
    }
    const nextProgress = Math.min(1, this.transition.progress + (elapsedMs / this.transition.durationMs));
    this.transition.progress = nextProgress;
    return this.lastTransition;
  }

  removeScene(name: string): boolean {
    const wasActive = this.activeSceneName === name;
    const removed = this.scenes.delete(name);
    if (!removed) {
      return false;
    }
    if (wasActive) {
      this.activeSceneName = this.sceneNames[0] ?? null;
    }
    return true;
  }

  renderActiveScene(
    renderer: SceneRenderer,
    camera: RenderCamera,
    options: { frameTimeMs?: number } = {},
  ): SceneRenderResult | null {
    const scene = this.activeScene;
    return scene ? renderer.renderScene(scene, camera, options) : null;
  }
}
