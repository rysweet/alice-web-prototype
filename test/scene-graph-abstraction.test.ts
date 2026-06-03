/**
 * TDD tests for scene graph abstraction — src/scene-graph-abstraction.ts
 *
 * Tests define the contract for:
 * - SceneGraphVisitor<T> interface and walkSceneGraph() dispatch
 * - Transform ↔ AffineMatrix4x4 coordinate bridge
 * - Forward direction conversion (Alice Z+ → Three.js Z-)
 * - TransformCollector and NodeCounter concrete visitors
 */

import { describe, expect, it } from "vitest";
import {
  type SceneGraphVisitor,
  walkSceneGraph,
  transformToAffine,
  affineToTransform,
  aliceForwardToThreeForward,
  threeForwardToAliceForward,
  TransformCollector,
  NodeCounter,
} from "../src/scene-graph-abstraction.js";
import {
  GroupNode,
  VisualNode,
  CameraNode,
  LightNode,
  SceneGraphNode,
  quaternionFromAxisAngle,
  type Transform,
} from "../src/scene-graph.js";
import { AffineMatrix4x4 } from "../src/scenegraph-math-affine.js";
import { OrthogonalMatrix3x3 } from "../src/scenegraph-math-orientation.js";
import { Point3, Vector3 } from "../src/scenegraph-math-vectors.js";

// ── Helpers ────────────────────────────────────────────────────────

function identityTransform(): Transform {
  return {
    position: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

function approxEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) < epsilon;
}

/** Build a test tree:
 *  root (Group)
 *  ├── groupA (Group)
 *  │   └── visualA (Visual)
 *  ├── groupB (Group)
 *  │   └── cameraB (Camera)
 *  └── lightC (Light)
 */
function buildTestTree() {
  const root = new GroupNode("root");
  const groupA = new GroupNode("groupA");
  const visualA = new VisualNode("visualA");
  const groupB = new GroupNode("groupB");
  const cameraB = new CameraNode("cameraB");
  const lightC = new LightNode("lightC", "point");

  root.addChild(groupA);
  groupA.addChild(visualA);
  root.addChild(groupB);
  groupB.addChild(cameraB);
  root.addChild(lightC);

  return { root, groupA, visualA, groupB, cameraB, lightC };
}

/** A visitor that records visit method names and node names. */
function createRecordingVisitor(): SceneGraphVisitor<string> & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    visitGroup(node: GroupNode): string {
      calls.push(`group:${node.name}`);
      return `group:${node.name}`;
    },
    visitVisual(node: VisualNode): string {
      calls.push(`visual:${node.name}`);
      return `visual:${node.name}`;
    },
    visitCamera(node: CameraNode): string {
      calls.push(`camera:${node.name}`);
      return `camera:${node.name}`;
    },
    visitLight(node: LightNode): string {
      calls.push(`light:${node.name}`);
      return `light:${node.name}`;
    },
    visitUnknown(node: SceneGraphNode): string {
      calls.push(`unknown:${node.name}`);
      return `unknown:${node.name}`;
    },
  };
}

// ── walkSceneGraph — Visitor Dispatch ──────────────────────────────

