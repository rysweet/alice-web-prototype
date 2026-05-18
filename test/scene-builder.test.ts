// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import * as THREE from "three";
import type { AliceProject, AliceObject } from "../src/a3p-parser";
import {
  buildScene,
  type SceneBuildOptions,
  type SceneBuildResult,
  type CameraConfig,
  type LightConfig,
  type SceneLights,
} from "../src/scene-builder";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeProject(objects: AliceObject[]): AliceProject {
  return {
    version: "3.6",
    projectName: "TestProject",
    sceneObjects: objects,
    methods: [],
  };
}

/** Collect all objects added to a THREE.Scene (including nested). */
function collectSceneChildren(scene: THREE.Scene): THREE.Object3D[] {
  const result: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if (obj !== scene) result.push(obj);
  });
  return result;
}

/** Filter scene children by userData.debugType. */
function findByDebugType(scene: THREE.Scene, debugType: string): THREE.Object3D[] {
  return collectSceneChildren(scene).filter(
    (obj) => obj.userData?.debugType === debugType,
  );
}

/** Filter scene children that are instances of a given Three.js class. */
function findByType<T extends THREE.Object3D>(
  scene: THREE.Scene,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctor: new (...args: any[]) => T,
): T[] {
  return collectSceneChildren(scene).filter((obj) => obj instanceof ctor) as T[];
}

// ---------------------------------------------------------------------------
// Standard test fixtures
// ---------------------------------------------------------------------------

const GROUND_OBJ = makeAliceObject({
  name: "ground",
  typeName: "org.lgna.story.SGround",
});

const CAMERA_OBJ = makeAliceObject({
  name: "camera",
  typeName: "org.lgna.story.SCamera",
  position: { x: 0, y: 2, z: 10 },
});

const BIPED_OBJ = makeAliceObject({
  name: "alice",
  typeName: "org.lgna.story.SBiped",
  position: { x: 0, y: 0, z: 0 },
  size: { width: 1, height: 2, depth: 0.5 },
});

const QUADRUPED_OBJ = makeAliceObject({
  name: "bunny",
  typeName: "org.lgna.story.SQuadruped",
  position: { x: 3, y: 0, z: 0 },
  size: { width: 1.5, height: 1, depth: 2 },
});

const FLYER_OBJ = makeAliceObject({
  name: "eagle",
  typeName: "org.lgna.story.SFlyer",
  position: { x: -2, y: 3, z: 0 },
  size: { width: 2, height: 0.5, depth: 1 },
});

const PROP_OBJ = makeAliceObject({
  name: "table",
  typeName: "org.lgna.story.SProp",
  position: { x: 5, y: 0, z: 0 },
  size: { width: 2, height: 1, depth: 1 },
});

const MODEL_OBJ = makeAliceObject({
  name: "tree",
  typeName: "org.lgna.story.SModel",
  position: { x: -5, y: 0, z: 0 },
  size: { width: 1, height: 3, depth: 1 },
});

const JOINTED_MODEL_OBJ = makeAliceObject({
  name: "robot",
  typeName: "org.lgna.story.SJointedModel",
  position: { x: 2, y: 0, z: -3 },
  size: { width: 1, height: 1.5, depth: 0.8 },
});

const MIXED_PROJECT = makeProject([
  GROUND_OBJ,
  CAMERA_OBJ,
  BIPED_OBJ,
  QUADRUPED_OBJ,
  FLYER_OBJ,
  PROP_OBJ,
  MODEL_OBJ,
]);

// ===========================================================================
// 1. BACKWARD COMPATIBILITY — no options → identical to current behavior
// ===========================================================================

describe("Backward compatibility", () => {
  it("returns scene and camera when called without options", () => {
    const project = makeProject([GROUND_OBJ, BIPED_OBJ]);
    const result = buildScene(project);

    // Must still return scene + camera (original contract)
    expect(result).toHaveProperty("scene");
    expect(result).toHaveProperty("camera");
    expect(result.scene).toBeInstanceOf(THREE.Scene);
    expect(result.camera).toBeInstanceOf(THREE.PerspectiveCamera);
  });

  it("preserves default ambient + directional lights when no options given", () => {
    const project = makeProject([GROUND_OBJ]);
    const result = buildScene(project);

    const ambients = findByType(result.scene, THREE.AmbientLight);
    const directionals = findByType(result.scene, THREE.DirectionalLight);
    expect(ambients.length).toBe(1);
    expect(directionals.length).toBe(1);
    expect(ambients[0].intensity).toBeCloseTo(0.5);
    expect(directionals[0].intensity).toBeCloseTo(0.8);
  });

  it("does not add debug objects (grid, bbox, skeleton) when no options given", () => {
    const project = makeProject([BIPED_OBJ, PROP_OBJ]);
    const result = buildScene(project);

    const grids = findByDebugType(result.scene, "grid");
    const bboxes = findByDebugType(result.scene, "bbox");
    const skeletons = findByDebugType(result.scene, "skeleton");

    expect(grids).toHaveLength(0);
    expect(bboxes).toHaveLength(0);
    expect(skeletons).toHaveLength(0);
  });
});

