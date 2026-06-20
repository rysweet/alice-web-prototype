import { describe, expect, it } from "vitest";
import {
  generateProceduralGeometry,
  generateProceduralModel,
  getCanonicalJoints,
  meshDataToModelGeometry,
  mergeModelGeometry,
  mapJointName,
  extractJointsFromSkeleton,
  convertGltfPrimitives,
  importGltfData,
  createProceduralDefinitions,
  createAllProceduralDefinitions,
  createModelDefinitions,
  getOpenSourcePipelineSummary,
  getBlenderJointMap,
  generateBlenderExportScript,
  getAssetSourceGuide,
  CC0_LICENSE,
  PROCEDURAL_LICENSE,
} from "../src/open-asset-pipeline";
import type { EntityCategory, GltfMeshPrimitive, GltfSkeleton } from "../src/open-asset-pipeline";
import { ModelResourceCatalog } from "../src/model-resources";
import { createSphereMesh, createBoxMesh } from "../src/render-mesh";

// ── Mesh Conversion ────────────────────────────────────────────────

describe("meshDataToModelGeometry", () => {
  it("converts MeshData to flat ModelGeometryData arrays", () => {
    const sphere = createSphereMesh({ radius: 1, widthSegments: 4, heightSegments: 3 });
    const result = meshDataToModelGeometry(sphere);

    expect(result.vertices.length).toBeGreaterThan(0);
    expect(result.vertices.length % 3).toBe(0);
    expect(result.indices.length).toBeGreaterThan(0);
    expect(result.indices.length % 3).toBe(0);
    expect(result.normals!.length).toBe(result.vertices.length);
    expect(result.uvs!.length).toBe((result.vertices.length / 3) * 2);
    expect(result.bounds).toBeDefined();
    expect(result.bounds!.min.x).toBeLessThan(result.bounds!.max.x);
  });
});

describe("mergeModelGeometry", () => {
  it("returns empty geometry for empty input", () => {
    const result = mergeModelGeometry([]);
    expect(result.vertices).toEqual([]);
    expect(result.indices).toEqual([]);
  });

  it("returns a defensive copy for single-element input", () => {
    const box = meshDataToModelGeometry(createBoxMesh({ width: 1, height: 1, depth: 1 }));
    const result = mergeModelGeometry([box]);

    // Must be a distinct object, not the same reference
    expect(result).not.toBe(box);
    expect(result.vertices).not.toBe(box.vertices);
    expect(result.indices).not.toBe(box.indices);

    // But contents should be equal
    expect(result.vertices).toEqual(box.vertices);
    expect(result.indices).toEqual(box.indices);
    expect(result.bounds).toEqual(box.bounds);
  });

  it("merges multiple geometries with correct index offsets", () => {
    const box1 = meshDataToModelGeometry(createBoxMesh({ width: 1, height: 1, depth: 1 }));
    const box2 = meshDataToModelGeometry(createBoxMesh({ width: 1, height: 1, depth: 1, center: { x: 3, y: 0, z: 0 } }));
    const merged = mergeModelGeometry([box1, box2]);

    expect(merged.vertices.length).toBe(box1.vertices.length + box2.vertices.length);
    expect(merged.indices.length).toBe(box1.indices.length + box2.indices.length);

    // All indices should be valid
    const maxVertex = merged.vertices.length / 3 - 1;
    for (const idx of merged.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(maxVertex);
    }
  });

  it("drops normals when parts have inconsistent normal data", () => {
    const withNormals = meshDataToModelGeometry(createBoxMesh({ width: 1, height: 1, depth: 1 }));
    const withoutNormals = { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] };
    const merged = mergeModelGeometry([withNormals, withoutNormals]);

    // Normals should be dropped entirely to prevent misalignment
    expect(merged.normals).toBeUndefined();
    // Vertices and indices should still be correct
    expect(merged.vertices.length).toBe(withNormals.vertices.length + 9);
  });
});

