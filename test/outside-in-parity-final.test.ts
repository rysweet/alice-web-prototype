/**
 * Outside-in integration tests for PR #31 — TS 100% Parity Final
 *
 * These tests exercise tweedle-type-system, resource-manager, and serialization
 * from the outside, as a consumer/user would. They cover:
 *   - Simple happy-path scenarios
 *   - Edge cases and error paths
 *   - Cross-module integration (type system + serialization round-trip)
 */
import { describe, it, expect } from "vitest";
import {
  createTypeHierarchy,
  TweedleTypeError,
  type AbstractType,
} from "../src/tweedle-type-system.js";
import {
  createResourceManager,
  type ResourceManager,
} from "../src/resource-manager.js";
import {
  serialize,
  deserialize,
  serializeToXml,
  deserializeFromXml,
  SerializationError,
} from "../src/serialization.js";
import type { ClassDecl } from "../src/tweedle-parser.js";
import type { AliceProject } from "../src/a3p-parser.js";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeClass(
  name: string,
  superClass: string | null = null,
  methods: any[] = [],
  fields: any[] = [],
): ClassDecl {
  return { name, superClass, methods, fields };
}

function makeProject(overrides: Partial<AliceProject> = {}): AliceProject {
  return {
    version: "3.7",
    projectName: "TestProject",
    sceneObjects: [
      {
        name: "ground",
        typeName: "SGround",
        resourceType: null,
        position: { x: 0, y: 0, z: 0 },
        orientation: null,
        size: null,
      },
    ],
    methods: [
      {
        name: "myFirstMethod",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [
          { kind: "invocation", object: "this", method: "say", arguments: ["hello"] },
        ],
      },
    ],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Type System — Simple Scenario
// ═══════════════════════════════════════════════════════════════════════════

describe("Outside-In: Type System", () => {
  it("resolves built-in entity types and checks assignability", () => {
    const hierarchy = createTypeHierarchy([]);
    const sBiped = hierarchy.resolve("SBiped");
    const sThing = hierarchy.resolve("SThing");
    const sModel = hierarchy.resolve("SModel");

    expect(sBiped).not.toBeNull();
    expect(sThing).not.toBeNull();
    expect(sModel).not.toBeNull();

    // SBiped → SJointedModel → SModel → SMovableTurnable → STurnable → SThing
    expect(hierarchy.isAssignableTo(sBiped!, sThing!)).toBe(true);
    expect(hierarchy.isAssignableTo(sBiped!, sModel!)).toBe(true);
    // SThing is NOT assignable to SBiped
    expect(hierarchy.isAssignableTo(sThing!, sBiped!)).toBe(false);
  });

  it("registers user classes with inheritance and verifies supertypes", () => {
    const classes = [
      makeClass("Cat", "SBiped"),
      makeClass("Kitten", "Cat"),
    ];
    const hierarchy = createTypeHierarchy(classes);

    const kitten = hierarchy.resolve("Kitten")!;
    const cat = hierarchy.resolve("Cat")!;
    const sBiped = hierarchy.resolve("SBiped")!;

    // Kitten → Cat → SBiped → SJointedModel → SModel → ...
    expect(hierarchy.isAssignableTo(kitten, cat)).toBe(true);
    expect(hierarchy.isAssignableTo(kitten, sBiped)).toBe(true);

    const supers = hierarchy.supertypesOf(kitten);
    expect(supers.map((t) => t.name)).toContain("Cat");
    expect(supers.map((t) => t.name)).toContain("SBiped");
  });

  it("primitive numeric widening: WholeNumber → DecimalNumber", () => {
    const hierarchy = createTypeHierarchy([]);
    const whole = hierarchy.resolve("WholeNumber")!;
    const decimal = hierarchy.resolve("DecimalNumber")!;

    expect(hierarchy.isAssignableTo(whole, decimal)).toBe(true);
    expect(hierarchy.isAssignableTo(decimal, whole)).toBe(false);
  });

  it("null type is assignable to non-primitives", () => {
    const hierarchy = createTypeHierarchy([]);
    const nullType = hierarchy.resolve("null")!;
    const sThing = hierarchy.resolve("SThing")!;
    const whole = hierarchy.resolve("WholeNumber")!;

    expect(nullType).not.toBeNull();
    expect(hierarchy.isAssignableTo(nullType, sThing)).toBe(true);
    expect(hierarchy.isAssignableTo(nullType, whole)).toBe(false);
  });

  // Edge case
  it("throws TweedleTypeError on inheritance cycle", () => {
    const classes = [
      makeClass("A", "B"),
      makeClass("B", "A"),
    ];
    expect(() => createTypeHierarchy(classes)).toThrow(TweedleTypeError);
  });

  it("throws TweedleTypeError on duplicate class name", () => {
    const classes = [makeClass("Foo"), makeClass("Foo")];
    expect(() => createTypeHierarchy(classes)).toThrow(TweedleTypeError);
  });

  it("type.isAssignableTo() method works on resolved types", () => {
    const hierarchy = createTypeHierarchy([makeClass("Dog", "SBiped")]);
    const dog = hierarchy.resolve("Dog")!;
    const sThing = hierarchy.resolve("SThing")!;
    expect(dog.isAssignableTo(sThing)).toBe(true);
    expect(sThing.isAssignableTo(dog)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Resource Manager — Simple + Edge
// ═══════════════════════════════════════════════════════════════════════════

describe("Outside-In: Resource Manager", () => {
  it("registers, loads, and caches resources", async () => {
    const data = new Uint8Array([1, 2, 3]);
    const mgr = createResourceManager(async () => data);

    mgr.register("tex/cat.png", "texture");
    expect(mgr.has("tex/cat.png")).toBe(true);

    const loaded = await mgr.get("tex/cat.png");
    expect(loaded).toEqual(data);

    // Second get should be a cache hit
    await mgr.get("tex/cat.png");
    expect(mgr.stats().hits).toBe(1);
    expect(mgr.stats().misses).toBe(1);
  });

  it("deduplicates concurrent loads", async () => {
    let loadCount = 0;
    const mgr = createResourceManager(async () => {
      loadCount++;
      return new Uint8Array([42]);
    });

    mgr.register("model/biped.glb", "model");
    const [a, b] = await Promise.all([
      mgr.get("model/biped.glb"),
      mgr.get("model/biped.glb"),
    ]);

    expect(a).toEqual(b);
    expect(loadCount).toBe(1);
  });

  it("LRU eviction works with maxCacheSize", async () => {
    let counter = 0;
    const mgr = createResourceManager(
      async () => new Uint8Array([++counter]),
      { maxCacheSize: 2 },
    );

    mgr.register("a", "texture");
    mgr.register("b", "texture");
    mgr.register("c", "texture");

    await mgr.get("a");
    await mgr.get("b");
    // Cache is full (a, b). Loading c should evict oldest (a).
    await mgr.get("c");

    expect(mgr.getIfLoaded("a")).toBeNull();
    expect(mgr.getIfLoaded("c")).not.toBeNull();
    expect(mgr.stats().evictions).toBeGreaterThanOrEqual(1);
  });

  it("throws on unknown resource key", async () => {
    const mgr = createResourceManager(async () => new Uint8Array([0]));
    await expect(mgr.get("nonexistent")).rejects.toThrow("Unknown resource");
  });

  it("throws on empty key or duplicate registration", () => {
    const mgr = createResourceManager(async () => new Uint8Array([0]));
    expect(() => mgr.register("", "texture")).toThrow();
    mgr.register("x", "model");
    expect(() => mgr.register("x", "model")).toThrow();
  });

  it("entriesByType filters correctly", () => {
    const mgr = createResourceManager(async () => new Uint8Array([0]));
    mgr.register("tex1", "texture");
    mgr.register("mod1", "model");
    mgr.register("aud1", "audio");

    const textures = mgr.entriesByType("texture");
    expect(textures).toHaveLength(1);
    expect(textures[0].key).toBe("tex1");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Serialization — JSON & XML round-trips
// ═══════════════════════════════════════════════════════════════════════════

describe("Outside-In: Serialization", () => {
  it("JSON round-trip preserves project data", () => {
    const project = makeProject();
    const json = serialize(project, { format: "json" });
    const restored = deserialize(json, "json");

    expect(restored.version).toBe(project.version);
    expect(restored.projectName).toBe(project.projectName);
    expect(restored.sceneObjects).toHaveLength(1);
    expect(restored.sceneObjects[0].name).toBe("ground");
    expect(restored.methods[0].name).toBe("myFirstMethod");
    expect(restored.methods[0].statements[0].arguments).toEqual(["hello"]);
  });

  it("XML round-trip preserves project data", () => {
    const project = makeProject();
    const xml = serializeToXml(project);
    const restored = deserializeFromXml(xml);

    expect(restored.version).toBe(project.version);
    expect(restored.projectName).toBe(project.projectName);
    expect(restored.sceneObjects).toHaveLength(1);
    expect(restored.methods[0].statements[0].kind).toBe("invocation");
  });

  it("JSON compact mode (pretty=false)", () => {
    const project = makeProject();
    const compact = serialize(project, { format: "json", pretty: false });
    expect(compact).not.toContain("\n");
    const restored = deserialize(compact, "json");
    expect(restored.projectName).toBe("TestProject");
  });

  it("XML preserves optional fields (joints, bounding boxes, textures)", () => {
    const project = makeProject({
      jointHierarchy: [
        {
          name: "root",
          parentName: null,
          children: [],
          localTransform: {
            position: { x: 0, y: 0, z: 0 },
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
        },
      ],
      boundingBoxes: {
        cat: {
          min: { x: -1, y: -1, z: -1 },
          max: { x: 1, y: 1, z: 1 },
        },
      },
      textureRefs: ["textures/fur.png", "textures/eyes.png"],
    });

    const xml = serializeToXml(project);
    const restored = deserializeFromXml(xml);

    expect(restored.jointHierarchy).toHaveLength(1);
    expect(restored.jointHierarchy![0].name).toBe("root");
    expect(restored.boundingBoxes!["cat"].min.x).toBe(-1);
    expect(restored.textureRefs).toEqual(["textures/fur.png", "textures/eyes.png"]);
  });

  // Edge cases
  it("throws SerializationError on invalid JSON", () => {
    expect(() => deserialize("{broken", "json")).toThrow(SerializationError);
  });

  it("throws SerializationError on JSON missing required fields", () => {
    expect(() => deserialize("{}", "json")).toThrow(SerializationError);
    expect(() =>
      deserialize(JSON.stringify({ version: "1", projectName: "P" }), "json"),
    ).toThrow(SerializationError);
  });

  it("throws SerializationError on malformed XML", () => {
    expect(() => deserialize("<not-xml>", "xml")).toThrow(SerializationError);
  });

  it("throws SerializationError on XML with wrong root element", () => {
    expect(() =>
      deserialize('<wrong-root version="1" projectName="P"/>', "xml"),
    ).toThrow(SerializationError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Cross-Module Integration
// ═══════════════════════════════════════════════════════════════════════════

describe("Outside-In: Cross-Module Integration", () => {
  it("type system types align with serialized project scene object types", () => {
    const hierarchy = createTypeHierarchy([]);
    const project = makeProject({
      sceneObjects: [
        {
          name: "ground",
          typeName: "SGround",
          resourceType: null,
          position: null,
          orientation: null,
          size: null,
        },
        {
          name: "cat",
          typeName: "SBiped",
          resourceType: "model",
          position: { x: 1, y: 0, z: 2 },
          orientation: null,
          size: null,
        },
      ],
    });

    // All scene object types should be resolvable in the type system
    for (const obj of project.sceneObjects) {
      const type = hierarchy.resolve(obj.typeName);
      expect(type).not.toBeNull();
      // All built-in entity types should be assignable to SThing
      const sThing = hierarchy.resolve("SThing")!;
      expect(hierarchy.isAssignableTo(type!, sThing)).toBe(true);
    }

    // Verify round-trip through JSON and XML
    const jsonRt = deserialize(serialize(project, { format: "json" }), "json");
    const xmlRt = deserialize(serialize(project, { format: "xml" }), "xml");
    expect(jsonRt.sceneObjects).toHaveLength(2);
    expect(xmlRt.sceneObjects).toHaveLength(2);
    expect(xmlRt.sceneObjects[1].typeName).toBe("SBiped");
  });

  it("resource manager entries match project texture refs", () => {
    const project = makeProject({
      textureRefs: ["tex/cat.png", "tex/dog.png"],
    });
    const mgr = createResourceManager(async () => new Uint8Array([0]));

    // Register all texture refs from the project
    for (const ref of project.textureRefs!) {
      mgr.register(ref, "texture");
    }

    expect(mgr.entriesByType("texture")).toHaveLength(2);
    expect(mgr.has("tex/cat.png")).toBe(true);
    expect(mgr.has("tex/dog.png")).toBe(true);

    // After remove, the resource should no longer be present
    mgr.remove("tex/cat.png");
    expect(mgr.entriesByType("texture")).toHaveLength(1);
  });
});
