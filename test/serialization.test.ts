import { describe, it, expect } from "vitest";
import {
  serialize,
  deserialize,
  serializeToXml,
  serializeToJson,
  deserializeFromXml,
  deserializeFromJson,
  SerializationError,
} from "../src/serialization.js";
import type {
  SerializationFormat,
  SerializationOptions,
} from "../src/serialization.js";
import type {
  AliceProject,
  AliceObject,
  AliceMethod,
  AliceStatement,
} from "../src/a3p-parser.js";

// ═══════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════

function minimalProject(): AliceProject {
  return {
    version: "0.0.1",
    projectName: "TestProject",
    sceneObjects: [],
    methods: [],
  };
}

function fullProject(): AliceProject {
  return {
    version: "0.0.1",
    projectName: "FullScene",
    sceneObjects: [
      {
        name: "ground",
        typeName: "SGround",
        resourceType: "",
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        size: { width: 1, height: 1, depth: 1 },
      },
      {
        name: "bunny",
        typeName: "SBiped",
        resourceType: "org.lgna.story.resources.biped.BunnyResource",
        position: { x: 2.5, y: 0, z: -1.3 },
        orientation: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 },
        size: { width: 0.8, height: 1.2, depth: 0.6 },
      },
    ],
    methods: [
      {
        name: "myFirstMethod",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [
          {
            kind: "MethodCall",
            object: "this.bunny",
            method: "move",
            arguments: ["FORWARD", "1.0"],
          },
        ],
      },
      {
        name: "getDistance",
        isFunction: true,
        returnType: "DecimalNumber",
        parameters: [
          { name: "target", type: "SThing" },
          { name: "speed", type: "DecimalNumber" },
        ],
        statements: [
          {
            kind: "ReturnStatement",
            expression: "3.14",
          },
        ],
      },
    ],
    jointHierarchy: [
      {
        name: "ROOT",
        parentName: null,
        children: [
          {
            name: "SPINE_BASE",
            parentName: "ROOT",
            children: [],
            localTransform: {
              position: { x: 0, y: 0.5, z: 0 },
              orientation: { x: 0, y: 0, z: 0, w: 1 },
            },
          },
        ],
        localTransform: {
          position: { x: 0, y: 0, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      },
    ],
    boundingBoxes: {
      BunnyResource: {
        min: { x: -0.3, y: 0, z: -0.2 },
        max: { x: 0.3, y: 1.5, z: 0.2 },
      },
    },
    textureRefs: [
      "resources/textures/skin.png",
      "resources/textures/eye.png",
    ],
  };
}

function projectWithNullFields(): AliceProject {
  return {
    version: "0.0.1",
    projectName: "NullFields",
    sceneObjects: [
      {
        name: "camera",
        typeName: "SCamera",
        resourceType: null,
        position: null,
        orientation: null,
        size: null,
      },
    ],
    methods: [],
  };
}

function projectWithNestedStatements(): AliceProject {
  return {
    version: "0.0.1",
    projectName: "Nested",
    sceneObjects: [],
    methods: [
      {
        name: "complexMethod",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [
          {
            kind: "DoInOrder",
            body: [
              {
                kind: "MethodCall",
                object: "this.bunny",
                method: "move",
                arguments: ["FORWARD", "1.0"],
              },
              {
                kind: "IfElse",
                condition: "true",
                ifBody: [
                  {
                    kind: "MethodCall",
                    object: "this.bunny",
                    method: "turn",
                    arguments: ["LEFT", "0.5"],
                  },
                ],
                elseBody: [
                  {
                    kind: "MethodCall",
                    object: "this.bunny",
                    method: "turn",
                    arguments: ["RIGHT", "0.5"],
                  },
                ],
              },
            ],
          },
          {
            kind: "CountLoop",
            count: 3,
            body: [
              {
                kind: "MethodCall",
                object: "this.bunny",
                method: "jump",
                arguments: [],
              },
            ],
          },
          {
            kind: "ForEach",
            name: "item",
            varType: "SThing",
            body: [
              {
                kind: "MethodCall",
                object: "item",
                method: "setOpacity",
                arguments: ["0.5"],
              },
            ],
          },
          {
            kind: "DoTogether",
            body: [
              {
                kind: "MethodCall",
                object: "this.bunny",
                method: "move",
                arguments: ["UP", "2.0"],
              },
            ],
          },
          {
            kind: "VariableDeclaration",
            name: "speed",
            varType: "DecimalNumber",
            value: "3.14",
          },
          {
            kind: "Comment",
            expression: "This is a comment",
          },
        ],
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. PUBLIC API & EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Serialization – public API", () => {
  it("exports serialize and deserialize functions", () => {
    expect(typeof serialize).toBe("function");
    expect(typeof deserialize).toBe("function");
  });

  it("exports convenience functions", () => {
    expect(typeof serializeToXml).toBe("function");
    expect(typeof serializeToJson).toBe("function");
    expect(typeof deserializeFromXml).toBe("function");
    expect(typeof deserializeFromJson).toBe("function");
  });

  it("exports SerializationError class", () => {
    expect(SerializationError).toBeDefined();
    expect(typeof SerializationError).toBe("function");
  });

  it("SerializationError is an Error subclass with format field", () => {
    const err = new SerializationError("test error", "json");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SerializationError);
    expect(err.message).toBe("test error");
    expect(err.format).toBe("json");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. JSON SERIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

describe("JSON serialization", () => {
  it("serializes minimal project to valid JSON", () => {
    const json = serializeToJson(minimalProject());
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe("0.0.1");
    expect(parsed.projectName).toBe("TestProject");
    expect(parsed.sceneObjects).toEqual([]);
    expect(parsed.methods).toEqual([]);
  });

  it("serializes full project with all fields", () => {
    const json = serializeToJson(fullProject());
    const parsed = JSON.parse(json);
    expect(parsed.sceneObjects.length).toBe(2);
    expect(parsed.methods.length).toBe(2);
    expect(parsed.jointHierarchy).toBeDefined();
    expect(parsed.boundingBoxes).toBeDefined();
    expect(parsed.textureRefs).toBeDefined();
  });

  it("handles null position/orientation/size on scene objects", () => {
    const json = serializeToJson(projectWithNullFields());
    const parsed = JSON.parse(json);
    expect(parsed.sceneObjects[0].position).toBeNull();
    expect(parsed.sceneObjects[0].orientation).toBeNull();
    expect(parsed.sceneObjects[0].size).toBeNull();
    expect(parsed.sceneObjects[0].resourceType).toBeNull();
  });

  it("pretty option produces indented output", () => {
    const pretty = serialize(minimalProject(), { format: "json", pretty: true });
    expect(pretty).toContain("\n");
    expect(pretty).toContain("  ");
  });

  it("compact option produces single-line output", () => {
    const compact = serialize(minimalProject(), { format: "json", pretty: false });
    expect(compact.split("\n").length).toBe(1);
  });

  it("default pretty is true", () => {
    const result = serialize(minimalProject(), { format: "json" });
    expect(result).toContain("\n");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. JSON DESERIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

describe("JSON deserialization", () => {
  it("deserializes valid JSON to AliceProject", () => {
    const json = serializeToJson(minimalProject());
    const project = deserializeFromJson(json);
    expect(project.version).toBe("0.0.1");
    expect(project.projectName).toBe("TestProject");
    expect(project.sceneObjects).toEqual([]);
    expect(project.methods).toEqual([]);
  });

  it("defaults optional fields when absent", () => {
    const json = JSON.stringify({
      version: "0.0.1",
      projectName: "Test",
      sceneObjects: [],
      methods: [],
    });
    const project = deserializeFromJson(json);
    expect(project.jointHierarchy ?? []).toEqual([]);
    expect(project.boundingBoxes ?? {}).toEqual({});
    expect(project.textureRefs ?? []).toEqual([]);
  });

  it("throws SerializationError on malformed JSON", () => {
    expect(() => deserializeFromJson("not valid json {{{")).toThrow(SerializationError);
    try {
      deserializeFromJson("not json");
    } catch (e) {
      expect((e as SerializationError).format).toBe("json");
    }
  });

  it("throws SerializationError on missing version", () => {
    const json = JSON.stringify({ projectName: "X", sceneObjects: [], methods: [] });
    expect(() => deserializeFromJson(json)).toThrow(SerializationError);
    expect(() => deserializeFromJson(json)).toThrow(/version/i);
  });

  it("throws SerializationError on missing projectName", () => {
    const json = JSON.stringify({ version: "1", sceneObjects: [], methods: [] });
    expect(() => deserializeFromJson(json)).toThrow(SerializationError);
    expect(() => deserializeFromJson(json)).toThrow(/projectName/i);
  });

  it("throws SerializationError on missing sceneObjects", () => {
    const json = JSON.stringify({ version: "1", projectName: "X", methods: [] });
    expect(() => deserializeFromJson(json)).toThrow(SerializationError);
    expect(() => deserializeFromJson(json)).toThrow(/sceneObjects/i);
  });

  it("throws SerializationError on missing methods", () => {
    const json = JSON.stringify({ version: "1", projectName: "X", sceneObjects: [] });
    expect(() => deserializeFromJson(json)).toThrow(SerializationError);
    expect(() => deserializeFromJson(json)).toThrow(/methods/i);
  });

  it("throws SerializationError when sceneObjects is not an array", () => {
    const json = JSON.stringify({
      version: "1", projectName: "X", sceneObjects: "wrong", methods: [],
    });
    expect(() => deserializeFromJson(json)).toThrow(SerializationError);
    expect(() => deserializeFromJson(json)).toThrow(/array/i);
  });

  it("throws SerializationError when methods is not an array", () => {
    const json = JSON.stringify({
      version: "1", projectName: "X", sceneObjects: [], methods: "wrong",
    });
    expect(() => deserializeFromJson(json)).toThrow(SerializationError);
    expect(() => deserializeFromJson(json)).toThrow(/array/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. XML SERIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

describe("XML serialization", () => {
  it("serializes minimal project to XML with root element", () => {
    const xml = serializeToXml(minimalProject());
    expect(xml).toContain("<alice-project");
    expect(xml).toContain('version="0.0.1"');
    expect(xml).toContain('projectName="TestProject"');
    expect(xml).toContain("<scene-objects");
    expect(xml).toContain("<methods");
  });

  it("serializes scene objects with attributes", () => {
    const xml = serializeToXml(fullProject());
    expect(xml).toContain('<scene-object');
    expect(xml).toContain('name="ground"');
    expect(xml).toContain('typeName="SGround"');
    expect(xml).toContain("<position");
    expect(xml).toContain("<orientation");
    expect(xml).toContain("<size");
  });

  it("serializes methods with parameters and statements", () => {
    const xml = serializeToXml(fullProject());
    expect(xml).toContain('<method');
    expect(xml).toContain('name="myFirstMethod"');
    expect(xml).toContain('isFunction="false"');
    expect(xml).toContain('<statement');
    expect(xml).toContain('kind="MethodCall"');
  });

  it("serializes joint hierarchy when present", () => {
    const xml = serializeToXml(fullProject());
    expect(xml).toContain("<joint-hierarchy");
    expect(xml).toContain('<joint');
    expect(xml).toContain('name="ROOT"');
  });

  it("serializes bounding boxes when present", () => {
    const xml = serializeToXml(fullProject());
    expect(xml).toContain("<bounding-box");
    expect(xml).toContain('name="BunnyResource"');
    expect(xml).toContain("<min");
    expect(xml).toContain("<max");
  });

  it("serializes texture refs when present", () => {
    const xml = serializeToXml(fullProject());
    expect(xml).toContain("<texture-ref");
    expect(xml).toContain('path="resources/textures/skin.png"');
  });

  it("handles null fields on scene objects", () => {
    const xml = serializeToXml(projectWithNullFields());
    expect(xml).toContain('name="camera"');
    // null position/orientation/size should be omitted or handled gracefully
    const parsed = deserializeFromXml(xml);
    expect(parsed.sceneObjects[0].position).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. XML DESERIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

describe("XML deserialization", () => {
  it("deserializes valid XML to AliceProject", () => {
    const xml = serializeToXml(minimalProject());
    const project = deserializeFromXml(xml);
    expect(project.version).toBe("0.0.1");
    expect(project.projectName).toBe("TestProject");
    expect(project.sceneObjects).toEqual([]);
    expect(project.methods).toEqual([]);
  });

  it("throws SerializationError on malformed XML", () => {
    expect(() => deserializeFromXml("<not-xml")).toThrow(SerializationError);
    try {
      deserializeFromXml("<broken");
    } catch (e) {
      expect((e as SerializationError).format).toBe("xml");
    }
  });

  it("throws SerializationError on wrong root element", () => {
    expect(() => deserializeFromXml("<wrong-root/>")).toThrow(SerializationError);
    expect(() => deserializeFromXml("<wrong-root/>")).toThrow(/alice-project/i);
  });

  it("throws SerializationError on missing scene-objects", () => {
    const xml = '<alice-project version="1" projectName="X"><methods/></alice-project>';
    expect(() => deserializeFromXml(xml)).toThrow(SerializationError);
    expect(() => deserializeFromXml(xml)).toThrow(/scene-objects/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. JSON ROUND-TRIP FIDELITY
// ═══════════════════════════════════════════════════════════════════════════

describe("JSON round-trip fidelity", () => {
  it("minimal project round-trips", () => {
    const original = minimalProject();
    const restored = deserializeFromJson(serializeToJson(original));
    expect(restored).toEqual(original);
  });

  it("full project round-trips", () => {
    const original = fullProject();
    const restored = deserializeFromJson(serializeToJson(original));
    expect(restored).toEqual(original);
  });

  it("project with null fields round-trips", () => {
    const original = projectWithNullFields();
    const restored = deserializeFromJson(serializeToJson(original));
    expect(restored).toEqual(original);
  });

  it("project with nested statements round-trips", () => {
    const original = projectWithNestedStatements();
    const restored = deserializeFromJson(serializeToJson(original));
    expect(restored).toEqual(original);
  });

  it("compact JSON round-trips", () => {
    const original = fullProject();
    const compact = serialize(original, { format: "json", pretty: false });
    const restored = deserialize(compact, "json");
    expect(restored).toEqual(original);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. XML ROUND-TRIP FIDELITY
// ═══════════════════════════════════════════════════════════════════════════

describe("XML round-trip fidelity", () => {
  it("minimal project round-trips", () => {
    const original = minimalProject();
    const restored = deserializeFromXml(serializeToXml(original));
    expect(restored).toEqual(original);
  });

  it("full project round-trips", () => {
    const original = fullProject();
    const restored = deserializeFromXml(serializeToXml(original));
    expect(restored).toEqual(original);
  });

  it("project with null fields round-trips", () => {
    const original = projectWithNullFields();
    const restored = deserializeFromXml(serializeToXml(original));
    expect(restored).toEqual(original);
  });

  it("project with nested statements round-trips (if/else, count loops, for-each)", () => {
    const original = projectWithNestedStatements();
    const restored = deserializeFromXml(serializeToXml(original));
    expect(restored).toEqual(original);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. CROSS-FORMAT ROUND-TRIP
// ═══════════════════════════════════════════════════════════════════════════

describe("Cross-format round-trip", () => {
  it("JSON → XML → JSON produces same project", () => {
    const original = fullProject();
    const json1 = serializeToJson(original);
    const fromJson = deserializeFromJson(json1);
    const xml = serializeToXml(fromJson);
    const fromXml = deserializeFromXml(xml);
    const json2 = serializeToJson(fromXml);
    expect(JSON.parse(json2)).toEqual(JSON.parse(json1));
  });

  it("XML → JSON → XML → deserialize produces same project", () => {
    const original = fullProject();
    const xml1 = serializeToXml(original);
    const fromXml = deserializeFromXml(xml1);
    const json = serializeToJson(fromXml);
    const fromJson = deserializeFromJson(json);
    expect(fromJson).toEqual(fromXml);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. OPTIONS-BASED API
// ═══════════════════════════════════════════════════════════════════════════

describe("serialize/deserialize with options", () => {
  it("serialize with format: 'json' matches serializeToJson", () => {
    const p = minimalProject();
    const a = serialize(p, { format: "json" });
    const b = serializeToJson(p);
    expect(a).toBe(b);
  });

  it("serialize with format: 'xml' matches serializeToXml", () => {
    const p = minimalProject();
    const a = serialize(p, { format: "xml" });
    const b = serializeToXml(p);
    expect(a).toBe(b);
  });

  it("deserialize with format: 'json' matches deserializeFromJson", () => {
    const json = serializeToJson(minimalProject());
    const a = deserialize(json, "json");
    const b = deserializeFromJson(json);
    expect(a).toEqual(b);
  });

  it("deserialize with format: 'xml' matches deserializeFromXml", () => {
    const xml = serializeToXml(minimalProject());
    const a = deserialize(xml, "xml");
    const b = deserializeFromXml(xml);
    expect(a).toEqual(b);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. STATEMENT SERIALIZATION COVERAGE
// ═══════════════════════════════════════════════════════════════════════════

describe("Statement kind coverage", () => {
  function projectWithStatement(stmt: AliceStatement): AliceProject {
    return {
      version: "0.0.1",
      projectName: "StmtTest",
      sceneObjects: [],
      methods: [{
        name: "test",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [stmt],
      }],
    };
  }

  it("MethodCall round-trips in both formats", () => {
    const stmt: AliceStatement = {
      kind: "MethodCall", object: "this.x", method: "go", arguments: ["1", "2"],
    };
    const p = projectWithStatement(stmt);
    expect(deserializeFromJson(serializeToJson(p))).toEqual(p);
    expect(deserializeFromXml(serializeToXml(p))).toEqual(p);
  });

  it("CountLoop round-trips in both formats", () => {
    const stmt: AliceStatement = {
      kind: "CountLoop", count: 5,
      body: [{ kind: "MethodCall", object: "x", method: "m", arguments: [] }],
    };
    const p = projectWithStatement(stmt);
    expect(deserializeFromJson(serializeToJson(p))).toEqual(p);
    expect(deserializeFromXml(serializeToXml(p))).toEqual(p);
  });

  it("ReturnStatement round-trips in both formats", () => {
    const stmt: AliceStatement = { kind: "ReturnStatement", expression: "42" };
    const p = projectWithStatement(stmt);
    expect(deserializeFromJson(serializeToJson(p))).toEqual(p);
    expect(deserializeFromXml(serializeToXml(p))).toEqual(p);
  });

  it("VariableDeclaration round-trips in both formats", () => {
    const stmt: AliceStatement = {
      kind: "VariableDeclaration", name: "x", varType: "DecimalNumber", value: "0",
    };
    const p = projectWithStatement(stmt);
    expect(deserializeFromJson(serializeToJson(p))).toEqual(p);
    expect(deserializeFromXml(serializeToXml(p))).toEqual(p);
  });

  it("IfElse round-trips in both formats", () => {
    const stmt: AliceStatement = {
      kind: "IfElse", condition: "true",
      ifBody: [{ kind: "MethodCall", object: "x", method: "a", arguments: [] }],
      elseBody: [{ kind: "MethodCall", object: "x", method: "b", arguments: [] }],
    };
    const p = projectWithStatement(stmt);
    expect(deserializeFromJson(serializeToJson(p))).toEqual(p);
    expect(deserializeFromXml(serializeToXml(p))).toEqual(p);
  });

  it("ForEach round-trips in both formats", () => {
    const stmt: AliceStatement = {
      kind: "ForEach", name: "item", varType: "SThing",
      body: [{ kind: "MethodCall", object: "item", method: "m", arguments: [] }],
    };
    const p = projectWithStatement(stmt);
    expect(deserializeFromJson(serializeToJson(p))).toEqual(p);
    expect(deserializeFromXml(serializeToXml(p))).toEqual(p);
  });

  it("DoInOrder round-trips in both formats", () => {
    const stmt: AliceStatement = {
      kind: "DoInOrder",
      body: [{ kind: "MethodCall", object: "x", method: "m", arguments: [] }],
    };
    const p = projectWithStatement(stmt);
    expect(deserializeFromJson(serializeToJson(p))).toEqual(p);
    expect(deserializeFromXml(serializeToXml(p))).toEqual(p);
  });

  it("DoTogether round-trips in both formats", () => {
    const stmt: AliceStatement = {
      kind: "DoTogether",
      body: [{ kind: "MethodCall", object: "x", method: "m", arguments: [] }],
    };
    const p = projectWithStatement(stmt);
    expect(deserializeFromJson(serializeToJson(p))).toEqual(p);
    expect(deserializeFromXml(serializeToXml(p))).toEqual(p);
  });

  it("Comment round-trips in both formats", () => {
    const stmt: AliceStatement = { kind: "Comment", expression: "hello world" };
    const p = projectWithStatement(stmt);
    expect(deserializeFromJson(serializeToJson(p))).toEqual(p);
    expect(deserializeFromXml(serializeToXml(p))).toEqual(p);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
  it("handles empty textureRefs array", () => {
    const p = { ...minimalProject(), textureRefs: [] };
    expect(deserializeFromJson(serializeToJson(p))).toEqual(p);
    expect(deserializeFromXml(serializeToXml(p))).toEqual(p);
  });

  it("handles empty jointHierarchy array", () => {
    const p = { ...minimalProject(), jointHierarchy: [] };
    expect(deserializeFromJson(serializeToJson(p))).toEqual(p);
    expect(deserializeFromXml(serializeToXml(p))).toEqual(p);
  });

  it("handles empty boundingBoxes object", () => {
    const p = { ...minimalProject(), boundingBoxes: {} };
    expect(deserializeFromJson(serializeToJson(p))).toEqual(p);
    expect(deserializeFromXml(serializeToXml(p))).toEqual(p);
  });

  it("handles method with empty statements array", () => {
    const p: AliceProject = {
      ...minimalProject(),
      methods: [{
        name: "empty",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [],
      }],
    };
    expect(deserializeFromJson(serializeToJson(p))).toEqual(p);
    expect(deserializeFromXml(serializeToXml(p))).toEqual(p);
  });

  it("handles special characters in strings", () => {
    const p: AliceProject = {
      ...minimalProject(),
      projectName: "Test & <Project> \"Quoted\"",
    };
    const jsonResult = deserializeFromJson(serializeToJson(p));
    expect(jsonResult.projectName).toBe(p.projectName);
    const xmlResult = deserializeFromXml(serializeToXml(p));
    expect(xmlResult.projectName).toBe(p.projectName);
  });

  it("handles MethodCall with empty arguments", () => {
    const p: AliceProject = {
      ...minimalProject(),
      methods: [{
        name: "test",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [{
          kind: "MethodCall",
          object: "this",
          method: "doIt",
          arguments: [],
        }],
      }],
    };
    expect(deserializeFromJson(serializeToJson(p))).toEqual(p);
    expect(deserializeFromXml(serializeToXml(p))).toEqual(p);
  });
});
