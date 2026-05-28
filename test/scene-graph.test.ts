import { describe, it, expect, beforeEach } from "vitest";
import type { Vec3, Orientation } from "../src/story-api/types";
import {
  // Node classes
  SceneGraphNode,
  GroupNode,
  VisualNode,
  CameraNode,
  LightNode,
  // Container
  SceneGraph,
  // Types
  type Transform,
  type Color3,
  type LightType,
  // Quaternion utilities
  quaternionMultiply,
  quaternionFromAxisAngle,
  quaternionToAxisAngle,
  rotateVec3ByQuaternion,
  quaternionIdentity,
} from "../src/scene-graph";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IDENTITY_ORIENTATION: Orientation = { x: 0, y: 0, z: 0, w: 1 };

function identityTransform(): Transform {
  return {
    position: { x: 0, y: 0, z: 0 },
    orientation: { ...IDENTITY_ORIENTATION },
    scale: { x: 1, y: 1, z: 1 },
  };
}

function makeTransform(
  pos: Vec3,
  orient: Orientation = IDENTITY_ORIENTATION,
  scale: Vec3 = { x: 1, y: 1, z: 1 },
): Transform {
  return { position: pos, orientation: orient, scale };
}

/** Approximate equality for floating-point Vec3. */
function expectVec3Close(actual: Vec3, expected: Vec3, precision = 5): void {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.z).toBeCloseTo(expected.z, precision);
}

/** Approximate equality for quaternion. */
function expectQuatClose(
  actual: Orientation,
  expected: Orientation,
  precision = 5,
): void {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.z).toBeCloseTo(expected.z, precision);
  expect(actual.w).toBeCloseTo(expected.w, precision);
}

// ===========================================================================
// 1. VALUE TYPES — structural contracts
// ===========================================================================

describe("Value types", () => {
  describe("Transform", () => {
    it("has position, orientation, and scale fields", () => {
      const t: Transform = identityTransform();
      expect(t.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(t.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
      expect(t.scale).toEqual({ x: 1, y: 1, z: 1 });
    });
  });

  describe("Color3", () => {
    it("has r, g, b float fields 0–1", () => {
      const c: Color3 = { r: 0.5, g: 0.3, b: 0.9 };
      expect(c.r).toBe(0.5);
      expect(c.g).toBe(0.3);
      expect(c.b).toBe(0.9);
    });
  });

  describe("LightType", () => {
    it("accepts the three valid string literals", () => {
      const types: LightType[] = ["ambient", "directional", "point"];
      expect(types).toHaveLength(3);
    });
  });
});

// ===========================================================================
// 2. QUATERNION MATH UTILITIES
// ===========================================================================

describe("Quaternion math utilities", () => {
  describe("quaternionIdentity", () => {
    it("is { x: 0, y: 0, z: 0, w: 1 }", () => {
      expect(quaternionIdentity).toEqual({ x: 0, y: 0, z: 0, w: 1 });
      expect(Object.isFrozen(quaternionIdentity)).toBe(true);
    });
  });

  describe("quaternionFromAxisAngle", () => {
    it("creates identity for zero-angle rotation", () => {
      const q = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, 0);
      expectQuatClose(q, { x: 0, y: 0, z: 0, w: 1 });
    });

    it("creates 90° rotation around Y axis", () => {
      const q = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
      // sin(π/4) ≈ 0.70711, cos(π/4) ≈ 0.70711
      expect(q.x).toBeCloseTo(0, 5);
      expect(q.y).toBeCloseTo(Math.sin(Math.PI / 4), 5);
      expect(q.z).toBeCloseTo(0, 5);
      expect(q.w).toBeCloseTo(Math.cos(Math.PI / 4), 5);
    });

    it("creates 180° rotation around Z axis", () => {
      const q = quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI);
      expect(q.x).toBeCloseTo(0, 5);
      expect(q.y).toBeCloseTo(0, 5);
      expect(q.z).toBeCloseTo(1, 5); // sin(π/2) = 1
      expect(q.w).toBeCloseTo(0, 5); // cos(π/2) = 0
    });
  });

  describe("quaternionToAxisAngle", () => {
    it("round-trips with quaternionFromAxisAngle", () => {
      const axis: Vec3 = { x: 0, y: 1, z: 0 };
      const angle = Math.PI / 3; // 60°
      const q = quaternionFromAxisAngle(axis, angle);
      const { axis: outAxis, angle: outAngle } = quaternionToAxisAngle(q);
      expectVec3Close(outAxis, axis);
      expect(outAngle).toBeCloseTo(angle, 5);
    });

    it("handles identity quaternion gracefully", () => {
      const { angle } = quaternionToAxisAngle(quaternionIdentity);
      expect(angle).toBeCloseTo(0, 5);
    });
  });

  describe("quaternionMultiply", () => {
    it("multiplying by identity returns original", () => {
      const q = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 4);
      const result = quaternionMultiply(quaternionIdentity, q);
      expectQuatClose(result, q);
    });

    it("multiplying identity by q returns q", () => {
      const q = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 6);
      const result = quaternionMultiply(q, quaternionIdentity);
      expectQuatClose(result, q);
    });

    it("composes two 90° Y rotations into 180° Y rotation", () => {
      const q90 = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
      const q180 = quaternionMultiply(q90, q90);
      const expected = quaternionFromAxisAngle(
        { x: 0, y: 1, z: 0 },
        Math.PI,
      );
      expectQuatClose(q180, expected);
    });

    it("uses parent-first order (parent × child)", () => {
      // 90° around Y then 90° around X should differ from the reverse
      const rotY = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
      const rotX = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 2);
      const yx = quaternionMultiply(rotY, rotX);
      const xy = quaternionMultiply(rotX, rotY);
      // Non-commutative — results should differ
      const same =
        Math.abs(yx.x - xy.x) < 1e-6 &&
        Math.abs(yx.y - xy.y) < 1e-6 &&
        Math.abs(yx.z - xy.z) < 1e-6 &&
        Math.abs(yx.w - xy.w) < 1e-6;
      expect(same).toBe(false);
    });
  });

  describe("rotateVec3ByQuaternion", () => {
    it("rotating by identity returns original vector", () => {
      const v: Vec3 = { x: 3, y: -1, z: 7 };
      const result = rotateVec3ByQuaternion(v, quaternionIdentity);
      expectVec3Close(result, v);
    });

    it("90° Y rotation maps +X to -Z", () => {
      const q = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
      const result = rotateVec3ByQuaternion({ x: 1, y: 0, z: 0 }, q);
      expectVec3Close(result, { x: 0, y: 0, z: -1 });
    });

    it("90° X rotation maps +Y to +Z", () => {
      const q = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 2);
      const result = rotateVec3ByQuaternion({ x: 0, y: 1, z: 0 }, q);
      expectVec3Close(result, { x: 0, y: 0, z: 1 });
    });

    it("180° Z rotation maps +X to -X", () => {
      const q = quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI);
      const result = rotateVec3ByQuaternion({ x: 1, y: 0, z: 0 }, q);
      expectVec3Close(result, { x: -1, y: 0, z: 0 });
    });
  });
});

