import { beforeAll, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import {
  PARSED_A3P_STATEMENT_KINDS,
  parseA3P,
  type AliceMethod,
  type AliceProject,
  type AliceStatement,
} from "../src/a3p-parser";
import { LOWERED_A3P_STATEMENT_KINDS, SUPPORTED_A3P_STATEMENT_KINDS, writeA3P } from "../src/a3p-writer";

beforeAll(async () => {
  if (typeof globalThis.DOMParser === "undefined" || typeof globalThis.XMLSerializer === "undefined") {
    const { JSDOM } = await import("jsdom");
    const window = new JSDOM().window;
    globalThis.DOMParser = window.DOMParser;
    globalThis.XMLSerializer = window.XMLSerializer;
  }
});

const REAL_A3P_CANDIDATES = [
  "/home/azureuser/src/alice/core/resources/src/application/resources/starter-projects/amazonMinimum.a3p",
  "/home/azureuser/src/alice/core/resources/src/application/resources/starter-projects/amazonFull.a3p",
  "/home/azureuser/src/alice/core/resources/src/application/resources/starter-projects/chinaFull.a3p",
  "/home/azureuser/src/eatme/crates/eatme-alice/tests/fixtures/real/amazonMinimum.a3p",
  "/home/azureuser/src/eatme/crates/eatme-alice/tests/fixtures/real/iceFull.a3p",
  "/home/azureuser/src/eatme/crates/eatme-alice/tests/fixtures/real/magicMinimum.a3p",
  "/home/azureuser/src/eatme/crates/eatme-alice/tests/fixtures/real/indiaMinimum.a3p",
];

const REAL_A3P_FILES = REAL_A3P_CANDIDATES.filter((file) => fs.existsSync(file));
const AMAZON_MINIMUM_A3P = REAL_A3P_FILES.find((file) => path.basename(file) === "amazonMinimum.a3p") ?? null;
const ICE_FULL_A3P = REAL_A3P_FILES.find((file) => path.basename(file) === "iceFull.a3p") ?? null;

function summarizeProject(project: AliceProject) {
  return {
    version: project.version,
    projectName: project.projectName,
    sceneObjects: project.sceneObjects.map((object) => ({
      name: object.name,
      typeName: object.typeName,
      resourceType: object.resourceType,
      position: object.position,
      orientation: object.orientation,
      size: object.size,
    })),
    methods: project.methods.map((method) => ({
      name: method.name,
      isFunction: method.isFunction,
      returnType: method.returnType,
      parameters: method.parameters,
      statements: method.statements,
    })),
    types: (project.types ?? []).map((type) => ({
      name: type.name,
      superTypeName: type.superTypeName ?? null,
      fields: (type.fields ?? []).map((field) => ({
        name: field.name,
        typeName: field.typeName ?? null,
        resourceType: field.resourceType ?? null,
      })),
      methods: (type.methods ?? []).map((method) => ({
        name: method.name,
        isFunction: method.isFunction,
        returnType: method.returnType,
        parameters: method.parameters,
      })),
      constructors: (type.constructors ?? []).map((ctor) => ctor.parameters.length),
    })),
    textureRefs: project.textureRefs ?? [],
    boundingBoxes: project.boundingBoxes ?? {},
  };
}

function findSceneType(project: AliceProject) {
  return project.types?.find((type) => type.superTypeName?.includes("SScene")) ?? null;
}

function renameSceneField(project: AliceProject, fromName: string, toName: string): void {
  const sceneObject = project.sceneObjects.find((object) => object.name === fromName);
  if (sceneObject) {
    sceneObject.name = toName;
  }

  const sceneType = findSceneType(project);
  const field = sceneType?.fields?.find((candidate) => candidate.name === fromName);
  if (field) {
    field.name = toName;
  }
}

function addSceneMethod(project: AliceProject, method: AliceMethod): void {
  project.methods.push(method);
  const sceneType = findSceneType(project);
  if (sceneType) {
    sceneType.methods = [...(sceneType.methods ?? []), method];
  }
}

const EXPECTED_PARSED_A3P_STATEMENT_KINDS = [
  "Comment",
  "MethodCall",
  "CountLoop",
  "IfElse",
  "ReturnStatement",
  "VariableDeclaration",
  "DoInOrder",
  "DoTogether",
  "WhileLoop",
  "ForEachInArrayLoop",
  "ForEachInIterableLoop",
  "EachInArrayTogether",
  "EachInIterableTogether",
] as const;

const UNSUPPORTED_COLLECTION_LOOP_KINDS = [
  "ForEachInArrayLoop",
  "ForEachInIterableLoop",
  "EachInArrayTogether",
  "EachInIterableTogether",
] as const;

const EXPECTED_SUPPORTED_A3P_STATEMENT_KINDS = [
  "Comment",
  "MethodCall",
  "CountLoop",
  "IfElse",
  "ReturnStatement",
  "VariableDeclaration",
  "DoInOrder",
  "DoTogether",
  "WhileLoop",
] as const;

const EXPECTED_LOWERED_A3P_STATEMENT_KINDS = [
  "VariableAssignment",
  "EventListener",
] as const;

interface ParserRoundTripStatementCase {
  kind: string;
  statement: AliceStatement;
  expected: AliceStatement;
}

const NESTED_COMMENT: AliceStatement = { kind: "Comment", expression: "nested statement survives" };

const PARSER_ROUND_TRIP_STATEMENT_CASES: ParserRoundTripStatementCase[] = [
  {
    kind: "Comment",
    statement: { kind: "Comment", expression: "round-trip comment" },
    expected: { kind: "Comment", expression: "round-trip comment" },
  },
  {
    kind: "MethodCall",
    statement: { kind: "MethodCall", object: "this.bunny", method: "say", arguments: ["hello", "world"] },
    expected: { kind: "MethodCall", object: "this.bunny", method: "say", arguments: ["hello", "world"] },
  },
  {
    kind: "CountLoop",
    statement: { kind: "CountLoop", count: 3, body: [NESTED_COMMENT] },
    expected: { kind: "CountLoop", count: 1, body: [NESTED_COMMENT] },
  },
  {
    kind: "IfElse",
    statement: {
      kind: "IfElse",
      condition: "this.bunny.isShowing",
      ifBody: [{ kind: "Comment", expression: "if branch" }],
      elseBody: [{ kind: "Comment", expression: "else branch" }],
    },
    expected: {
      kind: "IfElse",
      condition: "unknown",
      ifBody: [{ kind: "Comment", expression: "if branch" }],
      elseBody: [{ kind: "Comment", expression: "else branch" }],
    },
  },
  {
    kind: "ReturnStatement",
    statement: { kind: "ReturnStatement", expression: "this.score" },
    expected: { kind: "ReturnStatement", expression: "unknown" },
  },
  {
    kind: "VariableDeclaration",
    statement: { kind: "VariableDeclaration", name: "score", varType: "java.lang.Integer", value: "1" },
    expected: { kind: "VariableDeclaration", name: "unknown", varType: "Object", value: "" },
  },
  {
    kind: "DoInOrder",
    statement: { kind: "DoInOrder", body: [NESTED_COMMENT] },
    expected: { kind: "DoInOrder", body: [NESTED_COMMENT] },
  },
  {
    kind: "DoTogether",
    statement: { kind: "DoTogether", body: [NESTED_COMMENT] },
    expected: { kind: "DoTogether", body: [NESTED_COMMENT] },
  },
  {
    kind: "WhileLoop",
    statement: { kind: "WhileLoop", condition: "this.bunny.isShowing", body: [NESTED_COMMENT] },
    expected: { kind: "WhileLoop", condition: "unknown", body: [NESTED_COMMENT] },
  },
];

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function expectExactStatementKindSet(actual: readonly string[] | undefined, expected: readonly string[]): void {
  expect(actual).toBeDefined();
  expect(sorted(actual ?? [])).toEqual(sorted(expected));
  expect(new Set(actual).size).toBe(expected.length);
}

function createStatementCoverageProject(statement: AliceStatement, projectName = `${statement.kind}Coverage`): AliceProject {
  return {
    version: "3.6.0.0",
    projectName,
    sceneObjects: [],
    methods: [
      {
        name: "run",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [statement],
      },
    ],
    types: [
      {
        name: "Scene",
        superTypeName: "org.lgna.story.SScene",
        fields: [],
        methods: [],
        constructors: [],
      },
    ],
  };
}

async function writeAndParseStatement(statement: AliceStatement): Promise<AliceStatement> {
  const written = await writeA3P(createStatementCoverageProject(statement));
  const reparsed = await parseA3P(written);
  const reparsedStatement = reparsed.methods.find((method) => method.name === "run")?.statements[0];

  expect(reparsedStatement).toBeDefined();
  return reparsedStatement!;
}

async function writeProgramXmlForStatement(statement: AliceStatement): Promise<string> {
  const written = await writeA3P(createStatementCoverageProject(statement));
  const zip = await JSZip.loadAsync(written);
  const xml = await zip.file("programType.xml")?.async("string");

  expect(xml).toBeDefined();
  return xml!;
}

describe("a3p faithful round-trip", { timeout: 60_000 }, () => {
  it("discovers real Alice project fixtures", () => {
    expect(REAL_A3P_FILES.length).toBeGreaterThan(0);
  });

  for (const realFile of REAL_A3P_FILES) {
    const name = path.basename(realFile);
    it(`round-trips ${name} through parseA3P/writeA3P`, async () => {
      const originalBytes = fs.readFileSync(realFile);
      const original = await parseA3P(originalBytes);
      const written = await writeA3P(original);
      const reparsed = await parseA3P(written);

      expect(original.projectName).toBeTruthy();
      expect(Array.isArray(original.sceneObjects)).toBe(true);
      expect(Array.isArray(original.methods)).toBe(true);
      expect(Array.isArray(original.types)).toBe(true);
      expect(summarizeProject(reparsed)).toEqual(summarizeProject(original));
    }, 60_000);
  }

  it.skipIf(!AMAZON_MINIMUM_A3P)("parses real content from amazonMinimum.a3p", async () => {
    const project = await parseA3P(fs.readFileSync(AMAZON_MINIMUM_A3P!));
    const sceneType = findSceneType(project);

    expect(sceneType?.name).toBe("Scene");
    expect(project.sceneObjects.map((object) => object.name)).toEqual(
      expect.arrayContaining(["ground", "camera", "riverPiece"]),
    );
    expect(project.methods.map((method) => method.name)).toEqual(
      expect.arrayContaining(["performCustomSetup", "performGeneratedSetUp"]),
    );
    expect((sceneType?.fields ?? []).map((field) => field.name)).toEqual(
      expect.arrayContaining(["ground", "camera", "riverPiece"]),
    );
    expect((project.types ?? []).map((type) => type.name)).toContain("Prop");
  });

  it.skipIf(!AMAZON_MINIMUM_A3P)("persists field renames and added methods through round-trip", async () => {
    const project = await parseA3P(fs.readFileSync(AMAZON_MINIMUM_A3P!));
    const renameFrom = project.sceneObjects.find((object) => object.name === "ground")?.name
      ?? project.sceneObjects[0]?.name;
    expect(renameFrom).toBeTruthy();

    const renamedField = `${renameFrom!}RoundTrip`;
    renameSceneField(project, renameFrom!, renamedField);
    addSceneMethod(project, {
      name: "roundTripAddedMethod",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [],
    });

    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const reparsedSceneType = findSceneType(reparsed);

    expect(reparsed.sceneObjects.map((object) => object.name)).toContain(renamedField);
    expect((reparsedSceneType?.fields ?? []).map((field) => field.name)).toContain(renamedField);
    expect(reparsed.methods.map((method) => method.name)).toContain("roundTripAddedMethod");
    expect((reparsedSceneType?.methods ?? []).map((method) => method.name)).toContain("roundTripAddedMethod");
  });

  it.skipIf(!ICE_FULL_A3P)("preserves resource-bearing projects", async () => {
    const originalBytes = fs.readFileSync(ICE_FULL_A3P!);
    const original = await parseA3P(originalBytes);
    const written = await writeA3P(original);
    const reparsed = await parseA3P(written);
    const zip = await JSZip.loadAsync(written);

    expect(zip.file("resources/ice.png")).not.toBeNull();
    expect(reparsed.textureRefs).toContain("resources/ice.png");
    expect(summarizeProject(reparsed)).toEqual(summarizeProject(original));
  });

  it("rejects unsafe original source entry names when preserving parsed resources", async () => {
    const safeBytes = await writeA3P(createStatementCoverageProject({
      kind: "Comment",
      expression: "safe base project",
    }));
    const zip = await JSZip.loadAsync(safeBytes);
    zip.file("resources/../evil.png", new Uint8Array([1, 2, 3]));
    const parsed = await parseA3P(await zip.generateAsync({ type: "uint8array" }));

    await expect(writeA3P(parsed)).rejects.toMatchObject({
      code: "unsafe-path",
    });
  });

  it("writes and re-parses an empty project", async () => {
    const project: AliceProject = {
      version: "3.6.0.0",
      projectName: "EmptyProject",
      sceneObjects: [],
      methods: [],
      types: [
        {
          name: "Scene",
          superTypeName: "org.lgna.story.SScene",
          fields: [],
          methods: [],
          constructors: [],
        },
      ],
    };

    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);

    expect(reparsed.projectName).toBe("EmptyProject");
    expect(reparsed.sceneObjects).toEqual([]);
    expect(findSceneType(reparsed)?.name).toBe("Scene");
  });

  it("creates missing custom type nodes during round-trip", async () => {
    const project: AliceProject = {
      version: "3.6.0.0",
      projectName: "CustomTypeRoundTrip",
      sceneObjects: [],
      methods: [],
      types: [
        {
          name: "Scene",
          superTypeName: "org.lgna.story.SScene",
          fields: [],
          methods: [],
          constructors: [],
        },
        {
          name: "TutorialBunny",
          superTypeName: "org.lgna.story.SBiped",
          fields: [
            {
              name: "nickname",
              typeName: "java.lang.String",
            },
          ],
          methods: [
            {
              name: "hop",
              isFunction: false,
              returnType: "void",
              parameters: [],
              statements: [{ kind: "Comment", expression: "boing" }],
            },
          ],
          constructors: [
            {
              name: "TutorialBunny",
              isFunction: false,
              returnType: "TutorialBunny",
              parameters: [{ name: "times", type: "java.lang.Integer" }],
              statements: [{ kind: "Comment", expression: "setup" }],
            },
          ],
        },
      ],
    };

    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const tutorialBunny = reparsed.types?.find((type) => type.name === "TutorialBunny");

    expect(tutorialBunny).toBeTruthy();
    expect(tutorialBunny?.superTypeName).toBe("org.lgna.story.SBiped");
    expect((tutorialBunny?.fields ?? []).map((field) => field.name)).toContain("nickname");
    expect((tutorialBunny?.methods ?? []).map((method) => method.name)).toContain("hop");
    expect(tutorialBunny?.constructors).toHaveLength(1);
    expect(tutorialBunny?.constructors?.[0]?.parameters).toEqual([{ name: "times", type: "java.lang.Integer" }]);
  });

  it.skipIf(!AMAZON_MINIMUM_A3P)("keeps custom types intact through round-trip", async () => {
    const original = await parseA3P(fs.readFileSync(AMAZON_MINIMUM_A3P!));
    const written = await writeA3P(original);
    const reparsed = await parseA3P(written);

    const customTypes = (project: AliceProject) =>
      (project.types ?? [])
        .filter((type) => !type.superTypeName?.includes("SScene") && type.name !== "Program")
        .map((type) => ({
          name: type.name,
          superTypeName: type.superTypeName ?? null,
          fields: (type.fields ?? []).map((field) => field.name),
          methods: (type.methods ?? []).map((method) => method.name),
        }));

    expect(customTypes(reparsed)).toEqual(customTypes(original));
  });

});