// ── Canonical Joints ───────────────────────────────────────────────

describe("getCanonicalJoints", () => {
  const categories: EntityCategory[] = ["BIPED", "QUADRUPED", "FLYER", "SWIMMER", "SLITHERER", "PROP", "VEHICLE"];

  for (const category of categories) {
    it(`returns joints for ${category}`, () => {
      const joints = getCanonicalJoints(category);
      expect(joints.length).toBeGreaterThan(0);

      // Every joint list should have a ROOT
      expect(joints.some(j => j.name === "ROOT")).toBe(true);

      // ROOT should have no parent
      const root = joints.find(j => j.name === "ROOT")!;
      expect(root.parentName).toBeNull();

      // All non-ROOT joints reference an existing parent
      const names = new Set(joints.map(j => j.name));
      for (const joint of joints) {
        if (joint.parentName !== null) {
          expect(names.has(joint.parentName)).toBe(true);
        }
      }
    });
  }

  it("biped has ~46 joints including fingers", () => {
    const joints = getCanonicalJoints("BIPED");
    expect(joints.length).toBeGreaterThanOrEqual(40);
    expect(joints.some(j => j.name === "LEFT_THUMB_KNUCKLE")).toBe(true);
    expect(joints.some(j => j.name === "RIGHT_PINKY_FINGER")).toBe(true);
  });

  it("quadruped has ~42 joints including tail segments", () => {
    const joints = getCanonicalJoints("QUADRUPED");
    expect(joints.length).toBeGreaterThanOrEqual(35);
    expect(joints.some(j => j.name === "TAIL_0")).toBe(true);
    expect(joints.some(j => j.name === "BACK_LEFT_TOE")).toBe(true);
  });

  it("flyer has wing joints", () => {
    const joints = getCanonicalJoints("FLYER");
    expect(joints.some(j => j.name === "LEFT_WING_SHOULDER")).toBe(true);
    expect(joints.some(j => j.name === "RIGHT_WING_TIP")).toBe(true);
  });

  it("swimmer has fin joints", () => {
    const joints = getCanonicalJoints("SWIMMER");
    expect(joints.some(j => j.name === "FRONT_LEFT_FIN")).toBe(true);
    expect(joints.some(j => j.name === "TAIL")).toBe(true);
  });
});

// ── Procedural Generators ──────────────────────────────────────────

describe("generateProceduralGeometry", () => {
  const categories: EntityCategory[] = ["BIPED", "QUADRUPED", "FLYER", "SWIMMER", "SLITHERER", "PROP", "VEHICLE"];

  for (const category of categories) {
    it(`generates valid geometry for ${category}`, () => {
      const geo = generateProceduralGeometry(category);
      expect(geo.vertices.length).toBeGreaterThan(0);
      expect(geo.vertices.length % 3).toBe(0);
      expect(geo.indices.length).toBeGreaterThan(0);
      expect(geo.indices.length % 3).toBe(0);

      // All indices valid
      const maxIdx = geo.vertices.length / 3 - 1;
      for (const idx of geo.indices) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(maxIdx);
      }
    });
  }

  it("respects scale parameter", () => {
    const small = generateProceduralGeometry("BIPED", 0.5);
    const large = generateProceduralGeometry("BIPED", 2.0);
    expect(small.bounds!.max.y).toBeLessThan(large.bounds!.max.y);
  });
});

describe("generateProceduralModel", () => {
  it("returns geometry, joints, materials, and license", () => {
    const result = generateProceduralModel({
      category: "BIPED",
      id: "TEST_BIPED",
      name: "Test Biped",
      modelName: "TestBiped",
    });

    expect(result.geometry.vertices.length).toBeGreaterThan(0);
    expect(result.joints.length).toBeGreaterThanOrEqual(40);
    expect(result.materials.length).toBe(1);
    expect(result.materials[0]!.opacity).toBe(1);
    expect(result.license.spdxId).toBe("MIT");
  });

  it("applies custom color", () => {
    const result = generateProceduralModel({
      category: "PROP",
      id: "RED_BOX",
      name: "Red Box",
      modelName: "RedBox",
      color: 0xFF0000,
    });
    expect(result.materials[0]!.diffuseColor).toBe(0xFF0000);
  });
});

