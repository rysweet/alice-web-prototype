import { describe, expect, it } from "vitest";
import type { AliceMethod, AliceProject, AliceStatement, AliceTypeDefinition } from "../a3p-parser.js";
import {
  CLASS_BEHAVIOR_PACKAGE_KIND,
  CLASS_BEHAVIOR_PACKAGE_VERSION,
  ClassBehaviorPackageError,
  MAX_CLASS_BEHAVIOR_ARRAY_ITEMS,
  MAX_CLASS_BEHAVIOR_JSON_BYTES,
  MAX_CLASS_BEHAVIOR_STRING_LENGTH,
  exportClassBehaviorPackage,
  importClassBehaviorPackage,
  parseClassBehaviorPackage,
  serializeClassBehaviorPackage,
  type AliceClassBehaviorPackage,
  type ClassBehaviorConflictStrategy,
} from "./class-behavior-package.js";

function createProject(types: AliceTypeDefinition[] = [createReusableDoorType()]): AliceProject {
  return {
    version: "3.10.0.0",
    projectName: "Alice Class Behavior Test",
    sceneObjects: [],
    methods: [
      {
        name: "projectOnlyMethod",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [{ kind: "comment", expression: "project methods are not part of a class package" }],
      },
    ],
    types,
  };
}

function createReusableDoorType(name = "ReusableDoor"): AliceTypeDefinition {
  return {
    name,
    superTypeName: "org.lgna.story.SModel",
    fields: [
      { name: "openCount", typeName: "Number", initializer: "0" },
      { name: "ownerName", typeName: "java.lang.String", initializer: "Alice" },
    ],
    constructors: [
      {
        name,
        isFunction: false,
        returnType: name,
        parameters: [{ name: "ownerName", type: "java.lang.String" }],
        statements: [
          { kind: "expression", expression: "this.ownerName = ownerName" },
          { kind: "call", object: "this", method: "resetDoor", arguments: [] },
        ],
      },
    ],
    methods: [
      {
        name: "openDoor",
        isFunction: false,
        returnType: "void",
        parameters: [{ name: "degrees", type: "Number" }],
        statements: [
          { kind: "call", object: "this", method: "turn", arguments: ["LEFT", "degrees"] },
          { kind: "expression", expression: "this.openCount = this.openCount + 1" },
        ],
      },
      {
        name: "isOpen",
        isFunction: true,
        returnType: "Boolean",
        parameters: [],
        statements: [{ kind: "return", expression: "this.openCount > 0" }],
      },
    ],
  };
}

function createPackage(type = createReusableDoorType()): AliceClassBehaviorPackage {
  return {
    kind: CLASS_BEHAVIOR_PACKAGE_KIND,
    version: CLASS_BEHAVIOR_PACKAGE_VERSION,
    exportedBy: "alice-web",
    evidence: [
      "class-behavior-type-present",
      "class-behavior-supertype-preserved",
      "class-behavior-fields-preserved",
      "class-behavior-constructors-preserved",
      "class-behavior-methods-preserved",
    ],
    type,
  };
}

function expectPackageError(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ClassBehaviorPackageError);
    expect((error as ClassBehaviorPackageError).code).toBe(code);
    return;
  }
  throw new Error(`Expected class behavior package error ${code}`);
}