// ===========================================================================
// 3. SceneGraphNode — base behavior (tested via GroupNode)
// ===========================================================================

describe("SceneGraphNode (base)", () => {
  describe("Node IDs", () => {
    it("auto-increments across node instances", () => {
      const a = new GroupNode("a");
      const b = new GroupNode("b");
      expect(b.id).toBeGreaterThan(a.id);
    });

    it("IDs are unique across different node types", () => {
      const g = new GroupNode("g");
      const v = new VisualNode("v");
      const c = new CameraNode("c");
      const l = new LightNode("l", "point");
      const ids = [g.id, v.id, c.id, l.id];
      expect(new Set(ids).size).toBe(4);
    });
  });

  describe("name", () => {
    it("stores the user-provided name", () => {
      const node = new GroupNode("myNode");
      expect(node.name).toBe("myNode");
    });
  });

  describe("parent", () => {
    it("is null for a standalone node", () => {
      const node = new GroupNode("solo");
      expect(node.parent).toBeNull();
    });

    it("is set when added as child", () => {
      const parent = new GroupNode("parent");
      const child = new GroupNode("child");
      parent.addChild(child);
      expect(child.parent).toBe(parent);
    });
  });

  describe("children", () => {
    it("starts empty", () => {
      const node = new GroupNode("empty");
      expect(node.children).toEqual([]);
    });

    it("returns a snapshot (not the internal array)", () => {
      const parent = new GroupNode("p");
      const child = new GroupNode("c");
      parent.addChild(child);
      const snap = parent.children;
      expect(snap).toHaveLength(1);
      // Mutating snapshot should not affect internal state
      (snap as SceneGraphNode[]).push(new GroupNode("intruder"));
      expect(parent.children).toHaveLength(1);
    });
  });

  describe("localTransform", () => {
    it("defaults to identity transform", () => {
      const node = new GroupNode("node");
      const t = node.localTransform;
      expect(t.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(t.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
      expect(t.scale).toEqual({ x: 1, y: 1, z: 1 });
    });

    it("round-trips a set transform", () => {
      const node = new GroupNode("node");
      const t = makeTransform(
        { x: 1, y: 2, z: 3 },
        { x: 0, y: 0.707, z: 0, w: 0.707 },
        { x: 2, y: 1, z: 0.5 },
      );
      node.localTransform = t;
      expect(node.localTransform.position).toEqual({ x: 1, y: 2, z: 3 });
      expect(node.localTransform.orientation.y).toBeCloseTo(0.707);
      expect(node.localTransform.scale).toEqual({ x: 2, y: 1, z: 0.5 });
    });
  });

  describe("worldTransform", () => {
    it("equals localTransform for root-level nodes (no parent)", () => {
      const node = new GroupNode("root-level");
      node.localTransform = makeTransform({ x: 5, y: 0, z: -3 });
      const world = node.worldTransform;
      expect(world.position).toEqual({ x: 5, y: 0, z: -3 });
    });
  });
});

// ===========================================================================
// 4. GroupNode
// ===========================================================================

describe("GroupNode", () => {
  it("is a non-visual container with no extra properties", () => {
    const group = new GroupNode("container");
    expect(group.name).toBe("container");
    expect(group.children).toEqual([]);
    // Should be an instance of SceneGraphNode
    expect(group).toBeInstanceOf(SceneGraphNode);
  });

  it("can hold children of any node type", () => {
    const group = new GroupNode("root");
    group.addChild(new GroupNode("sub"));
    group.addChild(new VisualNode("mesh"));
    group.addChild(new CameraNode("cam"));
    group.addChild(new LightNode("light", "ambient"));
    expect(group.children).toHaveLength(4);
  });
});

// ===========================================================================
// 5. VisualNode
// ===========================================================================

describe("VisualNode", () => {
  let visual: VisualNode;

  beforeEach(() => {
    visual = new VisualNode("mesh1");
  });

  it("is an instance of SceneGraphNode", () => {
    expect(visual).toBeInstanceOf(SceneGraphNode);
  });

  describe("meshRef", () => {
    it("defaults to null", () => {
      expect(visual.meshRef).toBeNull();
    });

    it("can be set to a string path", () => {
      visual.meshRef = "models/table.glb";
      expect(visual.meshRef).toBe("models/table.glb");
    });

    it("can be set back to null", () => {
      visual.meshRef = "models/chair.glb";
      visual.meshRef = null;
      expect(visual.meshRef).toBeNull();
    });
  });

  describe("color", () => {
    it("defaults to white { r: 1, g: 1, b: 1 }", () => {
      expect(visual.color).toEqual({ r: 1, g: 1, b: 1 });
    });

    it("can be set to a custom color", () => {
      visual.color = { r: 0.6, g: 0.3, b: 0.1 };
      expect(visual.color).toEqual({ r: 0.6, g: 0.3, b: 0.1 });
    });
  });

  describe("opacity", () => {
    it("defaults to 1.0", () => {
      expect(visual.opacity).toBe(1.0);
    });

    it("can be set to a valid value", () => {
      visual.opacity = 0.5;
      expect(visual.opacity).toBe(0.5);
    });

    it("clamps values above 1 to 1", () => {
      visual.opacity = 1.5;
      expect(visual.opacity).toBe(1);
    });

    it("clamps values below 0 to 0", () => {
      visual.opacity = -0.3;
      expect(visual.opacity).toBe(0);
    });

    it("rejects NaN (keeps previous value)", () => {
      visual.opacity = 0.7;
      visual.opacity = NaN;
      expect(visual.opacity).toBe(0.7);
    });

    it("rejects Infinity (keeps previous value)", () => {
      visual.opacity = 0.8;
      visual.opacity = Infinity;
      expect(visual.opacity).toBe(0.8);
    });

    it("rejects -Infinity (keeps previous value)", () => {
      visual.opacity = 0.6;
      visual.opacity = -Infinity;
      expect(visual.opacity).toBe(0.6);
    });
  });

  describe("visible", () => {
    it("defaults to true", () => {
      expect(visual.visible).toBe(true);
    });

    it("can be set to false", () => {
      visual.visible = false;
      expect(visual.visible).toBe(false);
    });

    it("can be toggled back to true", () => {
      visual.visible = false;
      visual.visible = true;
      expect(visual.visible).toBe(true);
    });
  });
});

// ===========================================================================
// 6. CameraNode
// ===========================================================================

describe("CameraNode", () => {
  let cam: CameraNode;

  beforeEach(() => {
    cam = new CameraNode("testCam");
  });

  it("is an instance of SceneGraphNode", () => {
    expect(cam).toBeInstanceOf(SceneGraphNode);
  });

  describe("fov", () => {
    it("defaults to 60", () => {
      expect(cam.fov).toBe(60);
    });

    it("can be set to a positive value", () => {
      cam.fov = 75;
      expect(cam.fov).toBe(75);
    });

    it("rejects zero (keeps previous value)", () => {
      cam.fov = 90;
      cam.fov = 0;
      expect(cam.fov).toBe(90);
    });

    it("rejects negative (keeps previous value)", () => {
      cam.fov = 90;
      cam.fov = -10;
      expect(cam.fov).toBe(90);
    });

    it("rejects NaN (keeps previous value)", () => {
      cam.fov = 45;
      cam.fov = NaN;
      expect(cam.fov).toBe(45);
    });
  });

  describe("near", () => {
    it("defaults to 0.1", () => {
      expect(cam.near).toBeCloseTo(0.1);
    });

    it("can be set to a positive value", () => {
      cam.near = 0.5;
      expect(cam.near).toBe(0.5);
    });

    it("rejects zero (keeps previous value)", () => {
      cam.near = 0.5;
      cam.near = 0;
      expect(cam.near).toBe(0.5);
    });

    it("rejects negative (keeps previous value)", () => {
      cam.near = 0.5;
      cam.near = -1;
      expect(cam.near).toBe(0.5);
    });
  });

  describe("far", () => {
    it("defaults to 1000", () => {
      expect(cam.far).toBe(1000);
    });

    it("can be set to a positive value", () => {
      cam.far = 500;
      expect(cam.far).toBe(500);
    });

    it("rejects zero (keeps previous value)", () => {
      cam.far = 500;
      cam.far = 0;
      expect(cam.far).toBe(500);
    });

    it("rejects value less than near (keeps previous value)", () => {
      cam.near = 1;
      cam.far = 0.5;
      expect(cam.far).toBe(1000);
    });
  });

  describe("aspect", () => {
    it("defaults to 16/9", () => {
      expect(cam.aspect).toBeCloseTo(16 / 9);
    });

    it("can be set to a custom ratio", () => {
      cam.aspect = 4 / 3;
      expect(cam.aspect).toBeCloseTo(4 / 3);
    });
  });
});

// ===========================================================================
// 7. LightNode
// ===========================================================================

describe("LightNode", () => {
  it("is an instance of SceneGraphNode", () => {
    const light = new LightNode("sun", "directional");
    expect(light).toBeInstanceOf(SceneGraphNode);
  });

  describe("lightType", () => {
    it("is set at construction and readonly", () => {
      const ambient = new LightNode("ambient", "ambient");
      expect(ambient.lightType).toBe("ambient");

      const dir = new LightNode("dir", "directional");
      expect(dir.lightType).toBe("directional");

      const point = new LightNode("point", "point");
      expect(point.lightType).toBe("point");
    });
  });

  describe("color", () => {
    it("defaults to white { r: 1, g: 1, b: 1 }", () => {
      const light = new LightNode("l", "ambient");
      expect(light.color).toEqual({ r: 1, g: 1, b: 1 });
    });

    it("can be set to a custom color", () => {
      const light = new LightNode("l", "point");
      light.color = { r: 0.4, g: 0.4, b: 0.5 };
      expect(light.color).toEqual({ r: 0.4, g: 0.4, b: 0.5 });
    });
  });

  describe("intensity", () => {
    it("defaults to 1.0", () => {
      const light = new LightNode("l", "directional");
      expect(light.intensity).toBe(1.0);
    });

    it("can be set to a valid value", () => {
      const light = new LightNode("l", "point");
      light.intensity = 2.0;
      expect(light.intensity).toBe(2.0);
    });

    it("clamps values above 10 to 10", () => {
      const light = new LightNode("l", "point");
      light.intensity = 15;
      expect(light.intensity).toBe(10);
    });

    it("clamps values below 0 to 0", () => {
      const light = new LightNode("l", "point");
      light.intensity = -5;
      expect(light.intensity).toBe(0);
    });

    it("rejects NaN (keeps previous value)", () => {
      const light = new LightNode("l", "ambient");
      light.intensity = 3.0;
      light.intensity = NaN;
      expect(light.intensity).toBe(3.0);
    });

    it("rejects Infinity (keeps previous value)", () => {
      const light = new LightNode("l", "point");
      light.intensity = 5;
      light.intensity = Infinity;
      expect(light.intensity).toBe(5);
    });
  });
});

// ===========================================================================
// 8. TREE OPERATIONS
// ===========================================================================

describe("Tree operations", () => {
  describe("addChild", () => {
    it("adds a child to the children list", () => {
      const parent = new GroupNode("parent");
      const child = new GroupNode("child");
      parent.addChild(child);
      expect(parent.children).toContain(child);
      expect(parent.children).toHaveLength(1);
    });

    it("sets the child parent reference", () => {
      const parent = new GroupNode("parent");
      const child = new VisualNode("vis");
      parent.addChild(child);
      expect(child.parent).toBe(parent);
    });

    it("allows multiple children", () => {
      const parent = new GroupNode("parent");
      const a = new GroupNode("a");
      const b = new VisualNode("b");
      const c = new CameraNode("c");
      parent.addChild(a);
      parent.addChild(b);
      parent.addChild(c);
      expect(parent.children).toHaveLength(3);
    });
  });

  describe("removeChild", () => {
    it("removes a child and returns true", () => {
      const parent = new GroupNode("parent");
      const child = new GroupNode("child");
      parent.addChild(child);
      const result = parent.removeChild(child);
      expect(result).toBe(true);
      expect(parent.children).toHaveLength(0);
    });

    it("clears the child parent reference", () => {
      const parent = new GroupNode("parent");
      const child = new GroupNode("child");
      parent.addChild(child);
      parent.removeChild(child);
      expect(child.parent).toBeNull();
    });

    it("returns false for a non-child node", () => {
      const parent = new GroupNode("parent");
      const stranger = new GroupNode("stranger");
      const result = parent.removeChild(stranger);
      expect(result).toBe(false);
    });

    it("preserves order of remaining children", () => {
      const parent = new GroupNode("parent");
      const a = new GroupNode("a");
      const b = new GroupNode("b");
      const c = new GroupNode("c");
      parent.addChild(a);
      parent.addChild(b);
      parent.addChild(c);
      parent.removeChild(b);
      expect(parent.children.map((n) => n.name)).toEqual(["a", "c"]);
    });
  });

  describe("hasChild", () => {
    it("returns true for direct children", () => {
      const parent = new GroupNode("parent");
      const child = new GroupNode("child");
      parent.addChild(child);
      expect(parent.hasChild(child)).toBe(true);
    });

    it("returns false for non-children", () => {
      const parent = new GroupNode("parent");
      const stranger = new GroupNode("stranger");
      expect(parent.hasChild(stranger)).toBe(false);
    });

    it("returns false for grandchildren (direct check only)", () => {
      const grand = new GroupNode("grand");
      const parent = new GroupNode("parent");
      const child = new GroupNode("child");
      grand.addChild(parent);
      parent.addChild(child);
      expect(grand.hasChild(child)).toBe(false);
    });
  });

  describe("re-parenting", () => {
    it("removes from previous parent when added to new parent", () => {
      const groupA = new GroupNode("a");
      const groupB = new GroupNode("b");
      const item = new VisualNode("item");

      groupA.addChild(item);
      expect(item.parent).toBe(groupA);

      groupB.addChild(item);
      expect(item.parent).toBe(groupB);
      expect(groupA.children).toHaveLength(0);
      expect(groupB.children).toContain(item);
    });

    it("handles re-parenting within same tree", () => {
      const root = new GroupNode("root");
      const branchA = new GroupNode("branchA");
      const branchB = new GroupNode("branchB");
      const leaf = new VisualNode("leaf");

      root.addChild(branchA);
      root.addChild(branchB);
      branchA.addChild(leaf);

      branchB.addChild(leaf); // move from branchA to branchB
      expect(branchA.children).toHaveLength(0);
      expect(branchB.children).toContain(leaf);
      expect(leaf.parent).toBe(branchB);
    });
  });

  describe("cycle prevention", () => {
    it("throws when adding a node as its own child", () => {
      const node = new GroupNode("self");
      expect(() => node.addChild(node)).toThrow(
        "Cannot add node as its own child",
      );
    });

    it("throws when adding an ancestor as child", () => {
      const parent = new GroupNode("parent");
      const child = new GroupNode("child");
      parent.addChild(child);

      expect(() => child.addChild(parent)).toThrow("cycle detected");
    });

    it("throws for deep ancestor cycles", () => {
      const a = new GroupNode("a");
      const b = new GroupNode("b");
      const c = new GroupNode("c");
      const d = new GroupNode("d");
      a.addChild(b);
      b.addChild(c);
      c.addChild(d);

      expect(() => d.addChild(a)).toThrow("cycle detected");
    });

    it("allows non-ancestor nodes from different branches", () => {
      const root = new GroupNode("root");
      const branchA = new GroupNode("branchA");
      const branchB = new GroupNode("branchB");
      root.addChild(branchA);
      root.addChild(branchB);

      // branchA is not an ancestor of branchB, so this is allowed
      // (re-parenting branchA under branchB)
      branchB.addChild(branchA);
      expect(branchA.parent).toBe(branchB);
    });
  });
});

// ===========================================================================
// 9. WORLD TRANSFORM COMPUTATION
// ===========================================================================

describe("World transform computation", () => {
  describe("identity chain", () => {
    it("returns identity when all transforms are identity", () => {
      const root = new GroupNode("root");
      const child = new GroupNode("child");
      const grandchild = new VisualNode("grandchild");
      root.addChild(child);
      child.addChild(grandchild);

      const world = grandchild.worldTransform;
      expect(world.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(world.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
      expect(world.scale).toEqual({ x: 1, y: 1, z: 1 });
    });
  });

  describe("position composition", () => {
    it("adds parent offset to child position (no rotation)", () => {
      const arm = new GroupNode("arm");
      arm.localTransform = makeTransform({ x: 2, y: 0, z: 0 });

      const hand = new VisualNode("hand");
      hand.localTransform = makeTransform({ x: 1, y: 0, z: 0 });
      arm.addChild(hand);

      expectVec3Close(hand.worldTransform.position, { x: 3, y: 0, z: 0 });
    });

    it("accumulates positions through three levels", () => {
      const a = new GroupNode("a");
      const b = new GroupNode("b");
      const c = new VisualNode("c");
      a.localTransform = makeTransform({ x: 1, y: 0, z: 0 });
      b.localTransform = makeTransform({ x: 0, y: 2, z: 0 });
      c.localTransform = makeTransform({ x: 0, y: 0, z: 3 });
      a.addChild(b);
      b.addChild(c);

      expectVec3Close(c.worldTransform.position, { x: 1, y: 2, z: 3 });
    });

    it("applies parent rotation to child position", () => {
      const parent = new GroupNode("parent");
      // 90° rotation around Y — maps +X to -Z
      parent.localTransform = makeTransform(
        { x: 0, y: 0, z: 0 },
        quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2),
      );

      const child = new VisualNode("child");
      // Child is at +X in local space
      child.localTransform = makeTransform({ x: 1, y: 0, z: 0 });
      parent.addChild(child);

      // Parent rotation maps child's +X to -Z in world space
      expectVec3Close(child.worldTransform.position, { x: 0, y: 0, z: -1 });
    });

    it("applies parent scale to child position", () => {
      const parent = new GroupNode("parent");
      parent.localTransform = makeTransform(
        { x: 0, y: 0, z: 0 },
        IDENTITY_ORIENTATION,
        { x: 2, y: 2, z: 2 },
      );

      const child = new VisualNode("child");
      child.localTransform = makeTransform({ x: 1, y: 1, z: 1 });
      parent.addChild(child);

      // Parent scale doubles the child's local position
      expectVec3Close(child.worldTransform.position, { x: 2, y: 2, z: 2 });
    });

    it("applies parent position + rotation + scale together", () => {
      const parent = new GroupNode("parent");
      // Parent: at (10,0,0), 90° Y rotation, scale 2x
      parent.localTransform = makeTransform(
        { x: 10, y: 0, z: 0 },
        quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2),
        { x: 2, y: 2, z: 2 },
      );

      const child = new VisualNode("child");
      child.localTransform = makeTransform({ x: 1, y: 0, z: 0 });
      parent.addChild(child);

      // Child local (1,0,0) → scaled by 2 → (2,0,0) → rotated 90° Y → (0,0,-2) → + parent pos → (10,0,-2)
      expectVec3Close(child.worldTransform.position, { x: 10, y: 0, z: -2 });
    });
  });

  describe("orientation composition", () => {
    it("composes parent and child orientations (parent-first)", () => {
      const parent = new GroupNode("parent");
      const rotY90 = quaternionFromAxisAngle(
        { x: 0, y: 1, z: 0 },
        Math.PI / 2,
      );
      parent.localTransform = makeTransform({ x: 0, y: 0, z: 0 }, rotY90);

      const child = new VisualNode("child");
      const rotX90 = quaternionFromAxisAngle(
        { x: 1, y: 0, z: 0 },
        Math.PI / 2,
      );
      child.localTransform = makeTransform({ x: 0, y: 0, z: 0 }, rotX90);
      parent.addChild(child);

      const expected = quaternionMultiply(rotY90, rotX90);
      expectQuatClose(child.worldTransform.orientation, expected);
    });
  });

  describe("scale composition", () => {
    it("component-wise multiplies parent and child scales", () => {
      const parent = new GroupNode("parent");
      parent.localTransform = makeTransform(
        { x: 0, y: 0, z: 0 },
        IDENTITY_ORIENTATION,
        { x: 2, y: 3, z: 0.5 },
      );

      const child = new VisualNode("child");
      child.localTransform = makeTransform(
        { x: 0, y: 0, z: 0 },
        IDENTITY_ORIENTATION,
        { x: 4, y: 1, z: 2 },
      );
      parent.addChild(child);

      expectVec3Close(child.worldTransform.scale, { x: 8, y: 3, z: 1 });
    });

    it("accumulates scale through three levels", () => {
      const a = new GroupNode("a");
      const b = new GroupNode("b");
      const c = new VisualNode("c");
      a.localTransform = makeTransform(
        { x: 0, y: 0, z: 0 },
        IDENTITY_ORIENTATION,
        { x: 2, y: 2, z: 2 },
      );
      b.localTransform = makeTransform(
        { x: 0, y: 0, z: 0 },
        IDENTITY_ORIENTATION,
        { x: 0.5, y: 0.5, z: 0.5 },
      );
      c.localTransform = makeTransform(
        { x: 0, y: 0, z: 0 },
        IDENTITY_ORIENTATION,
        { x: 3, y: 3, z: 3 },
      );
      a.addChild(b);
      b.addChild(c);

      // 2 * 0.5 * 3 = 3
      expectVec3Close(c.worldTransform.scale, { x: 3, y: 3, z: 3 });
    });
  });

  describe("doc example: arm → hand", () => {
    it("matches the documented example", () => {
      const graph = new SceneGraph();

      const arm = new GroupNode("arm");
      arm.localTransform = makeTransform(
        { x: 2, y: 0, z: 0 },
        IDENTITY_ORIENTATION,
        { x: 1, y: 1, z: 1 },
      );

      const hand = new VisualNode("hand");
      hand.localTransform = makeTransform(
        { x: 1, y: 0, z: 0 },
        IDENTITY_ORIENTATION,
        { x: 0.5, y: 0.5, z: 0.5 },
      );
      arm.addChild(hand);
      graph.root.addChild(arm);

      expectVec3Close(hand.worldTransform.position, { x: 3, y: 0, z: 0 });
      expectVec3Close(hand.worldTransform.scale, {
        x: 0.5,
        y: 0.5,
        z: 0.5,
      });
    });
  });
});

// ===========================================================================
// 10. TRAVERSAL
// ===========================================================================

describe("Traversal", () => {
  let graph: SceneGraph;
  let room: GroupNode;
  let table: VisualNode;
  let cam: CameraNode;
  let sun: LightNode;

  beforeEach(() => {
    graph = new SceneGraph();
    room = new GroupNode("room");
    table = new VisualNode("table");
    cam = new CameraNode("mainCamera");
    sun = new LightNode("sun", "directional");

    graph.root.addChild(room);
    room.addChild(table);
    graph.root.addChild(cam);
    graph.root.addChild(sun);
  });

  describe("depth-first pre-order", () => {
    it("visits parent before children", () => {
      const names: string[] = [];
      graph.traverse((node) => names.push(node.name));
      expect(names).toEqual(["root", "room", "table", "mainCamera", "sun"]);
    });
  });

  describe("per-node traverse", () => {
    it("traverses from a subtree root", () => {
      const names: string[] = [];
      room.traverse((node) => names.push(node.name));
      expect(names).toEqual(["room", "table"]);
    });
  });

  describe("find", () => {
    it("returns the first node matching a predicate", () => {
      const found = graph.find((n) => n instanceof CameraNode);
      expect(found).toBe(cam);
    });

    it("returns null when no match found", () => {
      const found = graph.find((n) => n.name === "nonexistent");
      expect(found).toBeNull();
    });

    it("finds in depth-first order", () => {
      const firstNonRoot = graph.find((n) => n !== graph.root);
      expect(firstNonRoot).toBe(room);
    });
  });

  describe("findAll", () => {
    it("returns all nodes matching a predicate", () => {
      const groups = graph.findAll((n) => n instanceof GroupNode);
      const names = groups.map((n) => n.name);
      expect(names).toContain("root");
      expect(names).toContain("room");
      expect(groups).toHaveLength(2);
    });

    it("returns empty array when no match", () => {
      const result = graph.findAll((n) => n.name === "nope");
      expect(result).toEqual([]);
    });

    it("finds all visuals", () => {
      const visuals = graph.findAll((n) => n instanceof VisualNode);
      expect(visuals).toEqual([table]);
    });
  });
});

// ===========================================================================
// 11. SCENE GRAPH CONTAINER
// ===========================================================================

describe("SceneGraph container", () => {
  let graph: SceneGraph;

  beforeEach(() => {
    graph = new SceneGraph();
  });

  describe("construction", () => {
    it("has a pre-created root GroupNode named 'root'", () => {
      expect(graph.root).toBeInstanceOf(GroupNode);
      expect(graph.root.name).toBe("root");
    });

    it("root has no parent", () => {
      expect(graph.root.parent).toBeNull();
    });
  });

  describe("nodeCount", () => {
    it("is 1 after construction (just root)", () => {
      expect(graph.nodeCount).toBe(1);
    });

    it("increases as nodes are added", () => {
      graph.root.addChild(new GroupNode("a"));
      graph.root.addChild(new VisualNode("b"));
      expect(graph.nodeCount).toBe(3);
    });

    it("includes deeply nested nodes", () => {
      const sub = new GroupNode("sub");
      sub.addChild(new VisualNode("leaf"));
      graph.root.addChild(sub);
      expect(graph.nodeCount).toBe(3); // root, sub, leaf
    });
  });

  describe("getNodeById", () => {
    it("returns root by its id", () => {
      const found = graph.getNodeById(graph.root.id);
      expect(found).toBe(graph.root);
    });

    it("returns a child node by id", () => {
      const child = new GroupNode("child");
      graph.root.addChild(child);
      const found = graph.getNodeById(child.id);
      expect(found).toBe(child);
    });

    it("returns null for unknown id", () => {
      expect(graph.getNodeById(999999)).toBeNull();
    });
  });

  describe("getNodesByName", () => {
    it("returns nodes matching a name", () => {
      graph.root.addChild(new GroupNode("foo"));
      graph.root.addChild(new VisualNode("foo"));
      const results = graph.getNodesByName("foo");
      expect(results).toHaveLength(2);
    });

    it("returns empty array for unknown name", () => {
      expect(graph.getNodesByName("missing")).toEqual([]);
    });

    it("finds root by name", () => {
      const results = graph.getNodesByName("root");
      expect(results).toHaveLength(1);
      expect(results[0]).toBe(graph.root);
    });
  });

  describe("removeNode", () => {
    it("removes a child and its descendants", () => {
      const parent = new GroupNode("parent");
      const child = new VisualNode("child");
      parent.addChild(child);
      graph.root.addChild(parent);

      const result = graph.removeNode(parent);
      expect(result).toBe(true);
      expect(graph.root.children).toHaveLength(0);
      expect(graph.nodeCount).toBe(1); // just root
    });

    it("returns false for a node not in the tree", () => {
      const orphan = new GroupNode("orphan");
      expect(graph.removeNode(orphan)).toBe(false);
    });

    it("throws when trying to remove the root node", () => {
      expect(() => graph.removeNode(graph.root)).toThrow(
        "Cannot remove root node",
      );
    });

    it("clears parent reference of removed node", () => {
      const child = new GroupNode("child");
      graph.root.addChild(child);
      graph.removeNode(child);
      expect(child.parent).toBeNull();
    });
  });

  describe("clear", () => {
    it("removes all children from root", () => {
      graph.root.addChild(new GroupNode("a"));
      graph.root.addChild(new VisualNode("b"));
      graph.root.addChild(new CameraNode("c"));
      graph.clear();
      expect(graph.root.children).toHaveLength(0);
      expect(graph.nodeCount).toBe(1);
    });

    it("root still exists after clear", () => {
      graph.clear();
      expect(graph.root).toBeDefined();
      expect(graph.root.name).toBe("root");
    });

    it("node IDs keep incrementing after clear (no reset)", () => {
      const before = new GroupNode("before");
      graph.root.addChild(before);
      const idBefore = before.id;

      graph.clear();

      const after = new GroupNode("after");
      expect(after.id).toBeGreaterThan(idBefore);
    });
  });
});

// ===========================================================================
// 12. VALIDATION
// ===========================================================================

describe("Validation", () => {
  describe("Transform validation", () => {
    it("rejects position with NaN (keeps previous)", () => {
      const node = new GroupNode("n");
      node.localTransform = makeTransform({ x: 5, y: 0, z: 0 });
      node.localTransform = makeTransform({ x: NaN, y: 0, z: 0 });
      expect(node.localTransform.position.x).toBe(5);
    });

    it("rejects position with Infinity (keeps previous)", () => {
      const node = new GroupNode("n");
      node.localTransform = makeTransform({ x: 1, y: 2, z: 3 });
      node.localTransform = makeTransform({ x: Infinity, y: 2, z: 3 });
      expect(node.localTransform.position.x).toBe(1);
    });

    it("rejects orientation with NaN (keeps previous)", () => {
      const node = new GroupNode("n");
      const valid = makeTransform(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0.5, z: 0, w: 0.866 },
      );
      node.localTransform = valid;
      node.localTransform = makeTransform(
        { x: 0, y: 0, z: 0 },
        { x: NaN, y: 0, z: 0, w: 1 },
      );
      expect(node.localTransform.orientation.y).toBeCloseTo(0.5);
    });

    it("rejects scale with NaN (keeps previous)", () => {
      const node = new GroupNode("n");
      node.localTransform = makeTransform(
        { x: 0, y: 0, z: 0 },
        IDENTITY_ORIENTATION,
        { x: 2, y: 2, z: 2 },
      );
      node.localTransform = makeTransform(
        { x: 0, y: 0, z: 0 },
        IDENTITY_ORIENTATION,
        { x: NaN, y: 2, z: 2 },
      );
      expect(node.localTransform.scale.x).toBe(2);
    });

    it("accepts valid finite transform values", () => {
      const node = new GroupNode("n");
      const t = makeTransform(
        { x: -100, y: 0.001, z: 999 },
        { x: 0, y: 0, z: 0, w: 1 },
        { x: 0.01, y: 100, z: 1 },
      );
      node.localTransform = t;
      expect(node.localTransform.position.x).toBe(-100);
      expect(node.localTransform.scale.y).toBe(100);
    });
  });

  describe("CameraNode validation", () => {
    it("rejects fov = NaN", () => {
      const cam = new CameraNode("cam");
      cam.fov = NaN;
      expect(cam.fov).toBe(60); // default kept
    });

    it("rejects near = 0", () => {
      const cam = new CameraNode("cam");
      cam.near = 0;
      expect(cam.near).toBeCloseTo(0.1); // default kept
    });

    it("rejects far < near", () => {
      const cam = new CameraNode("cam");
      cam.near = 10;
      cam.far = 5; // less than near
      expect(cam.far).toBe(1000); // default kept
    });
  });
});

// ===========================================================================
// 13. ERROR HANDLING
// ===========================================================================

describe("Error handling", () => {
  it("self-add throws 'Cannot add node as its own child'", () => {
    const node = new GroupNode("n");
    expect(() => node.addChild(node)).toThrow(
      "Cannot add node as its own child",
    );
  });

  it("cycle throws 'Cannot add ancestor as child — cycle detected'", () => {
    const p = new GroupNode("p");
    const c = new GroupNode("c");
    p.addChild(c);
    expect(() => c.addChild(p)).toThrow(
      "Cannot add ancestor as child — cycle detected",
    );
  });

  it("removing root throws 'Cannot remove root node'", () => {
    const graph = new SceneGraph();
    expect(() => graph.removeNode(graph.root)).toThrow(
      "Cannot remove root node",
    );
  });
});

// ===========================================================================
// 14. EDGE CASES
// ===========================================================================

describe("Edge cases", () => {
  it("empty graph traversal visits only root", () => {
    const graph = new SceneGraph();
    const names: string[] = [];
    graph.traverse((n) => names.push(n.name));
    expect(names).toEqual(["root"]);
  });

  it("removing a childless node works", () => {
    const graph = new SceneGraph();
    const leaf = new VisualNode("leaf");
    graph.root.addChild(leaf);
    graph.removeNode(leaf);
    expect(graph.root.children).toHaveLength(0);
  });

  it("node find on empty subtree returns null", () => {
    const node = new GroupNode("empty");
    // find on node itself should find itself if predicate matches
    const found = node.find((n) => n.name === "empty");
    expect(found).toBe(node);
  });

  it("findAll on leaf node returns empty if predicate excludes it", () => {
    const leaf = new VisualNode("leaf");
    const result = leaf.findAll((n) => n.name === "other");
    expect(result).toEqual([]);
  });

  it("deep nesting (100 levels) world transform computes correctly", () => {
    let current: SceneGraphNode = new GroupNode("root");
    for (let i = 0; i < 99; i++) {
      const child = new GroupNode(`level${i}`);
      child.localTransform = makeTransform({ x: 1, y: 0, z: 0 });
      current.addChild(child);
      current = child;
    }
    // Last node should have worldTransform.position.x ≈ 99
    expectVec3Close(current.worldTransform.position, { x: 99, y: 0, z: 0 });
  });

  it("multiple nodes can share the same name", () => {
    const graph = new SceneGraph();
    graph.root.addChild(new GroupNode("duplicate"));
    graph.root.addChild(new VisualNode("duplicate"));
    graph.root.addChild(new LightNode("duplicate", "ambient"));
    const results = graph.getNodesByName("duplicate");
    expect(results).toHaveLength(3);
  });

  it("re-parenting updates world transform", () => {
    const a = new GroupNode("a");
    a.localTransform = makeTransform({ x: 10, y: 0, z: 0 });
    const b = new GroupNode("b");
    b.localTransform = makeTransform({ x: 20, y: 0, z: 0 });
    const child = new VisualNode("child");
    child.localTransform = makeTransform({ x: 1, y: 0, z: 0 });

    a.addChild(child);
    expectVec3Close(child.worldTransform.position, { x: 11, y: 0, z: 0 });

    b.addChild(child); // re-parent
    expectVec3Close(child.worldTransform.position, { x: 21, y: 0, z: 0 });
  });

  it("instanceof checks work for type-specific queries", () => {
    const graph = new SceneGraph();
    graph.root.addChild(new GroupNode("g"));
    graph.root.addChild(new VisualNode("v"));
    graph.root.addChild(new CameraNode("c"));
    graph.root.addChild(new LightNode("l", "point"));

    const cameras = graph.findAll((n) => n instanceof CameraNode);
    expect(cameras).toHaveLength(1);
    expect((cameras[0] as CameraNode).fov).toBe(60);

    const lights = graph.findAll((n) => n instanceof LightNode);
    expect(lights).toHaveLength(1);
    expect((lights[0] as LightNode).lightType).toBe("point");

    const visuals = graph.findAll(
      (n) => n instanceof VisualNode && n.visible,
    );
    expect(visuals).toHaveLength(1);
  });
});
