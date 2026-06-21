// test/webxr-interaction.test.ts
import { describe, expect, it } from "vitest";
import { resolveWebXRInteraction } from "../src/webxr-locomotion.js";

const objectHit = {
  objectName: "bunny",
  distanceMeters: 8,
  point: { x: 0, y: 1, z: -8 },
  pickable: true,
};

const groundHit = {
  surfaceName: "ground",
  distanceMeters: 2,
  position: { x: 0, y: 0, z: -2 },
};

const treeHit = {
  surfaceName: "tree",
  distanceMeters: 2,
  position: { x: 0, y: 0, z: -2 },
};

function codes(result: { evidence: { code: string }[] }): string[] {
  return result.evidence.map((item) => item.code);
}

describe("resolveWebXRInteraction", () => {
  it("lets point-click activate pickable Alice objects without moving the user", () => {
    const result = resolveWebXRInteraction({
      mode: "point-click",
      objectHits: [objectHit],
      movementHits: [groundHit],
      movementSurfaceNames: ["ground"],
    });

    expect(result).toMatchObject({
      type: "object-interaction",
      objectName: "bunny",
      moved: false,
    });
  });

  it("lets click-move ignore object hits and move only to valid movement surfaces", () => {
    const result = resolveWebXRInteraction({
      mode: "click-move",
      objectHits: [objectHit],
      movementHits: [groundHit],
      movementSurfaceNames: ["ground"],
      clickMoveMaxDistanceMeters: 25,
      currentRigPosition: { x: 0, y: 1.6, z: 0 },
    });

    expect(result).toMatchObject({
      type: "movement",
      target: {
        surfaceName: "ground",
        position: { x: 0, y: 1.6, z: -2 },
      },
      moved: true,
    });
  });

  it("makes object hits win over closer movement surfaces in combined mode", () => {
    const result = resolveWebXRInteraction({
      mode: "combined",
      objectHits: [objectHit],
      movementHits: [groundHit],
      movementSurfaceNames: ["ground"],
      currentRigPosition: { x: 0, y: 1.6, z: 0 },
    });

    expect(result.type).toBe("object-interaction");
    expect(result).toMatchObject({
      objectName: "bunny",
      moved: false,
    });
  });

  it("records invalid-movement-target and does not move when click-move hits an unsupported surface", () => {
    const result = resolveWebXRInteraction({
      mode: "click-move",
      objectHits: [],
      movementHits: [treeHit],
      movementSurfaceNames: ["ground", "floor", "terrain"],
      currentRigPosition: { x: 0, y: 1.6, z: 0 },
    });

    expect(result.type).toBe("invalid-target");
    expect(result.moved).toBe(false);
    expect(codes(result)).toContain("invalid-movement-target");
  });
});
