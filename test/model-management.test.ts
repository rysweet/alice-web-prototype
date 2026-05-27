import { describe, expect, it } from "vitest";
import {
  ModelFactory,
  ModelPool,
  buildBoundingVolumeHierarchy,
  queryBoundingVolume,
  selectLodLevel,
  switchLod,
  type ModelDefinition,
  type ModelPart,
} from "../src/model-management.js";

const parts: ModelPart[] = [
  {
    id: "body",
    meshId: "mesh-body",
    material: { materialId: "mat-body", textureId: "tex-body" },
    bounds: { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } },
  },
  {
    id: "wing",
    meshId: "mesh-wing",
    material: { materialId: "mat-wing" },
    bounds: { min: { x: 2, y: 0, z: -0.5 }, max: { x: 4, y: 1, z: 0.5 } },
  },
];

const definition: ModelDefinition = {
  id: "eagle",
  parts,
  lods: [
    { level: "high", maxDistance: 10, parts },
    { level: "low", maxDistance: Number.POSITIVE_INFINITY, parts: [parts[0]!] },
  ],
};

describe("model-management", () => {
  it("creates model instances with cloned parts and material bindings", () => {
    const factory = new ModelFactory();
    const first = factory.create(definition, { position: { x: 1, y: 2, z: 3 } });
    const second = factory.create(definition);

    expect(first.resourceId).toBe("eagle");
    expect(first.parts[0]!.material.textureId).toBe("tex-body");
    expect(first.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(first.parts).not.toBe(definition.parts);
    expect(first.instanceId).not.toBe(second.instanceId);
  });

  it("reuses model instances from the pool", () => {
    const pool = new ModelPool(new ModelFactory());
    const acquired = pool.acquire(definition);
    pool.release(acquired);
    const reused = pool.acquire(definition);

    expect(reused).toBe(acquired);
    expect(pool.inUseCount("eagle")).toBe(1);
    expect(pool.availableCount("eagle")).toBe(0);
  });

  it("selects LOD levels by distance and updates instances", () => {
    const high = selectLodLevel(definition.lods!, 5);
    const low = selectLodLevel(definition.lods!, 50);
    const instance = new ModelFactory().create(definition);

    expect(high.level).toBe("high");
    expect(low.level).toBe("low");
    expect(switchLod(instance, 50)).toBe("low");
  });

  it("queries bounding volume hierarchies for intersecting parts", () => {
    const hierarchy = buildBoundingVolumeHierarchy(parts);
    const hitIds = queryBoundingVolume(hierarchy, {
      min: { x: 1.5, y: 0, z: -1 },
      max: { x: 3.5, y: 1.5, z: 1 },
    });

    expect(hitIds).toContain("wing");
    expect(hitIds).not.toContain("body");
  });
});