describe("project-io/class-behavior-package", () => {
  it("exports one reusable Alice class behavior package from AliceTypeDefinition data", () => {
    const type = createReusableDoorType();
    const project = createProject([
      type,
      createReusableDoorType("HelperDoor"),
    ]);

    const packageData = exportClassBehaviorPackage(project, "ReusableDoor");

    expect(packageData).toEqual(createPackage(type));
    expect(packageData.type).not.toBe(type);
    expect(Object.keys(packageData).sort()).toEqual(["evidence", "exportedBy", "kind", "type", "version"]);
    expect(JSON.stringify(packageData)).not.toContain("projectOnlyMethod");
    expect(JSON.stringify(packageData)).not.toContain("HelperDoor");
  });

  it("serializes packages as stable pretty JSON for downloadable files", () => {
    const serialized = serializeClassBehaviorPackage(createPackage());

    expect(serialized).toBe(`${JSON.stringify(createPackage(), null, 2)}\n`);
    expect(serialized.length).toBeLessThanOrEqual(MAX_CLASS_BEHAVIOR_JSON_BYTES);
  });

  it("parses a valid JSON package without sharing mutable objects with the input", () => {
    const sourcePackage = createPackage();

    const parsed = parseClassBehaviorPackage(JSON.stringify(sourcePackage));
    parsed.type.fields?.push({ name: "localOnly", typeName: "Number" });

    expect(parsed).toEqual({
      ...sourcePackage,
      type: {
        ...sourcePackage.type,
        fields: [
          ...(sourcePackage.type.fields ?? []),
          { name: "localOnly", typeName: "Number" },
        ],
      },
    });
    expect(sourcePackage.type.fields?.map((field) => field.name)).toEqual(["openCount", "ownerName"]);
  });

  it("throws a typed error when the requested class behavior is missing", () => {
    expectPackageError(
      () => exportClassBehaviorPackage(createProject(), "MissingDoor"),
      "missing-class-behavior",
    );
  });

  it("rejects invalid package identity, version, and exporter values", () => {
    expectPackageError(
      () => parseClassBehaviorPackage({ ...createPackage(), kind: "alice.reusable-class-behavior" }),
      "invalid-class-behavior-package",
    );
    expectPackageError(
      () => parseClassBehaviorPackage({ ...createPackage(), version: 2 }),
      "unsupported-class-behavior-version",
    );
    expectPackageError(
      () => parseClassBehaviorPackage({ ...createPackage(), exportedBy: "other-tool" }),
      "invalid-class-behavior-package",
    );
  });

  it("rejects unsafe names before import can modify a project", () => {
    const target = createProject([]);
    const before = JSON.stringify(target);

    expectPackageError(
      () => importClassBehaviorPackage(target, createPackage(createReusableDoorType("Bad Name!"))),
      "unsafe-class-behavior-name",
    );
    expect(JSON.stringify(target)).toBe(before);
  });

  it("rejects packages with oversized strings and arrays", () => {
    expectPackageError(
      () => parseClassBehaviorPackage(createPackage({
        ...createReusableDoorType(),
        name: "A".repeat(MAX_CLASS_BEHAVIOR_STRING_LENGTH + 1),
      })),
      "class-behavior-package-too-large",
    );

    expectPackageError(
      () => parseClassBehaviorPackage(createPackage({
        ...createReusableDoorType(),
        fields: Array.from({ length: MAX_CLASS_BEHAVIOR_ARRAY_ITEMS + 1 }, (_, index) => ({
          name: `field${index}`,
          typeName: "Number",
        })),
      })),
      "class-behavior-package-too-large",
    );
  });

  it("rejects dangerous keys anywhere in untrusted JSON", () => {
    const dangerousJson = JSON.stringify(createPackage()).replace(
      '"fields":[',
      '"__proto__":{"polluted":true},"fields":[',
    );

    expectPackageError(
      () => parseClassBehaviorPackage(dangerousJson),
      "dangerous-class-behavior-key",
    );
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("accepts the full Alice statement shape used by class behavior methods", () => {
    const packageData = createPackage({
      ...createReusableDoorType(),
      methods: [
        {
          name: "exerciseStatementShape",
          isFunction: false,
          returnType: "void",
          parameters: [{ name: "amount", type: "Number" }],
          statements: [
            {
              kind: "complex",
              object: "this",
              method: "turn",
              itemType: "Number",
              itemName: "amount",
              collection: "doors",
              condition: "amount > 0",
              event: "sceneStart",
              expression: "amount",
              name: "localAmount",
              varType: "Number",
              value: "1",
              count: 1,
              countExpression: "amount",
              arguments: ["LEFT", "amount"],
              body: [{ kind: "comment", expression: "body" }],
              ifBody: [{ kind: "comment", expression: "if" }],
              elseBody: [{ kind: "comment", expression: "else" }],
              tryBody: [{ kind: "comment", expression: "try" }],
              catchBody: [{ kind: "comment", expression: "catch" }],
              catchType: "Exception",
              catchVariable: "error",
              cases: [{ value: "1", body: [{ kind: "comment", expression: "case" }] }],
              defaultCase: [{ kind: "comment", expression: "default" }],
            },
          ],
        },
      ],
    });

    expect(parseClassBehaviorPackage(packageData)).toEqual(packageData);
  });

  it("rejects malformed class behavior package JSON and value shapes", () => {
    const base = createPackage();
    const oversizedPackageJson = JSON.stringify(createPackage({
      ...createReusableDoorType(),
      name: "A".repeat(MAX_CLASS_BEHAVIOR_JSON_BYTES),
    }));
    const tooDeepPackage = createPackage();
    let nested: Record<string, unknown> = tooDeepPackage as unknown as Record<string, unknown>;
    for (let index = 0; index < 34; index += 1) {
      nested.next = {};
      nested = nested.next as Record<string, unknown>;
    }
    const invalidInputs: Array<[unknown, string]> = [
      ["{", "invalid-class-behavior-package"],
      [oversizedPackageJson, "class-behavior-package-too-large"],
      [undefined, "invalid-class-behavior-package"],
      [null, "invalid-class-behavior-package"],
      [Number.POSITIVE_INFINITY, "invalid-class-behavior-package"],
      [new Date(), "invalid-class-behavior-package"],
      [JSON.parse('{"kind":"alice-web.reusable-class-behavior","version":1,"exportedBy":"alice-web","type":{"name":"ReusableDoor"},"__proto__":{"polluted":true}}'), "dangerous-class-behavior-key"],
      [tooDeepPackage, "class-behavior-package-too-large"],
      [{ ...base, type: "ReusableDoor" }, "invalid-class-behavior-package"],
      [createPackage({ ...createReusableDoorType(), superTypeName: 1 as unknown as string }), "invalid-class-behavior-package"],
      [createPackage({ ...createReusableDoorType(), fields: "bad" as unknown as AliceTypeDefinition["fields"] }), "invalid-class-behavior-package"],
      [createPackage({ ...createReusableDoorType(), fields: ["bad" as unknown as NonNullable<AliceTypeDefinition["fields"]>[number]] }), "invalid-class-behavior-package"],
      [createPackage({
        ...createReusableDoorType(),
        fields: [{ name: "badField", typeName: 1 as unknown as string }],
      }), "invalid-class-behavior-package"],
      [createPackage({ ...createReusableDoorType(), methods: "bad" as unknown as AliceTypeDefinition["methods"] }), "invalid-class-behavior-package"],
      [createPackage({ ...createReusableDoorType(), methods: ["bad" as unknown as NonNullable<AliceTypeDefinition["methods"]>[number]] }), "invalid-class-behavior-package"],
      [createPackage({
        ...createReusableDoorType(),
        methods: [{ ...createReusableDoorType().methods![0], isFunction: "false" as unknown as boolean }],
      }), "invalid-class-behavior-package"],
      [createPackage({
        ...createReusableDoorType(),
        methods: [{ ...createReusableDoorType().methods![0], returnType: "" }],
      }), "invalid-class-behavior-package"],
      [createPackage({
        ...createReusableDoorType(),
        methods: [{ ...createReusableDoorType().methods![0], parameters: "bad" as unknown as AliceMethod["parameters"] }],
      }), "invalid-class-behavior-package"],
      [createPackage({
        ...createReusableDoorType(),
        methods: [{
          ...createReusableDoorType().methods![0],
          parameters: ["bad" as unknown as AliceMethod["parameters"][number]],
        }],
      }), "invalid-class-behavior-package"],
      [createPackage({
        ...createReusableDoorType(),
        methods: [{ ...createReusableDoorType().methods![0], statements: "bad" as unknown as AliceMethod["statements"] }],
      }), "invalid-class-behavior-package"],
      [createPackage({
        ...createReusableDoorType(),
        methods: [{ ...createReusableDoorType().methods![0], statements: ["bad" as unknown as AliceStatement] }],
      }), "invalid-class-behavior-package"],
      [createPackage({
        ...createReusableDoorType(),
        methods: [{ ...createReusableDoorType().methods![0], statements: [{ kind: "loop", count: -1 }] }],
      }), "invalid-class-behavior-package"],
      [createPackage({
        ...createReusableDoorType(),
        methods: [{ ...createReusableDoorType().methods![0], statements: [{ kind: "call", arguments: "bad" as unknown as string[] }] }],
      }), "invalid-class-behavior-package"],
      [createPackage({
        ...createReusableDoorType(),
        methods: [{ ...createReusableDoorType().methods![0], statements: [{ kind: "switch", cases: "bad" as unknown as AliceStatement["cases"] }] }],
      }), "invalid-class-behavior-package"],
      [createPackage({
        ...createReusableDoorType(),
        methods: [{ ...createReusableDoorType().methods![0], statements: [{ kind: "switch", cases: ["bad" as unknown as NonNullable<AliceStatement["cases"]>[number]] }] }],
      }), "invalid-class-behavior-package"],
      [createPackage({
        ...createReusableDoorType(),
        methods: [{
          ...createReusableDoorType().methods![0],
          statements: [{
            kind: "switch",
            cases: [{ value: "1" } as unknown as NonNullable<AliceStatement["cases"]>[number]],
          }],
        }],
      }), "invalid-class-behavior-package"],
      [createPackage({
        ...createReusableDoorType(),
        methods: [{ ...createReusableDoorType().methods![0], statements: [{ kind: "switch", defaultCase: "bad" as unknown as AliceStatement[] }] }],
      }), "invalid-class-behavior-package"],
    ];

    for (const [input, code] of invalidInputs) {
      expectPackageError(() => parseClassBehaviorPackage(input), code);
    }
  });

  it("rejects unsupported import conflict strategies before changing the target project", () => {
    const target = createProject([]);

    expectPackageError(
      () => importClassBehaviorPackage(target, createPackage(), {
        conflictStrategy: "copy" as unknown as ClassBehaviorConflictStrategy,
      }),
      "invalid-class-behavior-package",
    );
    expect(target.types).toEqual([]);
  });

  it("imports a non-conflicting class behavior into the target Alice project", () => {
    const target = createProject([]);

    const result = importClassBehaviorPackage(target, createPackage());

    expect(result).toEqual({
      schema_version: "alice-web.class-behavior-import-result/v1",
      status: "imported",
      evidence: [
        "class-behavior-package-validated",
        "class-behavior-type-imported",
        "class-behavior-name-preserved",
      ],
      originalName: "ReusableDoor",
      importedName: "ReusableDoor",
      conflictStrategy: "rename",
      renamed: false,
      replaced: false,
      merged: false,
    });
    expect(target.types).toEqual([createReusableDoorType()]);
  });

  it("renames same-name imports by default and updates self type references", () => {
    const target = createProject([createReusableDoorType()]);
    const packageData = createPackage({
      ...createReusableDoorType(),
      fields: [
        { name: "sibling", typeName: "ReusableDoor" },
      ],
      methods: [
        {
          name: "describeSelf",
          isFunction: true,
          returnType: "ReusableDoor",
          parameters: [{ name: "other", type: "ReusableDoor" }],
          statements: [{ kind: "return", expression: '"ReusableDoor"' }],
        },
      ],
    });

    const result = importClassBehaviorPackage(target, packageData);

    expect(result).toMatchObject({
      originalName: "ReusableDoor",
      importedName: "ReusableDoor2",
      conflictStrategy: "rename",
      renamed: true,
      replaced: false,
      merged: false,
    });
    expect(target.types?.map((type) => type.name)).toEqual(["ReusableDoor", "ReusableDoor2"]);
    const renamed = target.types?.find((type) => type.name === "ReusableDoor2");
    expect(renamed?.constructors?.[0]).toMatchObject({
      name: "ReusableDoor2",
      returnType: "ReusableDoor2",
    });
    expect(renamed?.fields?.[0]).toMatchObject({ typeName: "ReusableDoor2" });
    expect(renamed?.methods?.[0]).toMatchObject({
      returnType: "ReusableDoor2",
      parameters: [{ name: "other", type: "ReusableDoor2" }],
    });
    expect(renamed?.methods?.[0]?.statements).toEqual([{ kind: "return", expression: '"ReusableDoor"' }]);
  });

  it("skips existing numeric rename suffixes when importing a duplicate behavior", () => {
    const target = createProject([
      createReusableDoorType(),
      createReusableDoorType("ReusableDoor2"),
    ]);

    const result = importClassBehaviorPackage(target, createPackage());

    expect(result).toMatchObject({
      originalName: "ReusableDoor",
      importedName: "ReusableDoor3",
      renamed: true,
    });
    expect(target.types?.map((type) => type.name)).toEqual([
      "ReusableDoor",
      "ReusableDoor2",
      "ReusableDoor3",
    ]);
  });

  it("supports explicit replace, merge, and reject conflict strategies", () => {
    const existing = createReusableDoorType();
    const incoming = createReusableDoorType();
    incoming.fields = [
      { name: "openCount", typeName: "Number", initializer: "99" },
      { name: "doorColor", typeName: "java.lang.String", initializer: "red" },
    ];
    incoming.methods = [
      {
        name: "openDoor",
        isFunction: false,
        returnType: "void",
        parameters: [{ name: "degrees", type: "Number" }],
        statements: [{ kind: "call", object: "this", method: "swingOpen", arguments: ["degrees"] }],
      },
      {
        name: "closeDoor",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [{ kind: "call", object: "this", method: "turn", arguments: ["RIGHT", "90"] }],
      },
    ];
    incoming.constructors = [
      {
        name: "ReusableDoor",
        isFunction: false,
        returnType: "ReusableDoor",
        parameters: [{ name: "ownerName", type: "java.lang.String" }],
        statements: [{ kind: "expression", expression: "this.ownerName = ownerName.trim()" }],
      },
      {
        name: "ReusableDoor",
        isFunction: false,
        returnType: "ReusableDoor",
        parameters: [],
        statements: [{ kind: "call", object: "this", method: "resetDoor", arguments: [] }],
      },
    ];

    const replacedTarget = createProject([existing]);
    expect(importClassBehaviorPackage(replacedTarget, createPackage(incoming), { conflictStrategy: "replace" }))
      .toMatchObject({ importedName: "ReusableDoor", replaced: true, merged: false, renamed: false });
    expect(replacedTarget.types).toEqual([incoming]);

    const mergedTarget = createProject([existing]);
    expect(importClassBehaviorPackage(mergedTarget, createPackage(incoming), { conflictStrategy: "merge" }))
      .toMatchObject({ importedName: "ReusableDoor", replaced: false, merged: true, renamed: false });
    const merged = mergedTarget.types?.[0];
    expect(merged?.fields).toEqual([
      { name: "openCount", typeName: "Number", initializer: "99" },
      { name: "ownerName", typeName: "java.lang.String", initializer: "Alice" },
      { name: "doorColor", typeName: "java.lang.String", initializer: "red" },
    ]);
    expect(merged?.methods?.map((method) => [method.name, method.statements])).toEqual([
      ["openDoor", [{ kind: "call", object: "this", method: "swingOpen", arguments: ["degrees"] }]],
      ["isOpen", [{ kind: "return", expression: "this.openCount > 0" }]],
      ["closeDoor", [{ kind: "call", object: "this", method: "turn", arguments: ["RIGHT", "90"] }]],
    ]);
    expect(merged?.constructors?.map((constructorMethod) => constructorMethod.statements)).toEqual([
      [{ kind: "expression", expression: "this.ownerName = ownerName.trim()" }],
      [{ kind: "call", object: "this", method: "resetDoor", arguments: [] }],
    ]);

    const rejectedTarget = createProject([existing]);
    const beforeReject = JSON.stringify(rejectedTarget);
    expectPackageError(
      () => importClassBehaviorPackage(rejectedTarget, createPackage(incoming), { conflictStrategy: "reject" }),
      "class-behavior-conflict",
    );
    expect(JSON.stringify(rejectedTarget)).toBe(beforeReject);
  });
});