// ── glTF Loader ────────────────────────────────────────────────────

describe("mapJointName", () => {
  it("maps Mixamo bone names to Alice names", () => {
    expect(mapJointName("mixamorigHips")).toBe("ROOT");
    expect(mapJointName("mixamorigLeftArm")).toBe("LEFT_SHOULDER");
    expect(mapJointName("Head")).toBe("HEAD");
  });

  it("uses custom map if provided", () => {
    const custom = { "MyBone": "CUSTOM_NAME" };
    expect(mapJointName("MyBone", custom)).toBe("CUSTOM_NAME");
    expect(mapJointName("Head", custom)).toBe("HEAD"); // fallback to default
  });

  it("converts camelCase to UPPER_SNAKE_CASE for unknown names", () => {
    expect(mapJointName("myCustomBone")).toBe("MY_CUSTOM_BONE");
    expect(mapJointName("LeftPinkyFinger")).toBe("LEFT_PINKY_FINGER");
  });
});

describe("extractJointsFromSkeleton", () => {
  it("extracts joint definitions from skeleton data", () => {
    const skeleton: GltfSkeleton = {
      bones: [
        { name: "Hips", parentIndex: -1 },
        { name: "Spine", parentIndex: 0 },
        { name: "Head", parentIndex: 1 },
      ],
    };
    const joints = extractJointsFromSkeleton(skeleton);
    expect(joints).toEqual([
      { name: "ROOT", parentName: null },
      { name: "SPINE_BASE", parentName: "ROOT" },
      { name: "HEAD", parentName: "SPINE_BASE" },
    ]);
  });
});

describe("convertGltfPrimitives", () => {
  it("converts primitives to ModelGeometryData", () => {
    const primitive: GltfMeshPrimitive = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint16Array([0, 1, 2]),
    };
    const result = convertGltfPrimitives([primitive]);
    expect(result.vertices).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(result.indices).toEqual([0, 1, 2]);
    expect(result.normals).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  });

  it("applies scale", () => {
    const primitive: GltfMeshPrimitive = {
      positions: new Float32Array([1, 2, 3]),
      indices: new Uint16Array([0]),
    };
    const result = convertGltfPrimitives([primitive], { scale: 2 });
    expect(result.vertices).toEqual([2, 4, 6]);
  });

  it("flips Z when requested", () => {
    const primitive: GltfMeshPrimitive = {
      positions: new Float32Array([1, 2, 3]),
      indices: new Uint16Array([0]),
    };
    const result = convertGltfPrimitives([primitive], { flipZ: true });
    expect(result.vertices).toEqual([1, 2, -3]);
  });

  it("merges multiple primitives with correct offsets", () => {
    const p1: GltfMeshPrimitive = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint16Array([0, 1, 2]),
    };
    const p2: GltfMeshPrimitive = {
      positions: new Float32Array([2, 0, 0, 3, 0, 0, 2, 1, 0]),
      indices: new Uint16Array([0, 1, 2]),
    };
    const result = convertGltfPrimitives([p1, p2]);
    expect(result.vertices.length).toBe(18);
    // Second primitive indices should be offset by 3
    expect(result.indices).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("importGltfData", () => {
  it("imports full glTF data with skeleton", () => {
    const primitive: GltfMeshPrimitive = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint16Array([0, 1, 2]),
    };
    const skeleton: GltfSkeleton = {
      bones: [
        { name: "Hips", parentIndex: -1 },
        { name: "Spine", parentIndex: 0 },
      ],
    };
    const result = importGltfData([primitive], skeleton, { url: "test.glb" });
    expect(result.geometry.vertices.length).toBe(9);
    expect(result.joints.length).toBe(2);
    expect(result.joints[0]!.name).toBe("ROOT");
  });

  it("imports glTF data without skeleton (returns empty joints)", () => {
    const primitive: GltfMeshPrimitive = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint16Array([0, 1, 2]),
    };
    const result = importGltfData([primitive], null, { url: "test.glb" });
    expect(result.geometry.vertices.length).toBe(9);
    expect(result.joints).toEqual([]);
    expect(result.materials).toEqual([]);
  });
});