describe("walkSceneGraph", () => {
  it("visits all nodes in a tree", () => {
    const { root } = buildTestTree();
    const visitor = createRecordingVisitor();

    const results = walkSceneGraph(root, visitor);

    // 6 nodes total: root, groupA, visualA, groupB, cameraB, lightC
    expect(results).toHaveLength(6);
  });

  it("traverses in preorder depth-first order", () => {
    const { root } = buildTestTree();
    const visitor = createRecordingVisitor();

    const results = walkSceneGraph(root, visitor);

    expect(results).toEqual([
      "group:root",
      "group:groupA",
      "visual:visualA",
      "group:groupB",
      "camera:cameraB",
      "light:lightC",
    ]);
  });

  it("dispatches GroupNode to visitGroup", () => {
    const root = new GroupNode("solo-group");
    const visitor = createRecordingVisitor();

    walkSceneGraph(root, visitor);

    expect(visitor.calls).toContain("group:solo-group");
  });

  it("dispatches VisualNode to visitVisual", () => {
    const root = new GroupNode("root");
    const visual = new VisualNode("my-visual");
    root.addChild(visual);
    const visitor = createRecordingVisitor();

    walkSceneGraph(root, visitor);

    expect(visitor.calls).toContain("visual:my-visual");
  });

  it("dispatches CameraNode to visitCamera", () => {
    const root = new GroupNode("root");
    const camera = new CameraNode("my-camera");
    root.addChild(camera);
    const visitor = createRecordingVisitor();

    walkSceneGraph(root, visitor);

    expect(visitor.calls).toContain("camera:my-camera");
  });

  it("dispatches LightNode to visitLight", () => {
    const root = new GroupNode("root");
    const light = new LightNode("my-light", "directional");
    root.addChild(light);
    const visitor = createRecordingVisitor();

    walkSceneGraph(root, visitor);

    expect(visitor.calls).toContain("light:my-light");
  });

  it("handles a single root node", () => {
    const root = new GroupNode("lonely");
    const visitor = createRecordingVisitor();

    const results = walkSceneGraph(root, visitor);

    expect(results).toEqual(["group:lonely"]);
  });

  it("collects all return values including undefined/null", () => {
    const root = new GroupNode("root");
    const child = new VisualNode("child");
    root.addChild(child);

    const visitor: SceneGraphVisitor<string | undefined> = {
      visitGroup: () => undefined,
      visitVisual: () => "found",
      visitCamera: () => undefined,
      visitLight: () => undefined,
      visitUnknown: () => undefined,
    };

    const results = walkSceneGraph(root, visitor);
    expect(results).toHaveLength(2);
    expect(results).toContain("found");
    expect(results).toContain(undefined);
  });
});

// ── Concrete Visitors ──────────────────────────────────────────────

describe("NodeCounter", () => {
  it("counts all nodes in a mixed tree", () => {
    const { root } = buildTestTree();
    const counter = new NodeCounter();

    const results = walkSceneGraph(root, counter);

    // NodeCounter should return 1 for each node visited
    const totalCount = results.reduce((sum, n) => sum + n, 0);
    expect(totalCount).toBe(6);
  });

  it("returns 1 for a single root", () => {
    const root = new GroupNode("solo");
    const counter = new NodeCounter();

    const results = walkSceneGraph(root, counter);
    const totalCount = results.reduce((sum, n) => sum + n, 0);
    expect(totalCount).toBe(1);
  });
});

