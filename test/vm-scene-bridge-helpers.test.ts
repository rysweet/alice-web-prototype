import { describe, expect, it } from "vitest";
import type { AliceObject } from "../src/a3p-parser.js";
import { CameraNode, GroupNode, LightNode, VisualNode } from "../src/scene-graph.js";
import { quaternionFromAxisAngle, revolutionsToRadians } from "../src/story-api/expanded-math.js";

function object(overrides: Partial<AliceObject> & Pick<AliceObject, "name" | "typeName">): AliceObject {
  return {
    name: overrides.name,
    typeName: overrides.typeName,
    resourceType: overrides.resourceType ?? null,
    position: overrides.position ?? null,
    orientation: overrides.orientation ?? null,
    size: overrides.size ?? null,
    constructorArgs: overrides.constructorArgs,
  };
}

describe("vm scene bridge transform helpers", () => {
  it("clones identity and supplied transforms without sharing mutable objects", async () => {
    const { cloneTransform, identityTransform, isFiniteTransform } = await import("../src/vm-scene-bridge-transforms.js");

    const identity = identityTransform();
    expect(identity).toEqual({
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    });

    const clone = cloneTransform(identity);
    expect(clone).toEqual(identity);
    expect(clone).not.toBe(identity);
    expect(clone.position).not.toBe(identity.position);
    expect(clone.orientation).not.toBe(identity.orientation);
    expect(clone.scale).not.toBe(identity.scale);
    expect(isFiniteTransform(identity)).toBe(true);
    expect(isFiniteTransform({ ...identity, position: { x: Number.NaN, y: 0, z: 0 } })).toBe(false);
  });

  it("combines parent and child transforms and converts world transforms back to parent-local space", async () => {
    const { combineTransforms, worldToLocalTransform } = await import("../src/vm-scene-bridge-transforms.js");
    const parent = {
      position: { x: 10, y: 0, z: 0 },
      orientation: quaternionFromAxisAngle(0, 1, 0, revolutionsToRadians(0.25)),
      scale: { x: 2, y: 3, z: 4 },
    };
    const child = {
      position: { x: 1, y: 2, z: -3 },
      orientation: quaternionFromAxisAngle(0, 0, 1, revolutionsToRadians(0.25)),
      scale: { x: 5, y: 6, z: 7 },
    };

    const world = combineTransforms(parent, child);
    expect(world.position.x).toBeCloseTo(-2, 5);
    expect(world.position.y).toBeCloseTo(6, 5);
    expect(world.position.z).toBeCloseTo(-2, 5);
    expect(world.scale).toEqual({ x: 10, y: 18, z: 28 });

    const local = worldToLocalTransform(parent, world);
    expect(local.position.x).toBeCloseTo(child.position.x, 5);
    expect(local.position.y).toBeCloseTo(child.position.y, 5);
    expect(local.position.z).toBeCloseTo(child.position.z, 5);
    expect(local.orientation.x).toBeCloseTo(child.orientation.x, 5);
    expect(local.orientation.y).toBeCloseTo(child.orientation.y, 5);
    expect(local.orientation.z).toBeCloseTo(child.orientation.z, 5);
    expect(local.orientation.w).toBeCloseTo(child.orientation.w, 5);
    expect(local.scale).toEqual(child.scale);
  });
});

describe("vm scene bridge mapping helpers", () => {
  it("normalizes permissive numeric, duration, easing, color, and screen projection defaults", async () => {
    const { durationMs, easeFor, numericValue, screenPositionOf, toColor3 } = await import("../src/vm-scene-bridge-mapping.js");

    expect(numericValue("2.5")).toBe(2.5);
    expect(numericValue("not numeric", 7)).toBe(7);
    expect(durationMs("1.25")).toBe(1250);
    expect(durationMs("-1")).toBe(0);
    expect(durationMs(Number.MAX_VALUE)).toBe(0);
    expect(easeFor("GENTLE")).toBe("ease-in-out");
    expect(easeFor("abrupt")).toBe("linear");
    expect(toColor3("#336699")).toEqual({ r: 0x33 / 255, g: 0x66 / 255, b: 0x99 / 255 });
    expect(toColor3("orange")).toEqual({ r: 1, g: 0.5, b: 0 });
    expect(toColor3("not-a-color")).toBeNull();
    expect(screenPositionOf({ x: 2, y: 3, z: 4 })).toEqual({ x: 200, y: -300, visible: true });
  });
});

describe("vm scene bridge entity helpers", () => {
  it("selects scene node types and default transforms from Alice object metadata", async () => {
    const { chooseNodeForObject, createProjectSceneNodes, transformFromObject } = await import("../src/vm-scene-bridge-entities.js");

    expect(chooseNodeForObject(object({ name: "camera", typeName: "SCamera" }))).toBeInstanceOf(CameraNode);
    expect(chooseNodeForObject(object({ name: "sun", typeName: "SSun" }))).toBeInstanceOf(LightNode);
    expect(chooseNodeForObject(object({ name: "world", typeName: "SScene" }))).toBeInstanceOf(GroupNode);

    const prop = chooseNodeForObject(object({
      name: "bunny",
      typeName: "SProp",
      resourceType: "BunnyResource",
    }));
    expect(prop).toBeInstanceOf(VisualNode);
    expect((prop as VisualNode).meshRef).toBe("BunnyResource");

    expect(transformFromObject(object({
      name: "missing",
      typeName: "SProp",
    }))).toEqual({
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    });

    expect(transformFromObject(object({
      name: "sized",
      typeName: "SProp",
      position: { x: 1, y: 2, z: 3 },
      orientation: { x: 0, y: 1, z: 0, w: 0 },
      size: { width: 4, height: 5, depth: 6 },
    }))).toEqual({
      position: { x: 1, y: 2, z: 3 },
      orientation: { x: 0, y: 1, z: 0, w: 0 },
      scale: { x: 4, y: 5, z: 6 },
    });

    const entityNodes = createProjectSceneNodes({
      version: "1",
      projectName: "DetachedNodes",
      sceneObjects: [
        object({ name: "camera", typeName: "SCamera" }),
        object({ name: "prop", typeName: "SProp", position: { x: 1, y: 2, z: 3 } }),
      ],
      methods: [],
    });
    expect([...entityNodes.keys()]).toEqual(["camera", "prop"]);
    expect(entityNodes.get("camera")).toBeInstanceOf(CameraNode);
    expect(entityNodes.get("camera")?.parent).toBeNull();
    expect(entityNodes.get("prop")?.parent).toBeNull();
  });

  it("resolves entity ids only from strings and runtime-like named objects", async () => {
    const { targetEntityIdOf } = await import("../src/vm-scene-bridge-entities.js");

    expect(targetEntityIdOf("bunny")).toBe("bunny");
    expect(targetEntityIdOf({ name: "car" })).toBe("car");
    expect(targetEntityIdOf({ name: 3 })).toBeNull();
    expect(targetEntityIdOf(null)).toBeNull();
    expect(targetEntityIdOf(undefined)).toBeNull();
  });
});
