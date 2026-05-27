import type { BoundingBox, Vec3 } from "./story-api";

export interface MaterialBinding {
  readonly materialId: string;
  readonly textureId?: string | null;
}

export interface ModelPart {
  readonly id: string;
  readonly meshId: string;
  readonly material: MaterialBinding;
  readonly bounds: BoundingBox;
}

export interface LodLevel {
  readonly level: string;
  readonly maxDistance: number;
  readonly parts: readonly ModelPart[];
}

export interface ModelDefinition {
  readonly id: string;
  readonly parts: readonly ModelPart[];
  readonly lods?: readonly LodLevel[];
}

export interface ModelInstance {
  readonly instanceId: string;
  readonly resourceId: string;
  readonly parts: ModelPart[];
  readonly lods: readonly LodLevel[];
  readonly metadata: Record<string, unknown>;
  position: Vec3;
  activeLod: string | null;
}

export interface BoundingVolumeNode {
  readonly bounds: BoundingBox;
  readonly partIds: readonly string[];
  readonly left: BoundingVolumeNode | null;
  readonly right: BoundingVolumeNode | null;
  readonly leaf: boolean;
}

function cloneVec3(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

function cloneBounds(bounds: BoundingBox): BoundingBox {
  return { min: cloneVec3(bounds.min), max: cloneVec3(bounds.max) };
}

function clonePart(part: ModelPart): ModelPart {
  return {
    id: part.id,
    meshId: part.meshId,
    material: { ...part.material },
    bounds: cloneBounds(part.bounds),
  };
}

function center(bounds: BoundingBox): Vec3 {
  return {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5,
  };
}

function mergeBounds(bounds: readonly BoundingBox[]): BoundingBox {
  return bounds.reduce((merged, current) => ({
    min: {
      x: Math.min(merged.min.x, current.min.x),
      y: Math.min(merged.min.y, current.min.y),
      z: Math.min(merged.min.z, current.min.z),
    },
    max: {
      x: Math.max(merged.max.x, current.max.x),
      y: Math.max(merged.max.y, current.max.y),
      z: Math.max(merged.max.z, current.max.z),
    },
  }));
}

export function intersectsBounds(left: BoundingBox, right: BoundingBox): boolean {
  return left.min.x <= right.max.x
    && left.max.x >= right.min.x
    && left.min.y <= right.max.y
    && left.max.y >= right.min.y
    && left.min.z <= right.max.z
    && left.max.z >= right.min.z;
}

export function selectLodLevel(levels: readonly LodLevel[], distance: number): LodLevel {
  const ordered = [...levels].sort((left, right) => left.maxDistance - right.maxDistance);
  for (const level of ordered) {
    if (distance <= level.maxDistance) {
      return level;
    }
  }
  return ordered[ordered.length - 1]!;
}

export class ModelFactory {
  #nextId = 1;

  create(definition: ModelDefinition, options: {
    position?: Vec3;
    metadata?: Record<string, unknown>;
  } = {}): ModelInstance {
    const lods = definition.lods ?? [{ level: "default", maxDistance: Number.POSITIVE_INFINITY, parts: definition.parts }];
    return {
      instanceId: `${definition.id}#${this.#nextId++}`,
      resourceId: definition.id,
      parts: definition.parts.map(clonePart),
      lods: lods.map((level) => ({ ...level, parts: level.parts.map(clonePart) })),
      metadata: { ...(options.metadata ?? {}) },
      position: cloneVec3(options.position ?? { x: 0, y: 0, z: 0 }),
      activeLod: selectLodLevel(lods, 0).level,
    };
  }

  createMany(definitions: readonly ModelDefinition[]): ModelInstance[] {
    return definitions.map((definition) => this.create(definition));
  }
}

export class ModelPool {
  readonly #available = new Map<string, ModelInstance[]>();
  readonly #inUse = new Map<string, Set<ModelInstance>>();

  constructor(private readonly factory = new ModelFactory()) {}

  acquire(definition: ModelDefinition): ModelInstance {
    const available = this.#available.get(definition.id);
    const instance = available?.pop() ?? this.factory.create(definition);
    if (!this.#inUse.has(definition.id)) {
      this.#inUse.set(definition.id, new Set<ModelInstance>());
    }
    this.#inUse.get(definition.id)!.add(instance);
    return instance;
  }

  release(instance: ModelInstance): void {
    const inUse = this.#inUse.get(instance.resourceId);
    inUse?.delete(instance);
    if (!this.#available.has(instance.resourceId)) {
      this.#available.set(instance.resourceId, []);
    }
    this.#available.get(instance.resourceId)!.push(instance);
  }

  availableCount(resourceId: string): number {
    return this.#available.get(resourceId)?.length ?? 0;
  }

  inUseCount(resourceId: string): number {
    return this.#inUse.get(resourceId)?.size ?? 0;
  }
}

function longestAxis(bounds: BoundingBox): "x" | "y" | "z" {
  const x = bounds.max.x - bounds.min.x;
  const y = bounds.max.y - bounds.min.y;
  const z = bounds.max.z - bounds.min.z;
  if (x >= y && x >= z) {
    return "x";
  }
  if (y >= z) {
    return "y";
  }
  return "z";
}

export function buildBoundingVolumeHierarchy(parts: readonly ModelPart[]): BoundingVolumeNode | null {
  if (parts.length === 0) {
    return null;
  }
  const bounds = mergeBounds(parts.map((part) => part.bounds));
  if (parts.length <= 1) {
    return {
      bounds,
      partIds: parts.map((part) => part.id),
      left: null,
      right: null,
      leaf: true,
    };
  }
  const axis = longestAxis(bounds);
  const sorted = [...parts].sort((left, right) => center(left.bounds)[axis] - center(right.bounds)[axis]);
  const middle = Math.ceil(sorted.length / 2);
  const leftParts = sorted.slice(0, middle);
  const rightParts = sorted.slice(middle);
  return {
    bounds,
    partIds: parts.map((part) => part.id),
    left: buildBoundingVolumeHierarchy(leftParts),
    right: buildBoundingVolumeHierarchy(rightParts),
    leaf: false,
  };
}

export function queryBoundingVolume(node: BoundingVolumeNode | null, region: BoundingBox): string[] {
  if (!node || !intersectsBounds(node.bounds, region)) {
    return [];
  }
  if (node.leaf) {
    return [...node.partIds];
  }
  return [
    ...queryBoundingVolume(node.left, region),
    ...queryBoundingVolume(node.right, region),
  ];
}

export function switchLod(instance: ModelInstance, distance: number): string {
  const selected = selectLodLevel(instance.lods, distance);
  instance.activeLod = selected.level;
  return selected.level;
}