// ===========================================================================
// 2. CAMERA CONFIG — returned config has correct shape and defaults
// ===========================================================================

describe("CameraConfig", () => {
  it("returns cameraConfig in the result", () => {
    const project = makeProject([GROUND_OBJ]);
    const result = buildScene(project) as SceneBuildResult;

    expect(result).toHaveProperty("cameraConfig");
    const cfg = result.cameraConfig;
    expect(cfg).toBeDefined();
  });

  it("cameraConfig has required fields with sensible defaults", () => {
    const project = makeProject([GROUND_OBJ]);
    const result = buildScene(project) as SceneBuildResult;
    const cfg = result.cameraConfig;

    // Target should be a 3D point
    expect(cfg.target).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) }),
    );

    // Distance constraints
    expect(cfg.minDistance).toBeGreaterThan(0);
    expect(cfg.maxDistance).toBeGreaterThan(cfg.minDistance);

    // Polar angle constraints (radians)
    expect(cfg.maxPolarAngle).toBeGreaterThan(0);
    expect(cfg.maxPolarAngle).toBeLessThanOrEqual(Math.PI);

    // Damping
    expect(cfg.enableDamping).toBe(true);
  });

  it("cameraConfig clamps distances to positive values", () => {
    const opts: SceneBuildOptions = {
      cameraTarget: { x: 0, y: 0, z: 0 },
      cameraMinDistance: -5,
      cameraMaxDistance: -10,
    };
    const project = makeProject([GROUND_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;
    const cfg = result.cameraConfig;

    expect(cfg.minDistance).toBeGreaterThan(0);
    expect(cfg.maxDistance).toBeGreaterThan(0);
    expect(cfg.maxDistance).toBeGreaterThanOrEqual(cfg.minDistance);
  });
});

// ===========================================================================
// 3. CONFIGURABLE LIGHTS — LightConfig array replaces defaults
// ===========================================================================

