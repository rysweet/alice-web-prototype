import { describe, it, expect, beforeAll } from "vitest";
import {
  // Value types
  type Position,
  type Orientation,
  type Size,
  type JointId,
  // Entity hierarchy
  SThing,
  SGround,
  SScene as SSceneEntity,
  STurnable,
  SMovableTurnable,
  SCamera,
  SModel,
  SJointedModel,
  SBiped,
  SFlyer,
  SQuadruped,
  SProp,
  // Scene container
  Scene,
} from "../src/story-api";
import type { AliceProject, AliceObject } from "../src/a3p-parser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal AliceProject for fromProject tests. */
function makeProject(objects: AliceObject[]): AliceProject {
  return {
    version: "3.6",
    projectName: "TestProject",
    sceneObjects: objects,
    methods: [],
  };
}

function makeAliceObject(
  overrides: Partial<AliceObject> & { name: string; typeName: string },
): AliceObject {
  return {
    resourceType: null,
    position: null,
    orientation: null,
    size: null,
    ...overrides,
  };
}

// ===========================================================================
// 1. VALUE TYPES — structural contracts
// ===========================================================================

describe("Value types", () => {
  it("Position has x, y, z number fields", () => {
    const pos: Position = { x: 1, y: 2, z: 3 };
    expect(pos.x).toBe(1);
    expect(pos.y).toBe(2);
    expect(pos.z).toBe(3);
  });

  it("Orientation has x, y, z, w number fields (quaternion)", () => {
    const ori: Orientation = { x: 0, y: 0, z: 0, w: 1 };
    expect(ori.x).toBe(0);
    expect(ori.w).toBe(1);
  });

  it("Size has width, height, depth number fields", () => {
    const sz: Size = { width: 2, height: 3, depth: 4 };
    expect(sz.width).toBe(2);
    expect(sz.height).toBe(3);
    expect(sz.depth).toBe(4);
  });

  it("JointId has name and optional parent", () => {
    const joint: JointId = { name: "LEFT_SHOULDER" };
    expect(joint.name).toBe("LEFT_SHOULDER");
    expect(joint.parent).toBeUndefined();

    const child: JointId = { name: "LEFT_ELBOW", parent: "LEFT_SHOULDER" };
    expect(child.parent).toBe("LEFT_SHOULDER");
  });
});

// ===========================================================================
// 2. ENTITY CONSTRUCTION — default values
// ===========================================================================

