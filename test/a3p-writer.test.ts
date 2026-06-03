import { beforeAll, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import * as a3pParserModule from "../src/a3p-parser";
import * as a3pWriterModule from "../src/a3p-writer";
import { parseA3P, type AliceMethod, type AliceProject, type AliceStatement } from "../src/a3p-parser";
import { writeA3P } from "../src/a3p-writer";

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
  "EachInArrayTogether",
] as const;

const WRITER_ONLY_A3P_STATEMENT_KINDS = [
  "VariableAssignment",
  "EventListener",
  "ForEach",
] as const;

const EXPECTED_SUPPORTED_A3P_STATEMENT_KINDS = [
  ...EXPECTED_PARSED_A3P_STATEMENT_KINDS,
  ...WRITER_ONLY_A3P_STATEMENT_KINDS,
] as const;

type A3PParserCoverageModule = typeof a3pParserModule & {
  PARSED_A3P_STATEMENT_KINDS?: readonly string[];
};

type A3PWriterCoverageModule = typeof a3pWriterModule & {
  SUPPORTED_A3P_STATEMENT_KINDS?: readonly string[];
};

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
    expected: { kind: "CountLoop", count: 3, body: [NESTED_COMMENT] },
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
      condition: "this.bunny.isShowing",
      ifBody: [{ kind: "Comment", expression: "if branch" }],
      elseBody: [{ kind: "Comment", expression: "else branch" }],
    },
  },
  {
    kind: "ReturnStatement",
    statement: { kind: "ReturnStatement", expression: "this.score" },
    expected: { kind: "ReturnStatement", expression: "this.score" },
  },
  {
    kind: "VariableDeclaration",
    statement: { kind: "VariableDeclaration", name: "score", varType: "java.lang.Integer", value: "1" },
    expected: { kind: "VariableDeclaration", name: "score", varType: "java.lang.Integer", value: "1" },
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
    expected: { kind: "WhileLoop", condition: "this.bunny.isShowing", body: [NESTED_COMMENT] },
  },
  {
    kind: "ForEachInArrayLoop",
    statement: {
      kind: "ForEachInArrayLoop",
      itemType: "org.lgna.story.SThing",
      itemName: "item",
      collection: "this.animals",
      body: [NESTED_COMMENT],
    },
    expected: {
      kind: "ForEachInArrayLoop",
      itemType: "org.lgna.story.SThing",
      itemName: "item",
      collection: "this.animals",
      body: [NESTED_COMMENT],
    },
  },
  {
    kind: "EachInArrayTogether",
    statement: {
      kind: "EachInArrayTogether",
      itemType: "org.lgna.story.SThing",
      itemName: "item",
      collection: "this.animals",
      body: [NESTED_COMMENT],
    },
    expected: {
      kind: "EachInArrayTogether",
      itemType: "org.lgna.story.SThing",
      itemName: "item",
      collection: "this.animals",
      body: [NESTED_COMMENT],
    },
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
  it("keeps parser round-trip cases in exact parity with PARSED_A3P_STATEMENT_KINDS", () => {
    expectExactStatementKindSet(
      PARSER_ROUND_TRIP_STATEMENT_CASES.map((testCase) => testCase.kind),
      EXPECTED_PARSED_A3P_STATEMENT_KINDS,
    );
    expectExactStatementKindSet(
      (a3pParserModule as A3PParserCoverageModule).PARSED_A3P_STATEMENT_KINDS,
      EXPECTED_PARSED_A3P_STATEMENT_KINDS,
    );
  });

  it("keeps writer coverage cases in exact parity with SUPPORTED_A3P_STATEMENT_KINDS", () => {
    expectExactStatementKindSet(
      [
        ...PARSER_ROUND_TRIP_STATEMENT_CASES.map((testCase) => testCase.kind),
        ...WRITER_ONLY_A3P_STATEMENT_KINDS,
      ],
      EXPECTED_SUPPORTED_A3P_STATEMENT_KINDS,
    );
    expectExactStatementKindSet(
      (a3pWriterModule as A3PWriterCoverageModule).SUPPORTED_A3P_STATEMENT_KINDS,
      EXPECTED_SUPPORTED_A3P_STATEMENT_KINDS,
    );
  });

  it.each(PARSER_ROUND_TRIP_STATEMENT_CASES)(
    "round-trips parser-recognized $kind statements through writeA3P/parseA3P",
    async ({ statement, expected }) => {
      await expect(writeAndParseStatement(statement)).resolves.toEqual(expected);
    },
  );

  it("lowers VariableAssignment statements to Alice assignment expression XML", async () => {
    const xml = await writeProgramXmlForStatement({
      kind: "VariableAssignment",
      name: "this.score",
      value: "this.score + 1",
    });

    expect(xml).toContain('type="org.lgna.project.ast.ExpressionStatement"');
    expect(xml).toContain('type="org.lgna.project.ast.AssignmentExpression"');
    expect(xml).toContain('name="leftHandSide"');
    expect(xml).toContain('name="rightHandSide"');
    expect(xml).toContain("this.score");
    expect(xml).toContain("this.score + 1");
  });

  it("lowers EventListener statements to listener method invocations with callback bodies", async () => {
    const xml = await writeProgramXmlForStatement({
      kind: "EventListener",
      object: "this",
      event: "addSceneActivationListener",
      body: [{ kind: "MethodCall", object: "this.bunny", method: "say", arguments: ["hello"] }],
    });

    expect(xml).toContain('type="org.lgna.project.ast.ExpressionStatement"');
    expect(xml).toContain('type="org.lgna.project.ast.MethodInvocation"');
    expect(xml).toContain("addSceneActivationListener");
    expect(xml).toContain('type="org.lgna.project.ast.LambdaExpression"');
    expect(xml).toContain('name="body"');
    expect(xml).toContain("say");
    expect(xml).toContain("hello");
  });

  it("lowers runtime ForEach statements to Alice ForEachInArrayLoop XML", async () => {
    const xml = await writeProgramXmlForStatement({
      kind: "ForEach",
      itemType: "org.lgna.story.SThing",
      itemName: "item",
      collection: "this.animals",
      body: [{ kind: "MethodCall", object: "item", method: "say", arguments: ["hello"] }],
    });

    expect(xml).toContain('type="org.lgna.project.ast.ForEachInArrayLoop"');
    expect(xml).toContain('name="itemType"');
    expect(xml).toContain("org.lgna.story.SThing");
    expect(xml).toContain('name="itemName"');
    expect(xml).toContain("item");
    expect(xml).toContain('name="array"');
    expect(xml).toContain("this.animals");
    expect(xml).toContain("say");
    expect(xml).toContain("hello");
  });

  it("throws instead of dropping unsupported statement kinds", async () => {
    await expect(
      writeA3P(createStatementCoverageProject({ kind: "TryCatch", tryBody: [], catchBody: [] })),
    ).rejects.toThrow(/Unsupported A3P statement kind: TryCatch/);
  });
});
