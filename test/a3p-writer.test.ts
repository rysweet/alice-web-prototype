import { beforeAll, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { parseA3P, type AliceMethod, type AliceProject } from "../src/a3p-parser";
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

describe("a3p faithful round-trip", () => {
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
    }, 15000);
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