describe("Entity construction", () => {
  it("SBiped has default position {0,0,0}", () => {
    const b = new SBiped();
    expect(b.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("SBiped has default orientation (identity quaternion)", () => {
    const b = new SBiped();
    expect(b.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it("SBiped has default size {1,1,1}", () => {
    const b = new SBiped();
    expect(b.size).toEqual({ width: 1, height: 1, depth: 1 });
  });

  it("SFlyer starts at defaults", () => {
    const f = new SFlyer();
    expect(f.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(f.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(f.size).toEqual({ width: 1, height: 1, depth: 1 });
  });

  it("SQuadruped starts at defaults", () => {
    const q = new SQuadruped();
    expect(q.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("SProp starts at defaults", () => {
    const p = new SProp();
    expect(p.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(p.size).toEqual({ width: 1, height: 1, depth: 1 });
  });

  it("SGround has no position/orientation/size properties", () => {
    const g = new SGround();
    expect(g).toBeInstanceOf(SThing);
    expect("position" in g).toBe(false);
    expect("orientation" in g).toBe(false);
    expect("size" in g).toBe(false);
  });

  it("SScene entity has no position/orientation/size properties", () => {
    const s = new SSceneEntity();
    expect(s).toBeInstanceOf(SThing);
    expect("position" in s).toBe(false);
  });

  it("SCamera has position and orientation but no size", () => {
    const c = new SCamera();
    expect(c.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(c.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect("size" in c).toBe(false);
  });
});

// ===========================================================================
// 3. ENTITY HIERARCHY — instanceof checks
// ===========================================================================

describe("Entity hierarchy (instanceof)", () => {
  it("SBiped is SThing", () => {
    expect(new SBiped()).toBeInstanceOf(SThing);
  });

  it("SBiped is STurnable", () => {
    expect(new SBiped()).toBeInstanceOf(STurnable);
  });

  it("SBiped is SMovableTurnable", () => {
    expect(new SBiped()).toBeInstanceOf(SMovableTurnable);
  });

  it("SBiped is SModel", () => {
    expect(new SBiped()).toBeInstanceOf(SModel);
  });

  it("SBiped is SJointedModel", () => {
    expect(new SBiped()).toBeInstanceOf(SJointedModel);
  });

  it("SFlyer is SJointedModel", () => {
    expect(new SFlyer()).toBeInstanceOf(SJointedModel);
  });

  it("SQuadruped is SJointedModel", () => {
    expect(new SQuadruped()).toBeInstanceOf(SJointedModel);
  });

  it("SProp is SJointedModel", () => {
    expect(new SProp()).toBeInstanceOf(SJointedModel);
  });

  it("SGround is SThing but NOT STurnable", () => {
    const g = new SGround();
    expect(g).toBeInstanceOf(SThing);
    expect(g).not.toBeInstanceOf(STurnable);
  });

  it("SCamera is SMovableTurnable but NOT SModel", () => {
    const c = new SCamera();
    expect(c).toBeInstanceOf(SMovableTurnable);
    expect(c).not.toBeInstanceOf(SModel);
  });

  it("SScene entity is SThing but NOT STurnable", () => {
    const s = new SSceneEntity();
    expect(s).toBeInstanceOf(SThing);
    expect(s).not.toBeInstanceOf(STurnable);
  });
});

// ===========================================================================
// 4. ENTITY PROPERTY MUTATION — replace-on-set semantics
// ===========================================================================

describe("Entity property mutation", () => {
  it("setting position replaces the value", () => {
    const b = new SBiped();
    const newPos: Position = { x: 5, y: 10, z: -3 };
    b.position = newPos;
    expect(b.position).toEqual({ x: 5, y: 10, z: -3 });
  });

  it("setting orientation replaces the value", () => {
    const b = new SBiped();
    b.orientation = { x: 0, y: 0.707, z: 0, w: 0.707 };
    expect(b.orientation).toEqual({ x: 0, y: 0.707, z: 0, w: 0.707 });
  });

  it("setting size replaces the value", () => {
    const b = new SBiped();
    b.size = { width: 2, height: 3, depth: 4 };
    expect(b.size).toEqual({ width: 2, height: 3, depth: 4 });
  });

  it("original Position object is not mutated when entity position changes", () => {
    const b = new SBiped();
    const original = b.position;
    b.position = { x: 99, y: 99, z: 99 };
    // original reference should still be the default
    expect(original).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("position setter rejects NaN", () => {
    const b = new SBiped();
    b.position = { x: 1, y: 2, z: 3 };
    b.position = { x: NaN, y: 0, z: 0 };
    expect(b.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("position setter rejects Infinity", () => {
    const b = new SBiped();
    b.position = { x: 1, y: 2, z: 3 };
    b.position = { x: 0, y: Infinity, z: 0 };
    expect(b.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("orientation setter rejects NaN", () => {
    const b = new SBiped();
    const good = { x: 0, y: 0.707, z: 0, w: 0.707 };
    b.orientation = good;
    b.orientation = { x: 0, y: NaN, z: 0, w: 1 };
    expect(b.orientation).toEqual(good);
  });

  it("orientation setter rejects -Infinity", () => {
    const b = new SBiped();
    b.orientation = { x: 0, y: 0, z: -Infinity, w: 1 };
    expect(b.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it("size setter rejects NaN", () => {
    const b = new SBiped();
    b.size = { width: 2, height: 3, depth: 4 };
    b.size = { width: NaN, height: 3, depth: 4 };
    expect(b.size).toEqual({ width: 2, height: 3, depth: 4 });
  });

  it("size setter rejects Infinity", () => {
    const b = new SBiped();
    b.size = { width: 2, height: 3, depth: 4 };
    b.size = { width: 2, height: Infinity, depth: 4 };
    expect(b.size).toEqual({ width: 2, height: 3, depth: 4 });
  });
});

// ===========================================================================
// 5. JOINTS (NOT YET POPULATED)
// ===========================================================================

describe("Joints (not yet populated)", () => {
  it("SBiped.getJoint returns undefined for any joint name", () => {
    const b = new SBiped();
    expect(b.getJoint("LEFT_SHOULDER")).toBeUndefined();
  });

  it("SFlyer.getJoint returns undefined", () => {
    const f = new SFlyer();
    expect(f.getJoint("LEFT_WING")).toBeUndefined();
  });

  it("SProp.getJoint returns undefined", () => {
    const p = new SProp();
    expect(p.getJoint("ROOT")).toBeUndefined();
  });

  it("SQuadruped.getJoint returns undefined", () => {
    const q = new SQuadruped();
    expect(q.getJoint("FRONT_LEFT_HIP")).toBeUndefined();
  });
});

// ===========================================================================
// 6. SCENE CONTAINER — CRUD operations
// ===========================================================================

describe("Scene container", () => {
  describe("constructor", () => {
    it("creates an empty scene", () => {
      const scene = new Scene();
      expect(scene.entities.size).toBe(0);
    });

    it("optional properties start undefined", () => {
      const scene = new Scene();
      expect(scene.atmosphereColor).toBeUndefined();
      expect(scene.fogDensity).toBeUndefined();
      expect(scene.ambientLightColor).toBeUndefined();
    });
  });

  describe("addEntity / getEntity", () => {
    it("adds and retrieves an entity", () => {
      const scene = new Scene();
      const biped = new SBiped();
      scene.addEntity("bunny", biped);
      expect(scene.getEntity("bunny")).toBe(biped);
    });

    it("entities map reflects additions", () => {
      const scene = new Scene();
      scene.addEntity("a", new SBiped());
      scene.addEntity("b", new SProp());
      expect(scene.entities.size).toBe(2);
    });

    it("getEntity returns undefined for unknown name", () => {
      const scene = new Scene();
      expect(scene.getEntity("nonexistent")).toBeUndefined();
    });
  });

  describe("removeEntity", () => {
    it("returns true when removing existing entity", () => {
      const scene = new Scene();
      scene.addEntity("x", new SProp());
      expect(scene.removeEntity("x")).toBe(true);
      expect(scene.getEntity("x")).toBeUndefined();
    });

    it("returns false when removing non-existent entity", () => {
      const scene = new Scene();
      expect(scene.removeEntity("nope")).toBe(false);
    });

    it("entities map shrinks after removal", () => {
      const scene = new Scene();
      scene.addEntity("a", new SBiped());
      scene.addEntity("b", new SProp());
      scene.removeEntity("a");
      expect(scene.entities.size).toBe(1);
    });
  });

  describe("setEntityPosition", () => {
    it("sets position on an SBiped", () => {
      const scene = new Scene();
      scene.addEntity("bunny", new SBiped());
      scene.setEntityPosition("bunny", { x: 3, y: 0, z: -5 });
      const entity = scene.getEntity("bunny") as SBiped;
      expect(entity.position).toEqual({ x: 3, y: 0, z: -5 });
    });

    it("sets position on an SCamera", () => {
      const scene = new Scene();
      scene.addEntity("cam", new SCamera());
      scene.setEntityPosition("cam", { x: 0, y: 5, z: 20 });
      const entity = scene.getEntity("cam") as SCamera;
      expect(entity.position).toEqual({ x: 0, y: 5, z: 20 });
    });
  });

  describe("setEntityOrientation", () => {
    it("sets orientation on an SBiped", () => {
      const scene = new Scene();
      scene.addEntity("bunny", new SBiped());
      scene.setEntityOrientation("bunny", { x: 0, y: 0.707, z: 0, w: 0.707 });
      const entity = scene.getEntity("bunny") as SBiped;
      expect(entity.orientation).toEqual({ x: 0, y: 0.707, z: 0, w: 0.707 });
    });

    it("sets orientation on an SCamera", () => {
      const scene = new Scene();
      scene.addEntity("cam", new SCamera());
      scene.setEntityOrientation("cam", { x: 0, y: 1, z: 0, w: 0 });
      const entity = scene.getEntity("cam") as SCamera;
      expect(entity.orientation).toEqual({ x: 0, y: 1, z: 0, w: 0 });
    });
  });
});

// ===========================================================================
// 7. INPUT VALIDATION — error cases
// ===========================================================================

describe("Input validation", () => {
  describe("addEntity name validation", () => {
    it("rejects empty name", () => {
      const scene = new Scene();
      expect(() => scene.addEntity("", new SBiped())).toThrow(TypeError);
    });

    it("rejects whitespace-only name", () => {
      const scene = new Scene();
      expect(() => scene.addEntity("   ", new SBiped())).toThrow(TypeError);
    });

    it("rejects duplicate name", () => {
      const scene = new Scene();
      scene.addEntity("bunny", new SBiped());
      expect(() => scene.addEntity("bunny", new SProp())).toThrow(TypeError);
    });

    it("error message mentions the duplicate name", () => {
      const scene = new Scene();
      scene.addEntity("bunny", new SBiped());
      expect(() => scene.addEntity("bunny", new SProp())).toThrow(/bunny/);
    });
  });

  describe("setEntityPosition validation", () => {
    it("throws for unknown entity", () => {
      const scene = new Scene();
      expect(() =>
        scene.setEntityPosition("ghost", { x: 0, y: 0, z: 0 }),
      ).toThrow(TypeError);
    });

    it("throws for entity that does not support position (SGround)", () => {
      const scene = new Scene();
      scene.addEntity("ground", new SGround());
      expect(() =>
        scene.setEntityPosition("ground", { x: 1, y: 0, z: 0 }),
      ).toThrow(TypeError);
    });

    it("error message mentions entity name for unsupported type", () => {
      const scene = new Scene();
      scene.addEntity("ground", new SGround());
      expect(() =>
        scene.setEntityPosition("ground", { x: 1, y: 0, z: 0 }),
      ).toThrow(/ground/);
    });

    it("throws for NaN coordinate", () => {
      const scene = new Scene();
      scene.addEntity("b", new SBiped());
      expect(() =>
        scene.setEntityPosition("b", { x: NaN, y: 0, z: 0 }),
      ).toThrow(TypeError);
    });

    it("throws for Infinity coordinate", () => {
      const scene = new Scene();
      scene.addEntity("b", new SBiped());
      expect(() =>
        scene.setEntityPosition("b", { x: Infinity, y: 0, z: 0 }),
      ).toThrow(TypeError);
    });

    it("throws for -Infinity coordinate", () => {
      const scene = new Scene();
      scene.addEntity("b", new SBiped());
      expect(() =>
        scene.setEntityPosition("b", { x: 0, y: -Infinity, z: 0 }),
      ).toThrow(TypeError);
    });
  });

  describe("setEntityOrientation validation", () => {
    it("throws for unknown entity", () => {
      const scene = new Scene();
      expect(() =>
        scene.setEntityOrientation("ghost", { x: 0, y: 0, z: 0, w: 1 }),
      ).toThrow(TypeError);
    });

    it("throws for entity that does not support orientation (SGround)", () => {
      const scene = new Scene();
      scene.addEntity("ground", new SGround());
      expect(() =>
        scene.setEntityOrientation("ground", { x: 0, y: 0, z: 0, w: 1 }),
      ).toThrow(TypeError);
    });

    it("throws for NaN in orientation", () => {
      const scene = new Scene();
      scene.addEntity("b", new SBiped());
      expect(() =>
        scene.setEntityOrientation("b", { x: 0, y: NaN, z: 0, w: 1 }),
      ).toThrow(TypeError);
    });

    it("throws for Infinity in orientation", () => {
      const scene = new Scene();
      scene.addEntity("b", new SBiped());
      expect(() =>
        scene.setEntityOrientation("b", { x: 0, y: 0, z: Infinity, w: 1 }),
      ).toThrow(TypeError);
    });
  });
});

// ===========================================================================
// 8. SCENE.fromProject() — bridge from parser output
// ===========================================================================

describe("Scene.fromProject()", () => {
  it("creates entities from sceneObjects", () => {
    const project = makeProject([
      makeAliceObject({ name: "ground", typeName: "org.lgna.story.SGround" }),
      makeAliceObject({ name: "bunny", typeName: "org.lgna.story.SBiped" }),
    ]);
    const scene = Scene.fromProject(project);
    expect(scene.entities.size).toBe(2);
  });

  describe("type mapping", () => {
    it("maps SGround typeName to SGround entity", () => {
      const project = makeProject([
        makeAliceObject({ name: "g", typeName: "org.lgna.story.SGround" }),
      ]);
      const scene = Scene.fromProject(project);
      expect(scene.getEntity("g")).toBeInstanceOf(SGround);
    });

    it("maps SBiped typeName to SBiped entity", () => {
      const project = makeProject([
        makeAliceObject({ name: "b", typeName: "org.lgna.story.SBiped" }),
      ]);
      const scene = Scene.fromProject(project);
      expect(scene.getEntity("b")).toBeInstanceOf(SBiped);
    });

    it("maps SFlyer typeName to SFlyer entity", () => {
      const project = makeProject([
        makeAliceObject({ name: "f", typeName: "org.lgna.story.SFlyer" }),
      ]);
      const scene = Scene.fromProject(project);
      expect(scene.getEntity("f")).toBeInstanceOf(SFlyer);
    });

    it("maps SQuadruped typeName to SQuadruped entity", () => {
      const project = makeProject([
        makeAliceObject({ name: "q", typeName: "org.lgna.story.SQuadruped" }),
      ]);
      const scene = Scene.fromProject(project);
      expect(scene.getEntity("q")).toBeInstanceOf(SQuadruped);
    });

    it("maps SProp typeName to SProp entity", () => {
      const project = makeProject([
        makeAliceObject({ name: "p", typeName: "org.lgna.story.SProp" }),
      ]);
      const scene = Scene.fromProject(project);
      expect(scene.getEntity("p")).toBeInstanceOf(SProp);
    });

    it("maps SCamera typeName to SCamera entity", () => {
      const project = makeProject([
        makeAliceObject({ name: "c", typeName: "org.lgna.story.SCamera" }),
      ]);
      const scene = Scene.fromProject(project);
      expect(scene.getEntity("c")).toBeInstanceOf(SCamera);
    });

    it("maps SScene typeName to SScene entity", () => {
      const project = makeProject([
        makeAliceObject({ name: "s", typeName: "org.lgna.story.SScene" }),
      ]);
      const scene = Scene.fromProject(project);
      expect(scene.getEntity("s")).toBeInstanceOf(SSceneEntity);
    });

    it("maps SJointedModel typeName to SJointedModel (not SModel)", () => {
      const project = makeProject([
        makeAliceObject({ name: "j", typeName: "org.lgna.story.SJointedModel" }),
      ]);
      const scene = Scene.fromProject(project);
      expect(scene.getEntity("j")).toBeInstanceOf(SJointedModel);
      // Must be SJointedModel specifically, not just SModel
      expect(scene.getEntity("j")!.constructor.name).toBe("SJointedModel");
    });

    it("maps SModel typeName to SModel", () => {
      const project = makeProject([
        makeAliceObject({ name: "m", typeName: "org.lgna.story.SModel" }),
      ]);
      const scene = Scene.fromProject(project);
      expect(scene.getEntity("m")).toBeInstanceOf(SModel);
      expect(scene.getEntity("m")!.constructor.name).toBe("SModel");
    });

    it("handles fully-qualified Java names", () => {
      const project = makeProject([
        makeAliceObject({
          name: "b",
          typeName: "org.lgna.story.SBiped",
          resourceType: "org.lgna.story.resources.biped.BunnyResource",
        }),
      ]);
      const scene = Scene.fromProject(project);
      expect(scene.getEntity("b")).toBeInstanceOf(SBiped);
    });

    it("User:* types fall back to SProp", () => {
      const project = makeProject([
        makeAliceObject({ name: "u", typeName: "User:Prop" }),
      ]);
      const scene = Scene.fromProject(project);
      expect(scene.getEntity("u")).toBeInstanceOf(SProp);
    });

    it("User:Biped still falls back to SProp (not SBiped)", () => {
      // User: prefix is checked AFTER the concrete type checks.
      // "User:Biped" does not contain "SBiped", so it goes to SProp fallback.
      const project = makeProject([
        makeAliceObject({ name: "u", typeName: "User:Biped" }),
      ]);
      const scene = Scene.fromProject(project);
      expect(scene.getEntity("u")).toBeInstanceOf(SProp);
    });

    it("unrecognized typeName falls back to SProp", () => {
      const project = makeProject([
        makeAliceObject({ name: "x", typeName: "com.example.CustomThing" }),
      ]);
      const scene = Scene.fromProject(project);
      expect(scene.getEntity("x")).toBeInstanceOf(SProp);
    });
  });

  describe("transform application", () => {
    it("applies position to SBiped", () => {
      const project = makeProject([
        makeAliceObject({
          name: "b",
          typeName: "org.lgna.story.SBiped",
          position: { x: 3, y: 0, z: -2 },
        }),
      ]);
      const scene = Scene.fromProject(project);
      const entity = scene.getEntity("b") as SBiped;
      expect(entity.position).toEqual({ x: 3, y: 0, z: -2 });
    });

    it("applies orientation to SBiped", () => {
      const project = makeProject([
        makeAliceObject({
          name: "b",
          typeName: "org.lgna.story.SBiped",
          orientation: { x: 0, y: 0.707, z: 0, w: 0.707 },
        }),
      ]);
      const scene = Scene.fromProject(project);
      const entity = scene.getEntity("b") as SBiped;
      expect(entity.orientation).toEqual({ x: 0, y: 0.707, z: 0, w: 0.707 });
    });

    it("applies size to SBiped", () => {
      const project = makeProject([
        makeAliceObject({
          name: "b",
          typeName: "org.lgna.story.SBiped",
          size: { width: 2, height: 3, depth: 4 },
        }),
      ]);
      const scene = Scene.fromProject(project);
      const entity = scene.getEntity("b") as SBiped;
      expect(entity.size).toEqual({ width: 2, height: 3, depth: 4 });
    });

    it("applies position to SCamera", () => {
      const project = makeProject([
        makeAliceObject({
          name: "cam",
          typeName: "org.lgna.story.SCamera",
          position: { x: 0, y: 5, z: 20 },
        }),
      ]);
      const scene = Scene.fromProject(project);
      const entity = scene.getEntity("cam") as SCamera;
      expect(entity.position).toEqual({ x: 0, y: 5, z: 20 });
    });

    it("silently skips position on SGround", () => {
      const project = makeProject([
        makeAliceObject({
          name: "g",
          typeName: "org.lgna.story.SGround",
          position: { x: 1, y: 2, z: 3 },
        }),
      ]);
      // Should not throw
      const scene = Scene.fromProject(project);
      const entity = scene.getEntity("g");
      expect(entity).toBeInstanceOf(SGround);
      expect("position" in entity!).toBe(false);
    });

    it("silently skips size on SCamera", () => {
      const project = makeProject([
        makeAliceObject({
          name: "cam",
          typeName: "org.lgna.story.SCamera",
          size: { width: 2, height: 3, depth: 4 },
        }),
      ]);
      const scene = Scene.fromProject(project);
      const entity = scene.getEntity("cam");
      expect(entity).toBeInstanceOf(SCamera);
      expect("size" in entity!).toBe(false);
    });

    it("leaves position at default when parsed position is null", () => {
      const project = makeProject([
        makeAliceObject({
          name: "b",
          typeName: "org.lgna.story.SBiped",
          position: null,
        }),
      ]);
      const scene = Scene.fromProject(project);
      const entity = scene.getEntity("b") as SBiped;
      expect(entity.position).toEqual({ x: 0, y: 0, z: 0 });
    });

    it("applies all transforms in a realistic scenario", () => {
      const project = makeProject([
        makeAliceObject({
          name: "ground",
          typeName: "org.lgna.story.SGround",
        }),
        makeAliceObject({
          name: "camera",
          typeName: "org.lgna.story.SCamera",
          position: { x: 0, y: 5, z: 20 },
        }),
        makeAliceObject({
          name: "bunny",
          typeName: "org.lgna.story.SBiped",
          resourceType: "org.lgna.story.resources.biped.BunnyResource",
          position: { x: 3, y: 0, z: -2 },
          orientation: { x: 0, y: 0.707, z: 0, w: 0.707 },
          size: { width: 1, height: 1.5, depth: 1 },
        }),
        makeAliceObject({
          name: "bananaTree",
          typeName: "org.lgna.story.SProp",
          resourceType: "org.lgna.story.resources.prop.BananaTreeResource",
          position: { x: -5, y: 0, z: -3 },
          size: { width: 2, height: 4, depth: 2 },
        }),
      ]);

      const scene = Scene.fromProject(project);

      expect(scene.entities.size).toBe(4);

      // Ground — no transforms
      expect(scene.getEntity("ground")).toBeInstanceOf(SGround);

      // Camera — position only
      const cam = scene.getEntity("camera") as SCamera;
      expect(cam.position).toEqual({ x: 0, y: 5, z: 20 });

      // Bunny — full transforms
      const bunny = scene.getEntity("bunny") as SBiped;
      expect(bunny.position).toEqual({ x: 3, y: 0, z: -2 });
      expect(bunny.orientation).toEqual({ x: 0, y: 0.707, z: 0, w: 0.707 });
      expect(bunny.size).toEqual({ width: 1, height: 1.5, depth: 1 });

      // Banana tree — position + size, default orientation
      const tree = scene.getEntity("bananaTree") as SProp;
      expect(tree.position).toEqual({ x: -5, y: 0, z: -3 });
      expect(tree.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
      expect(tree.size).toEqual({ width: 2, height: 4, depth: 2 });
    });
  });

  describe("fromProject skips non-finite transforms from parser data", () => {
    it("skips NaN position — keeps default", () => {
      const project = makeProject([
        makeAliceObject({
          name: "b",
          typeName: "org.lgna.story.SBiped",
          position: { x: NaN, y: 0, z: 0 },
        }),
      ]);
      const scene = Scene.fromProject(project);
      const entity = scene.getEntity("b") as SBiped;
      expect(entity.position).toEqual({ x: 0, y: 0, z: 0 });
    });

    it("skips Infinity orientation — keeps default", () => {
      const project = makeProject([
        makeAliceObject({
          name: "b",
          typeName: "org.lgna.story.SBiped",
          orientation: { x: 0, y: Infinity, z: 0, w: 1 },
        }),
      ]);
      const scene = Scene.fromProject(project);
      const entity = scene.getEntity("b") as SBiped;
      expect(entity.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    });

    it("skips NaN size — keeps default", () => {
      const project = makeProject([
        makeAliceObject({
          name: "b",
          typeName: "org.lgna.story.SBiped",
          size: { width: 2, height: NaN, depth: 4 },
        }),
      ]);
      const scene = Scene.fromProject(project);
      const entity = scene.getEntity("b") as SBiped;
      expect(entity.size).toEqual({ width: 1, height: 1, depth: 1 });
    });

    it("applies valid transforms alongside skipped non-finite ones", () => {
      const project = makeProject([
        makeAliceObject({
          name: "b",
          typeName: "org.lgna.story.SBiped",
          position: { x: 5, y: 0, z: -3 },
          orientation: { x: 0, y: -Infinity, z: 0, w: 1 },
          size: { width: 2, height: 3, depth: 4 },
        }),
      ]);
      const scene = Scene.fromProject(project);
      const entity = scene.getEntity("b") as SBiped;
      expect(entity.position).toEqual({ x: 5, y: 0, z: -3 });
      expect(entity.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 }); // skipped
      expect(entity.size).toEqual({ width: 2, height: 3, depth: 4 });
    });
  });

  describe("type mapping order — SJointedModel vs SModel disambiguation", () => {
    it("SJointedModel is matched before SModel (order matters)", () => {
      // "SJointedModel" contains "SModel" as a substring.
      // The mapping must check SJointedModel FIRST.
      const project = makeProject([
        makeAliceObject({ name: "jm", typeName: "org.lgna.story.SJointedModel" }),
      ]);
      const scene = Scene.fromProject(project);
      const entity = scene.getEntity("jm")!;
      expect(entity.constructor.name).toBe("SJointedModel");
    });
  });

  describe("empty project", () => {
    it("handles project with no scene objects", () => {
      const project = makeProject([]);
      const scene = Scene.fromProject(project);
      expect(scene.entities.size).toBe(0);
    });
  });
});

// ===========================================================================
// 9. ENTITIES MAP — ReadonlyMap contract
// ===========================================================================

describe("Scene.entities is a ReadonlyMap", () => {
  it("returns a map that reflects current state", () => {
    const scene = new Scene();
    scene.addEntity("a", new SBiped());
    const entities = scene.entities;
    expect(entities.has("a")).toBe(true);
  });

  it("iterating entities yields all entries", () => {
    const scene = new Scene();
    scene.addEntity("a", new SBiped());
    scene.addEntity("b", new SProp());
    const names = [...scene.entities.keys()].sort();
    expect(names).toEqual(["a", "b"]);
  });
});