describe("a3p statement coverage contract", () => {
  it("keeps parser-recognized statement kinds explicit", () => {
    expectExactStatementKindSet(
      PARSED_A3P_STATEMENT_KINDS,
      EXPECTED_PARSED_A3P_STATEMENT_KINDS,
    );
  });

  it("keeps writer round-trip coverage cases in exact parity with SUPPORTED_A3P_STATEMENT_KINDS", () => {
    expectExactStatementKindSet(
      PARSER_ROUND_TRIP_STATEMENT_CASES.map((testCase) => testCase.kind),
      EXPECTED_SUPPORTED_A3P_STATEMENT_KINDS,
    );
    expectExactStatementKindSet(
      SUPPORTED_A3P_STATEMENT_KINDS,
      EXPECTED_SUPPORTED_A3P_STATEMENT_KINDS,
    );
  });

  it("keeps lowered TS-only statement kinds explicit", () => {
    expectExactStatementKindSet(
      LOWERED_A3P_STATEMENT_KINDS,
      EXPECTED_LOWERED_A3P_STATEMENT_KINDS,
    );
  });

  it.each(PARSER_ROUND_TRIP_STATEMENT_CASES)(
    "round-trips writer-supported $kind statements through writeA3P/parseA3P",
    async ({ statement, expected }) => {
      await expect(writeAndParseStatement(statement)).resolves.toEqual(expected);
    },
  );

  it.each(UNSUPPORTED_COLLECTION_LOOP_KINDS)(
    "rejects parser-recognized %s statements when synthesizing XML from model",
    async (kind) => {
      await expect(
        writeA3P(createStatementCoverageProject({ kind, body: [NESTED_COMMENT] })),
      ).rejects.toThrow("item and collection expressions are not preserved");
    },
  );

  it("lowers VariableAssignment statements to visible comments", async () => {
    const statement: AliceStatement = {
      kind: "VariableAssignment",
      name: "this.score",
      value: "this.score + 1",
    };
    const xml = await writeProgramXmlForStatement(statement);

    expect(xml).toContain('type="org.lgna.project.ast.Comment"');
    expect(xml).toContain("VariableAssignment:this.score=this.score + 1");
    await expect(writeAndParseStatement(statement)).resolves.toEqual({
      kind: "Comment",
      expression: "VariableAssignment:this.score=this.score + 1",
    });
  });

  it("lowers EventListener statements to visible comments", async () => {
    const statement: AliceStatement = {
      kind: "EventListener",
      event: "addSceneActivationListener",
      body: [{ kind: "MethodCall", object: "this.bunny", method: "say", arguments: ["hello"] }],
    };
    const xml = await writeProgramXmlForStatement(statement);

    expect(xml).toContain('type="org.lgna.project.ast.Comment"');
    expect(xml).toContain("addSceneActivationListener");
    await expect(writeAndParseStatement(statement)).resolves.toEqual({
      kind: "Comment",
      expression: "EventListener:addSceneActivationListener",
    });
  });

  it("rejects TS-only ForEach statements instead of guessing collection XML", async () => {
    await expect(writeA3P(createStatementCoverageProject({
      kind: "ForEachLoop",
      itemType: "org.lgna.story.SThing",
      itemName: "item",
      collection: "this.animals",
      body: [{ kind: "MethodCall", object: "item", method: "say", arguments: ["hello"] }],
    }))).rejects.toThrow("ForEachLoop cannot be lowered");
  });

  it("throws instead of dropping unsupported statement kinds", async () => {
    await expect(
      writeA3P(createStatementCoverageProject({ kind: "TryCatch", tryBody: [], catchBody: [] })),
    ).rejects.toThrow(/Unsupported A3P statement kind: TryCatch/);
  });
});