describe("TransformCollector", () => {
  it("collects transforms from all nodes", () => {
    const { root, visualA } = buildTestTree();

    // Set a non-identity transform on visualA
    visualA.localTransform = {
      position: { x: 1, y: 2, z: 3 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };

    const collector = new TransformCollector();
    const results = walkSceneGraph(root, collector);

    expect(results).toHaveLength(6);
    // Each result should have name and transform
    for (const entry of results) {
      expect(entry).toHaveProperty("name");
      expect(entry).toHaveProperty("transform");
      expect(entry.transform).toHaveProperty("position");
      expect(entry.transform).toHaveProperty("orientation");
      expect(entry.transform).toHaveProperty("scale");
    }
  });

  it("captures the local transform of nodes", () => {
    const root = new GroupNode("root");
    const visual = new VisualNode("moved");
    visual.localTransform = {
      position: { x: 5, y: 10, z: 15 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 2, y: 2, z: 2 },
    };
    root.addChild(visual);

    const collector = new TransformCollector();
    const results = walkSceneGraph(root, collector);

    const movedEntry = results.find((r) => r.name === "moved");
    expect(movedEntry).toBeDefined();
    expect(movedEntry!.transform.position.x).toBe(5);
    expect(movedEntry!.transform.position.y).toBe(10);
    expect(movedEntry!.transform.scale.x).toBe(2);
  });
});

// ── Transform ↔ AffineMatrix4x4 Bridge ────────────────────────────

describe("transformToAffine", () => {
  it("converts identity transform to AffineMatrix4x4.IDENTITY", () => {
    const transform = identityTransform();
    const affine = transformToAffine(transform);

    expect(affine.isIdentity()).toBe(true);
  });

  it("converts translated transform correctly", () => {
    const transform: Transform = {
      position: { x: 3, y: 5, z: -2 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };
    const affine = transformToAffine(transform);

    expect(approxEqual(affine.translation.x, 3)).toBe(true);
    expect(approxEqual(affine.translation.y, 5)).toBe(true);
    expect(approxEqual(affine.translation.z, -2)).toBe(true);
  });

  it("converts a 90° Y-axis rotation", () => {
    const angle = Math.PI / 2;
    const quat = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, angle);
    const transform: Transform = {
      position: { x: 0, y: 0, z: 0 },
      orientation: quat,
      scale: { x: 1, y: 1, z: 1 },
    };
    const affine = transformToAffine(transform);

    // After 90° Y rotation, X→Z and Z→-X
    // Check by transforming the X-axis unit vector
    const rotatedX = affine.transformVector({ x: 1, y: 0, z: 0 });
    expect(approxEqual(rotatedX.x, 0)).toBe(true);
    expect(approxEqual(rotatedX.y, 0)).toBe(true);
    expect(approxEqual(Math.abs(rotatedX.z), 1)).toBe(true);
  });

  it("converts uniform scale", () => {
    const transform: Transform = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 2, y: 2, z: 2 },
    };
    const affine = transformToAffine(transform);

    const scaled = affine.transformVector({ x: 1, y: 0, z: 0 });
    expect(approxEqual(scaled.x, 2)).toBe(true);
    expect(approxEqual(scaled.y, 0)).toBe(true);
    expect(approxEqual(scaled.z, 0)).toBe(true);
  });

  it("converts non-uniform scale", () => {
    const transform: Transform = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 3, z: 0.5 },
    };
    const affine = transformToAffine(transform);

    const scaledY = affine.transformVector({ x: 0, y: 1, z: 0 });
    expect(approxEqual(scaledY.y, 3)).toBe(true);

    const scaledZ = affine.transformVector({ x: 0, y: 0, z: 1 });
    expect(approxEqual(scaledZ.z, 0.5)).toBe(true);
  });
});

describe("affineToTransform", () => {
  it("converts identity affine to identity transform", () => {
    const transform = affineToTransform(AffineMatrix4x4.IDENTITY);

    expect(approxEqual(transform.position.x, 0)).toBe(true);
    expect(approxEqual(transform.position.y, 0)).toBe(true);
    expect(approxEqual(transform.position.z, 0)).toBe(true);
    expect(approxEqual(transform.scale.x, 1)).toBe(true);
    expect(approxEqual(transform.scale.y, 1)).toBe(true);
    expect(approxEqual(transform.scale.z, 1)).toBe(true);
    // Quaternion: either (0,0,0,1) or (0,0,0,-1) — both represent identity
    expect(
      approxEqual(Math.abs(transform.orientation.w), 1),
    ).toBe(true);
  });

  it("preserves translation through affineToTransform", () => {
    const affine = AffineMatrix4x4.fromTranslation(7, -3, 12);
    const transform = affineToTransform(affine);

    expect(approxEqual(transform.position.x, 7)).toBe(true);
    expect(approxEqual(transform.position.y, -3)).toBe(true);
    expect(approxEqual(transform.position.z, 12)).toBe(true);
  });
});