// ── Model Provider ─────────────────────────────────────────────────

describe("createProceduralDefinitions", () => {
  it("creates definitions for all biped resources", () => {
    const defs = createProceduralDefinitions("BIPED");
    expect(defs.length).toBeGreaterThan(0);

    for (const def of defs) {
      expect(def.id).toMatch(/^open-source\/biped\//);
      expect(def.category).toBe("people");
      expect(def.modelClass).toBe("BIPED");
      expect(def.tags).toContain("procedural");
      expect(def.tags).toContain("open-source");
      expect(def.loader).toBeDefined();
      expect(def.classInfo).toBeDefined();
      expect(def.classInfo!.joints!.length).toBeGreaterThanOrEqual(40);
    }
  });
});

describe("createAllProceduralDefinitions", () => {
  it("creates definitions for all categories including sub-model-classes", () => {
    const defs = createAllProceduralDefinitions();
    expect(defs.length).toBeGreaterThan(50);

    const modelClasses = new Set(defs.map(d => d.modelClass));
    // Base categories
    expect(modelClasses.has("BIPED")).toBe(true);
    expect(modelClasses.has("QUADRUPED")).toBe(true);
    expect(modelClasses.has("PROP")).toBe(true);
    // Sub-model-classes
    expect(modelClasses.has("FISH")).toBe(true);
    expect(modelClasses.has("MARINE_MAMMAL")).toBe(true);
    expect(modelClasses.has("AIRCRAFT")).toBe(true);
    expect(modelClasses.has("WATERCRAFT")).toBe(true);
    expect(modelClasses.has("TRAIN")).toBe(true);

    const categories = new Set(defs.map(d => d.category));
    expect(categories.has("people")).toBe(true);
    expect(categories.has("animals")).toBe(true);
    expect(categories.has("props")).toBe(true);
    expect(categories.has("vehicles")).toBe(true);
  });

  it("has no duplicate IDs across all definitions", () => {
    const defs = createAllProceduralDefinitions();
    const ids = defs.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("FISH definitions have working loaders and SWIMMER-compatible joints", () => {
    const defs = createAllProceduralDefinitions();
    const fishDefs = defs.filter(d => d.modelClass === "FISH");
    expect(fishDefs.length).toBe(7); // BASS, BLUEGILL, CATFISH, KOI, PIRANHA, SALMON, TROUT

    const first = fishDefs[0]!;
    expect(first.loader).toBeDefined();
    const loaded = first.loader!(first as any);
    expect((loaded as any).geometry.vertices.length).toBeGreaterThan(0);
    expect(first.classInfo!.joints!.some(j => j.name === "TAIL")).toBe(true);
  });

  it("MARINE_MAMMAL definitions have working loaders", () => {
    const defs = createAllProceduralDefinitions();
    const mmDefs = defs.filter(d => d.modelClass === "MARINE_MAMMAL");
    expect(mmDefs.length).toBe(5); // DOLPHIN, MANATEE, ORCA, SEALION, WALRUS

    const first = mmDefs[0]!;
    expect(first.loader).toBeDefined();
    const loaded = first.loader!(first as any);
    expect((loaded as any).geometry.vertices.length).toBeGreaterThan(0);
  });
});

describe("createModelDefinitions", () => {
  it("falls back to procedural definitions when no sources given", () => {
    const defs = createModelDefinitions();
    expect(defs.length).toBeGreaterThan(50);
  });

  it("respects fallbackToProcedural=false", () => {
    const defs = createModelDefinitions({ fallbackToProcedural: false });
    expect(defs.length).toBe(0);
  });

  it("converts procedural sources into definitions with working loaders", () => {
    const defs = createModelDefinitions({
      sources: [{
        type: "procedural",
        category: "BIPED",
        license: PROCEDURAL_LICENSE,
        proceduralConfig: {
          category: "BIPED",
          id: "CUSTOM_BIPED",
          name: "Custom Biped",
          modelName: "CustomBiped",
        },
      }],
    });
    const provided = defs.find(d => d.id.includes("custom_biped"));
    expect(provided).toBeDefined();
    expect(provided!.name).toBe("Custom Biped");
    expect(provided!.modelClass).toBe("BIPED");
    expect(provided!.loader).toBeDefined();
    // Loader should produce valid geometry
    const loaded = provided!.loader!(provided as any);
    expect((loaded as any).geometry.vertices.length).toBeGreaterThan(0);
  });

  it("does not generate procedural fallback for categories with provided sources", () => {
    const defs = createModelDefinitions({
      sources: [{
        type: "procedural",
        category: "BIPED",
        license: PROCEDURAL_LICENSE,
        proceduralConfig: {
          category: "BIPED",
          id: "CUSTOM_BIPED",
          name: "Custom Biped",
          modelName: "CustomBiped",
        },
      }],
    });
    const bipedDefs = defs.filter(d => d.modelClass === "BIPED");
    expect(bipedDefs.length).toBe(1);
    expect(bipedDefs[0]!.name).toBe("Custom Biped");
    // Other categories should still have procedural fallbacks
    const propDefs = defs.filter(d => d.modelClass === "PROP");
    expect(propDefs.length).toBeGreaterThan(0);
  });

  it("converts gltf sources into metadata-only definitions", () => {
    const defs = createModelDefinitions({
      sources: [{
        type: "gltf",
        category: "QUADRUPED",
        license: CC0_LICENSE,
        gltfOptions: { url: "/models/horse.glb" },
      }],
    });
    const gltfDef = defs.find(d => d.id.includes("gltf/horse"));
    expect(gltfDef).toBeDefined();
    expect(gltfDef!.tags).toContain("gltf");
    expect(gltfDef!.modelClass).toBe("QUADRUPED");
  });

  it("converts url sources into metadata-only definitions", () => {
    const defs = createModelDefinitions({
      sources: [{
        type: "url",
        category: "PROP",
        license: CC0_LICENSE,
        url: "https://example.com/table.glb",
      }],
    });
    const urlDef = defs.find(d => d.id.includes("url/table"));
    expect(urlDef).toBeDefined();
    expect(urlDef!.tags).toContain("external");
  });

  it("includes provided sources even when fallbackToProcedural=false", () => {
    const defs = createModelDefinitions({
      fallbackToProcedural: false,
      sources: [{
        type: "procedural",
        category: "BIPED",
        license: PROCEDURAL_LICENSE,
        proceduralConfig: {
          category: "BIPED",
          id: "SOLO_BIPED",
          name: "Solo Biped",
          modelName: "SoloBiped",
        },
      }],
    });
    expect(defs.length).toBe(1);
    expect(defs[0]!.name).toBe("Solo Biped");
  });

  it("procedural source without config falls back to first known resource with a loader", () => {
    const defs = createModelDefinitions({
      fallbackToProcedural: false,
      sources: [{
        type: "procedural",
        category: "PROP",
        license: PROCEDURAL_LICENSE,
      }],
    });
    const propDef = defs.find(d => d.category === "props");
    expect(propDef).toBeDefined();
    expect(propDef!.loader).toBeDefined();
    const loaded = propDef!.loader!(propDef as any);
    expect((loaded as any).geometry.vertices.length).toBeGreaterThan(0);
  });
});

describe("getOpenSourcePipelineSummary", () => {
  it("returns statistics about available definitions", () => {
    const summary = getOpenSourcePipelineSummary();
    expect(summary.totalDefinitions).toBeGreaterThan(50);
    expect(summary.license).toBe("MIT");
    expect(Object.keys(summary.byCategory).length).toBeGreaterThan(3);
  });
});

// ── Integration: Definitions register with ModelResourceCatalog ────

describe("ModelResourceCatalog integration", () => {
  it("registers procedural definitions and loads them lazily", async () => {
    const defs = createProceduralDefinitions("PROP");
    const catalog = new ModelResourceCatalog(defs);

    const summaries = catalog.list();
    expect(summaries.length).toBe(defs.length);

    // Load first definition
    const firstId = defs[0]!.id;
    const loaded = await catalog.load(firstId);
    expect(loaded).toBeDefined();
    expect(loaded.geometry.vertices.length).toBeGreaterThan(0);
  });

  it("registers ALL definitions without id collisions", () => {
    const defs = createAllProceduralDefinitions();
    const ids = defs.map(d => d.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    const catalog = new ModelResourceCatalog(defs);
    expect(catalog.list().length).toBe(defs.length);
  });
});

// ── Blender Pipeline ───────────────────────────────────────────────

describe("getBlenderJointMap", () => {
  it("returns biped joint mapping", () => {
    const map = getBlenderJointMap("BIPED");
    expect(map["Hips"]).toBe("ROOT");
    expect(map["Head"]).toBe("HEAD");
    expect(map["UpperArm.L"]).toBe("LEFT_SHOULDER");
  });
});

describe("generateBlenderExportScript", () => {
  it("generates a valid Python script", () => {
    const script = generateBlenderExportScript();
    expect(script).toContain("import bpy");
    expect(script).toContain("export_scene.gltf");
    expect(script).toContain("BONE_NAME_MAP");
    expect(script).toContain("ROOT");
  });

  it("snapshots modifier names before applying to avoid iteration-mutation bug", () => {
    const script = generateBlenderExportScript();
    expect(script).toContain("mod_names = [mod.name for mod in obj.modifiers]");
    expect(script).toContain("for mod_name in mod_names:");
  });

  it("respects custom config", () => {
    const script = generateBlenderExportScript({
      outputDir: "./custom/path",
      format: "gltf",
    });
    expect(script).toContain("./custom/path");
    expect(script).toContain("GLTF");
  });

  it("escapes special characters in outputDir to prevent injection", () => {
    const script = generateBlenderExportScript({
      outputDir: 'path/with"quotes\\and\\backslashes',
      format: "glb",
    });
    // Should not contain an unescaped double-quote that would break the Python string
    expect(script).toContain('path/with\\"quotes\\\\and\\\\backslashes');
    expect(script).not.toContain('path/with"quotes');
  });
});

describe("getAssetSourceGuide", () => {
  it("returns documentation with recommended sources", () => {
    const guide = getAssetSourceGuide();
    expect(guide).toContain("Mixamo");
    expect(guide).toContain("Quaternius");
    expect(guide).toContain("Kenney");
    expect(guide).toContain("CC0");
    expect(guide).toContain("blender");
  });
});

// ── License metadata ───────────────────────────────────────────────

describe("license constants", () => {
  it("CC0 license has correct SPDX", () => {
    expect(CC0_LICENSE.spdxId).toBe("CC0-1.0");
  });

  it("procedural license has correct SPDX", () => {
    expect(PROCEDURAL_LICENSE.spdxId).toBe("MIT");
    expect(PROCEDURAL_LICENSE.author).toBe("LookingGlass");
  });
});