describe("Configurable lights", () => {
  it("replaces default lights when lights config is provided", () => {
    const lights: LightConfig[] = [
      { type: "ambient", color: 0xff0000, intensity: 0.3 },
      { type: "directional", color: 0x00ff00, intensity: 0.6, position: { x: 1, y: 5, z: 2 } },
    ];
    const opts: SceneBuildOptions = { lights };
    const project = makeProject([GROUND_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const ambients = findByType(result.scene, THREE.AmbientLight);
    const directionals = findByType(result.scene, THREE.DirectionalLight);

    expect(ambients.length).toBe(1);
    expect(ambients[0].color.getHex()).toBe(0xff0000);
    expect(ambients[0].intensity).toBeCloseTo(0.3);

    expect(directionals.length).toBe(1);
    expect(directionals[0].color.getHex()).toBe(0x00ff00);
    expect(directionals[0].intensity).toBeCloseTo(0.6);
  });

  it("supports point light type", () => {
    const lights: LightConfig[] = [
      { type: "point", color: 0xffffff, intensity: 1.0, position: { x: 0, y: 5, z: 0 } },
    ];
    const opts: SceneBuildOptions = { lights };
    const project = makeProject([GROUND_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const points = findByType(result.scene, THREE.PointLight);
    expect(points.length).toBe(1);
    expect(points[0].intensity).toBeCloseTo(1.0);
  });

  it("supports hemisphere light type", () => {
    const lights: LightConfig[] = [
      { type: "hemisphere", color: 0x87ceeb, groundColor: 0x4a7c3f, intensity: 0.4 },
    ];
    const opts: SceneBuildOptions = { lights };
    const project = makeProject([GROUND_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const hemispheres = findByType(result.scene, THREE.HemisphereLight);
    expect(hemispheres.length).toBe(1);
    expect(hemispheres[0].intensity).toBeCloseTo(0.4);
  });

  it("clamps intensity to [0, 10]", () => {
    const lights: LightConfig[] = [
      { type: "ambient", color: 0xffffff, intensity: -5 },
      { type: "directional", color: 0xffffff, intensity: 999, position: { x: 0, y: 1, z: 0 } },
    ];
    const opts: SceneBuildOptions = { lights };
    const project = makeProject([GROUND_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const ambients = findByType(result.scene, THREE.AmbientLight);
    const directionals = findByType(result.scene, THREE.DirectionalLight);

    expect(ambients[0].intensity).toBeGreaterThanOrEqual(0);
    expect(ambients[0].intensity).toBeLessThanOrEqual(10);
    expect(directionals[0].intensity).toBeGreaterThanOrEqual(0);
    expect(directionals[0].intensity).toBeLessThanOrEqual(10);
  });
});

// ===========================================================================
// 4. SCENE LIGHTS API — add/remove/current post-build management
// ===========================================================================

describe("SceneLights API", () => {
  it("returns a lights manager in the result", () => {
    const project = makeProject([GROUND_OBJ]);
    const result = buildScene(project) as SceneBuildResult;

    expect(result).toHaveProperty("lights");
    expect(result.lights).toBeDefined();
  });

  it("lights.current returns a snapshot of active lights", () => {
    const project = makeProject([GROUND_OBJ]);
    const result = buildScene(project) as SceneBuildResult;

    const current = result.lights.current;
    expect(Array.isArray(current)).toBe(true);
    // Default setup has 2 lights (ambient + directional)
    expect(current.length).toBe(2);
    expect(current.every((l: THREE.Light) => l instanceof THREE.Light)).toBe(true);
  });

  it("lights.current returns a safe copy (not a live reference)", () => {
    const project = makeProject([GROUND_OBJ]);
    const result = buildScene(project) as SceneBuildResult;

    const snap1 = result.lights.current;
    const snap2 = result.lights.current;
    expect(snap1).not.toBe(snap2); // different array instances
    expect(snap1).toEqual(snap2);  // same content
  });

  it("lights.add() inserts a new light into the scene", () => {
    const project = makeProject([GROUND_OBJ]);
    const result = buildScene(project) as SceneBuildResult;

    const newLight = new THREE.PointLight(0xff0000, 0.5);
    result.lights.add(newLight);

    const current = result.lights.current;
    expect(current.length).toBe(3);
    expect(current).toContain(newLight);

    // Verify it's actually in the scene
    const points = findByType(result.scene, THREE.PointLight);
    expect(points).toContain(newLight);
  });

  it("lights.remove() removes a light from the scene", () => {
    const project = makeProject([GROUND_OBJ]);
    const result = buildScene(project) as SceneBuildResult;

    const before = result.lights.current;
    expect(before.length).toBe(2);

    const toRemove = before[0];
    const removed = result.lights.remove(toRemove);
    expect(removed).toBe(true);

    const after = result.lights.current;
    expect(after.length).toBe(1);
    expect(after).not.toContain(toRemove);
  });
});

// ===========================================================================
// 5. GROUND GRID — GridHelper when showGroundGrid: true
// ===========================================================================

describe("Ground grid", () => {
  it("adds a GridHelper when showGroundGrid is true", () => {
    const opts: SceneBuildOptions = { showGroundGrid: true };
    const project = makeProject([GROUND_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const grids = findByDebugType(result.scene, "grid");
    expect(grids.length).toBe(1);
    expect(grids[0]).toBeInstanceOf(THREE.GridHelper);
  });

  it("positions grid at y=0.01 to avoid z-fighting", () => {
    const opts: SceneBuildOptions = { showGroundGrid: true };
    const project = makeProject([GROUND_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const grids = findByDebugType(result.scene, "grid");
    expect(grids[0].position.y).toBeCloseTo(0.01);
  });

  it("does not add grid when showGroundGrid is false or omitted", () => {
    const project = makeProject([GROUND_OBJ]);

    const resultOmitted = buildScene(project) as SceneBuildResult;
    expect(findByDebugType(resultOmitted.scene, "grid")).toHaveLength(0);

    const resultFalse = buildScene(project, { showGroundGrid: false }) as SceneBuildResult;
    expect(findByDebugType(resultFalse.scene, "grid")).toHaveLength(0);
  });
});

// ===========================================================================
// 6. BOUNDING BOXES — BoxHelper per model/prop entity
// ===========================================================================

describe("Bounding boxes", () => {
  it("adds BoxHelper for each model/prop when showBoundingBoxes is true", () => {
    const opts: SceneBuildOptions = { showBoundingBoxes: true };
    const project = makeProject([BIPED_OBJ, PROP_OBJ, MODEL_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const bboxes = findByDebugType(result.scene, "bbox");
    // All 3 objects are model/prop types → 3 bounding boxes
    expect(bboxes.length).toBe(3);
  });

  it("does not add bboxes for ground or camera entities", () => {
    const opts: SceneBuildOptions = { showBoundingBoxes: true };
    const project = makeProject([GROUND_OBJ, CAMERA_OBJ, BIPED_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const bboxes = findByDebugType(result.scene, "bbox");
    // Only biped gets a bbox, not ground or camera
    expect(bboxes.length).toBe(1);
  });

  it("bbox is a green wireframe (BoxHelper)", () => {
    const opts: SceneBuildOptions = { showBoundingBoxes: true };
    const project = makeProject([BIPED_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const bboxes = findByDebugType(result.scene, "bbox");
    expect(bboxes.length).toBe(1);

    // BoxHelper should be present somewhere in the hierarchy
    let foundBoxHelper = false;
    bboxes[0].traverse((child) => {
      if (child instanceof THREE.BoxHelper) {
        foundBoxHelper = true;
      }
    });
    // The bbox debug object itself or a child should be a BoxHelper
    expect(foundBoxHelper || bboxes[0] instanceof THREE.BoxHelper).toBe(true);
  });

  it("does not add bboxes when showBoundingBoxes is false or omitted", () => {
    const project = makeProject([BIPED_OBJ, PROP_OBJ]);

    const resultOmitted = buildScene(project) as SceneBuildResult;
    expect(findByDebugType(resultOmitted.scene, "bbox")).toHaveLength(0);

    const resultFalse = buildScene(project, { showBoundingBoxes: false }) as SceneBuildResult;
    expect(findByDebugType(resultFalse.scene, "bbox")).toHaveLength(0);
  });
});

// ===========================================================================
// 7. JOINT SKELETONS — LineSegments per jointed model subtype
// ===========================================================================

describe("Joint skeletons", () => {
  it("adds skeleton visualization for jointed models when showJointSkeletons is true", () => {
    const opts: SceneBuildOptions = { showJointSkeletons: true };
    const project = makeProject([BIPED_OBJ, QUADRUPED_OBJ, FLYER_OBJ, PROP_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const skeletons = findByDebugType(result.scene, "skeleton");
    // All 4 are jointed model subtypes → 4 skeletons
    expect(skeletons.length).toBe(4);
  });

  it("does not add skeletons for non-jointed entities (ground, camera, SModel)", () => {
    const opts: SceneBuildOptions = { showJointSkeletons: true };
    const project = makeProject([GROUND_OBJ, CAMERA_OBJ, MODEL_OBJ, BIPED_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const skeletons = findByDebugType(result.scene, "skeleton");
    // Only biped is a jointed model subtype; SModel is not jointed
    expect(skeletons.length).toBe(1);
  });

  it("biped skeleton has 13 segments", () => {
    const opts: SceneBuildOptions = { showJointSkeletons: true };
    const project = makeProject([BIPED_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const skeletons = findByDebugType(result.scene, "skeleton");
    expect(skeletons.length).toBe(1);
    const segmentCount = countLineSegments(skeletons[0]);
    expect(segmentCount).toBe(13);
  });

  it("quadruped skeleton has 10 segments", () => {
    const opts: SceneBuildOptions = { showJointSkeletons: true };
    const project = makeProject([QUADRUPED_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const skeletons = findByDebugType(result.scene, "skeleton");
    expect(skeletons.length).toBe(1);
    const segmentCount = countLineSegments(skeletons[0]);
    expect(segmentCount).toBe(10);
  });

  it("flyer skeleton has 6 segments", () => {
    const opts: SceneBuildOptions = { showJointSkeletons: true };
    const project = makeProject([FLYER_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const skeletons = findByDebugType(result.scene, "skeleton");
    expect(skeletons.length).toBe(1);
    const segmentCount = countLineSegments(skeletons[0]);
    expect(segmentCount).toBe(6);
  });

  it("prop skeleton has 3 segments (cross template)", () => {
    const opts: SceneBuildOptions = { showJointSkeletons: true };
    const project = makeProject([PROP_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const skeletons = findByDebugType(result.scene, "skeleton");
    expect(skeletons.length).toBe(1);
    const segmentCount = countLineSegments(skeletons[0]);
    expect(segmentCount).toBe(3);
  });

  it("SJointedModel (base) falls back to prop cross template (3 segments)", () => {
    const opts: SceneBuildOptions = { showJointSkeletons: true };
    const project = makeProject([JOINTED_MODEL_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const skeletons = findByDebugType(result.scene, "skeleton");
    expect(skeletons.length).toBe(1);
    const segmentCount = countLineSegments(skeletons[0]);
    expect(segmentCount).toBe(3);
  });

  it("does not add skeletons when showJointSkeletons is false or omitted", () => {
    const project = makeProject([BIPED_OBJ, QUADRUPED_OBJ]);

    const resultOmitted = buildScene(project) as SceneBuildResult;
    expect(findByDebugType(resultOmitted.scene, "skeleton")).toHaveLength(0);

    const resultFalse = buildScene(project, { showJointSkeletons: false }) as SceneBuildResult;
    expect(findByDebugType(resultFalse.scene, "skeleton")).toHaveLength(0);
  });
});

// ===========================================================================
// 8. SKELETON SEGMENT CAP — max 50 segments per entity
// ===========================================================================

describe("Skeleton segment cap", () => {
  it("caps skeleton segments at 50 per entity", () => {
    // This tests that even if somehow a skeleton template exceeds 50,
    // the implementation enforces the cap. Since biped has 13 which is under 50,
    // we verify the cap doesn't interfere with normal cases.
    const opts: SceneBuildOptions = { showJointSkeletons: true };
    const project = makeProject([BIPED_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    const skeletons = findByDebugType(result.scene, "skeleton");
    expect(skeletons.length).toBe(1);
    const segmentCount = countLineSegments(skeletons[0]);
    expect(segmentCount).toBeLessThanOrEqual(50);
    expect(segmentCount).toBe(13); // biped template is 13, well under cap
  });
});

// ===========================================================================
// 9. COMBINED OPTIONS — multiple features enabled together
// ===========================================================================

describe("Combined options", () => {
  it("supports all debug options enabled simultaneously", () => {
    const opts: SceneBuildOptions = {
      showGroundGrid: true,
      showBoundingBoxes: true,
      showJointSkeletons: true,
    };
    const project = makeProject([GROUND_OBJ, BIPED_OBJ, PROP_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    // Grid
    const grids = findByDebugType(result.scene, "grid");
    expect(grids.length).toBe(1);

    // Bboxes for biped + prop (not ground)
    const bboxes = findByDebugType(result.scene, "bbox");
    expect(bboxes.length).toBe(2);

    // Skeletons for biped + prop (both are jointed subtypes)
    const skeletons = findByDebugType(result.scene, "skeleton");
    expect(skeletons.length).toBe(2);
  });

  it("custom lights + debug options work together", () => {
    const opts: SceneBuildOptions = {
      lights: [
        { type: "ambient", color: 0xff0000, intensity: 0.5 },
        { type: "point", color: 0x00ff00, intensity: 1.0, position: { x: 0, y: 5, z: 0 } },
      ],
      showGroundGrid: true,
      showBoundingBoxes: true,
    };
    const project = makeProject([GROUND_OBJ, BIPED_OBJ]);
    const result = buildScene(project, opts) as SceneBuildResult;

    // Custom lights replaced defaults
    const ambients = findByType(result.scene, THREE.AmbientLight);
    expect(ambients.length).toBe(1);
    expect(ambients[0].color.getHex()).toBe(0xff0000);

    const points = findByType(result.scene, THREE.PointLight);
    expect(points.length).toBe(1);

    // No default directional light
    const directionals = findByType(result.scene, THREE.DirectionalLight);
    expect(directionals.length).toBe(0);

    // Debug features still present
    expect(findByDebugType(result.scene, "grid").length).toBe(1);
    expect(findByDebugType(result.scene, "bbox").length).toBe(1);
  });
});

// ===========================================================================
// Helpers for skeleton inspection
// ===========================================================================

/**
 * Count line segments in a skeleton debug object.
 * Skeletons are LineSegments — each pair of vertices in the geometry
 * represents one segment. The position attribute has (segmentCount * 2) vertices.
 */
function countLineSegments(obj: THREE.Object3D): number {
  let total = 0;
  obj.traverse((child) => {
    if (child instanceof THREE.LineSegments) {
      const positions = child.geometry.getAttribute("position");
      if (positions) {
        // LineSegments: every 2 vertices = 1 segment
        total += positions.count / 2;
      }
    }
  });
  return total;
}