describe("Transform ↔ Affine roundtrip", () => {
  it("roundtrips identity transform", () => {
    const original = identityTransform();
    const roundtripped = affineToTransform(transformToAffine(original));

    expect(approxEqual(roundtripped.position.x, 0)).toBe(true);
    expect(approxEqual(roundtripped.position.y, 0)).toBe(true);
    expect(approxEqual(roundtripped.position.z, 0)).toBe(true);
    expect(approxEqual(roundtripped.scale.x, 1)).toBe(true);
    expect(approxEqual(roundtripped.scale.y, 1)).toBe(true);
    expect(approxEqual(roundtripped.scale.z, 1)).toBe(true);
  });

  it("roundtrips a translated + rotated transform (semantically equivalent)", () => {
    const angle = Math.PI / 4; // 45° around Y
    const quat = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, angle);
    const original: Transform = {
      position: { x: 10, y: -5, z: 3 },
      orientation: quat,
      scale: { x: 1, y: 1, z: 1 },
    };

    const roundtripped = affineToTransform(transformToAffine(original));

    // Position should be preserved exactly
    expect(approxEqual(roundtripped.position.x, original.position.x)).toBe(true);
    expect(approxEqual(roundtripped.position.y, original.position.y)).toBe(true);
    expect(approxEqual(roundtripped.position.z, original.position.z)).toBe(true);

    // Scale preserved
    expect(approxEqual(roundtripped.scale.x, 1)).toBe(true);
    expect(approxEqual(roundtripped.scale.y, 1)).toBe(true);
    expect(approxEqual(roundtripped.scale.z, 1)).toBe(true);

    // Rotation semantically equivalent: transform a test vector through both
    // and compare results (avoids quaternion sign ambiguity)
    const testVec = { x: 1, y: 0, z: 0 };
    const originalAffine = transformToAffine(original);
    const roundtrippedAffine = transformToAffine(roundtripped);
    const originalResult = originalAffine.transformPoint(testVec);
    const roundtrippedResult = roundtrippedAffine.transformPoint(testVec);

    expect(approxEqual(originalResult.x, roundtrippedResult.x)).toBe(true);
    expect(approxEqual(originalResult.y, roundtrippedResult.y)).toBe(true);
    expect(approxEqual(originalResult.z, roundtrippedResult.z)).toBe(true);
  });

  it("roundtrips a uniformly scaled transform", () => {
    const original: Transform = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 3, y: 3, z: 3 },
    };

    const roundtripped = affineToTransform(transformToAffine(original));

    expect(approxEqual(roundtripped.scale.x, 3)).toBe(true);
    expect(approxEqual(roundtripped.scale.y, 3)).toBe(true);
    expect(approxEqual(roundtripped.scale.z, 3)).toBe(true);
  });
});

// ── Forward Direction Bridge ───────────────────────────────────────

describe("aliceForwardToThreeForward", () => {
  it("converts Alice Z+ forward to Three.js Z- forward", () => {
    const aliceForward = { x: 0, y: 0, z: 1 };
    const threeForward = aliceForwardToThreeForward(aliceForward);

    expect(approxEqual(threeForward.x, 0)).toBe(true);
    expect(approxEqual(threeForward.y, 0)).toBe(true);
    expect(approxEqual(threeForward.z, -1)).toBe(true);
  });

  it("negates only the Z component of a forward direction", () => {
    const direction = { x: 0.5, y: 0.3, z: 0.8 };
    const converted = aliceForwardToThreeForward(direction);

    expect(approxEqual(converted.x, 0.5)).toBe(true);
    expect(approxEqual(converted.y, 0.3)).toBe(true);
    expect(approxEqual(converted.z, -0.8)).toBe(true);
  });

  it("preserves vector length", () => {
    const direction = { x: 1, y: 2, z: 3 };
    const converted = aliceForwardToThreeForward(direction);

    const originalLen = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2);
    const convertedLen = Math.sqrt(converted.x ** 2 + converted.y ** 2 + converted.z ** 2);
    expect(approxEqual(originalLen, convertedLen)).toBe(true);
  });

  it("handles zero vector", () => {
    const zero = { x: 0, y: 0, z: 0 };
    const converted = aliceForwardToThreeForward(zero);

    expect(converted.x).toBe(0);
    expect(converted.y).toBe(0);
    expect(converted.z).toBe(0);
  });
});

describe("threeForwardToAliceForward", () => {
  it("converts Three.js Z- forward to Alice Z+ forward", () => {
    const threeForward = { x: 0, y: 0, z: -1 };
    const aliceForward = threeForwardToAliceForward(threeForward);

    expect(approxEqual(aliceForward.x, 0)).toBe(true);
    expect(approxEqual(aliceForward.y, 0)).toBe(true);
    expect(approxEqual(aliceForward.z, 1)).toBe(true);
  });

  it("is the inverse of aliceForwardToThreeForward", () => {
    const original = { x: 0.7, y: -0.2, z: 0.5 };
    const roundtripped = threeForwardToAliceForward(aliceForwardToThreeForward(original));

    expect(approxEqual(roundtripped.x, original.x)).toBe(true);
    expect(approxEqual(roundtripped.y, original.y)).toBe(true);
    expect(approxEqual(roundtripped.z, original.z)).toBe(true);
  });
});
