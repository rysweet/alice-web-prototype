import { createHash } from "node:crypto";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { AliceProject, AliceTypeDefinition } from "../src/a3p-parser";
import { createAliceEvidenceArtifact, parseAliceEvidenceArtifact, serializeAliceEvidenceArtifact } from "../src/alice-evidence-artifact";
import { TypeScriptExporter, exportWebPackage } from "../src/project-export";
import { readProject, writeProject, type AliceProjectArchive } from "../src/project-io";
import {
  exportClassBehaviorPackage,
  importClassBehaviorPackage,
  parseClassBehaviorPackage,
  serializeClassBehaviorPackage,
} from "../src/project-io/class-behavior-package";
import { createMinimalProject } from "./test-utils";

type ProjectSnapshot = {
  projectName: string;
  version: string;
  objects: Array<{
    name: string;
    typeName: string;
    resourceType: string | null;
    position: unknown;
    size: unknown;
  }>;
  methods: Array<{
    name: string;
    isFunction: boolean;
    returnType: string;
    parameters: unknown;
    statements: unknown;
  }>;
  types: Array<{
    name: string;
    superTypeName: string | null | undefined;
    fields: unknown;
    methods: unknown;
    constructors: unknown;
  }>;
};

function createEquivalenceProject(): AliceProject {
  const project = createMinimalProject();
  project.projectName = "Artifact Equivalence Demo";
  project.sceneObjects.push(
    {
      name: "bunny",
      typeName: "org.lgna.story.SBiped",
      resourceType: "BUNNY",
      position: { x: 1, y: 0, z: 2 },
      orientation: null,
      size: { width: 1, height: 2, depth: 1 },
    },
    {
      name: "camera",
      typeName: "org.lgna.story.SCamera",
      resourceType: null,
      position: { x: 0, y: 1.5, z: 6 },
      orientation: null,
      size: null,
    },
  );
  project.methods.push({
    name: "myFirstMethod",
    isFunction: false,
    returnType: "void",
    parameters: [{ name: "height", type: "Number" }],
    statements: [
      { kind: "MethodCall", object: "bunny", method: "move", arguments: ["UP", "height"] },
      { kind: "MethodCall", object: "bunny", method: "turn", arguments: ["LEFT", "0.25"] },
    ],
  });
  project.types ??= [];
  project.types.push(createReusableType());
  return project;
}

function createReusableType(name = "SpinnerBehavior"): AliceTypeDefinition {
  return {
    name,
    superTypeName: "org.lgna.story.SModel",
    fields: [
      { name: "turnSpeed", typeName: "Double", initializer: "0.25" },
      { name: "turnLabel", typeName: "java.lang.String", initializer: "spin" },
    ],
    constructors: [
      {
        name,
        isFunction: false,
        returnType: name,
        parameters: [{ name: "speed", type: "Double" }],
        statements: [{ kind: "expression", expression: "this.turnSpeed = speed" }],
      },
    ],
    methods: [
      {
        name: "spinOnce",
        isFunction: false,
        returnType: "void",
        parameters: [{ name: "amount", type: "Double" }],
        statements: [{ kind: "call", object: "this", method: "turn", arguments: ["LEFT", "amount"] }],
      },
    ],
  };
}

function createArchive(project: AliceProject): AliceProjectArchive {
  return {
    project,
    manifest: null,
    resources: new Map(),
    resourceEntries: [],
    thumbnail: null,
    versionInfo: {
      originalAliceVersion: project.version,
      detectedAliceVersion: project.version,
      manifestVersion: null,
      xmlVersion: null,
      versionSource: "default",
      migrated: false,
      migrationSteps: [],
    },
  };
}

function projectSnapshot(project: AliceProject): ProjectSnapshot {
  return {
    projectName: project.projectName,
    version: project.version,
    objects: [...project.sceneObjects]
      .map((object) => ({
        name: object.name,
        typeName: object.typeName,
        resourceType: object.resourceType ?? null,
        position: object.position ?? null,
        size: object.size ?? null,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    methods: [...project.methods]
      .map((method) => ({
        name: method.name,
        isFunction: method.isFunction,
        returnType: method.returnType,
        parameters: method.parameters,
        statements: method.statements,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    types: [...(project.types ?? [])]
      .map((type) => ({
        name: type.name,
        superTypeName: type.superTypeName,
        fields: type.fields ?? [],
        methods: type.methods ?? [],
        constructors: type.constructors ?? [],
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

async function readZipJson<T>(zip: JSZip, path: string): Promise<T> {
  const file = zip.file(path);
  expect(file, `${path} should exist`).toBeTruthy();
  return JSON.parse(await file!.async("string")) as T;
}

async function readZipText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  expect(file, `${path} should exist`).toBeTruthy();
  return file!.async("string");
}

function readEmbeddedProject(html: string): AliceProject {
  const match = html.match(/<script id="alice-project-data" type="application\/json">([\s\S]*?)<\/script>/);
  expect(match, "index.html should contain alice-project-data JSON").toBeTruthy();
  return JSON.parse(match![1]) as AliceProject;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("artifact equivalence checks", () => {
  it("compares saved A3P project semantics after write/read", async () => {
    const project = createEquivalenceProject();
    const saved = await writeProject(createArchive(project), { generateThumbnailFromScene: false });
    const reopened = await readProject(saved);

    const original = projectSnapshot(project);
    const actual = projectSnapshot(reopened.project);
    expect(actual.projectName).toBe(original.projectName);
    expect(actual.version).toBe(original.version);
    expect(actual.objects).toEqual(original.objects);
    expect(actual.methods).toEqual(expect.arrayContaining(original.methods));
    expect(actual.types).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "SpinnerBehavior",
        superTypeName: "org.lgna.story.SModel",
        fields: createReusableType().fields,
        methods: createReusableType().methods,
      }),
    ]));
  });

  it("compares TypeScript source export contents to project semantics", async () => {
    const project = createEquivalenceProject();
    const exported = await new TypeScriptExporter().export(project);
    const zip = await JSZip.loadAsync(exported.archive);
    const manifest = await readZipJson<{ projectName: string; sceneObjectCount: number; procedureCount: number; files: string[] }>(
      zip,
      "alice-web-typescript-source/manifest.json",
    );
    const projectSource = await readZipText(zip, "alice-web-typescript-source/src/project.ts");
    const sceneSource = await readZipText(zip, "alice-web-typescript-source/src/scene.ts");
    const procedureSource = await readZipText(zip, "alice-web-typescript-source/src/procedures/myFirstMethod.ts");

    expect(manifest.projectName).toBe(project.projectName);
    expect(manifest.sceneObjectCount).toBe(project.sceneObjects.length);
    expect(manifest.procedureCount).toBe(project.methods.length);
    expect(manifest.files).toEqual(exported.manifest.files);
    expect(projectSource).toContain(`projectName = "${project.projectName}"`);
    expect(sceneSource).toContain('aliceName: "bunny"');
    expect(sceneSource).toContain('className: "org.lgna.story.SBiped"');
    expect(sceneSource).toContain('resourceType: "BUNNY"');
    expect(sceneSource).toContain("position: { x: 1, y: 0, z: 2 }");
    expect(sceneSource).toContain("size: { width: 1, height: 2, depth: 1 }");
    expect(sceneSource).toContain('aliceName: "camera"');
    expect(sceneSource).toContain('className: "org.lgna.story.SCamera"');
    expect(sceneSource).toContain("position: { x: 0, y: 1.5, z: 6 }");
    expect(procedureSource).toContain("export async function myFirstMethod(scene: AliceScene, height: unknown): Promise<void>");
    expect(procedureSource).toContain("await scene.objects.bunny.move(\"UP\", height);");
    expect(procedureSource).toContain("await scene.objects.bunny.turn(\"LEFT\", 0.25);");
  });

  it("compares web package project, manifest, share, and validation artifacts", async () => {
    const project = createEquivalenceProject();
    const exported = await exportWebPackage(project, {
      title: "Artifact Equivalence Demo",
      description: "Checks package artifacts against project semantics.",
      canonicalUrl: "https://example.edu/alice/artifact-equivalence",
    });
    const zip = await JSZip.loadAsync(Buffer.from(exported.package.base64, "base64"));
    const manifest = await readZipJson<Record<string, unknown>>(zip, "manifest.json");
    const share = await readZipJson<Record<string, unknown>>(zip, "share.json");
    const validation = await readZipJson<{ valid: boolean; errors: unknown[]; evidence: string[] }>(zip, "validation.json");
    const projectPayload = await readZipJson<AliceProject>(zip, "project/project.json");
    const indexHtml = await readZipText(zip, "index.html");
    const embeddedProject = readEmbeddedProject(indexHtml);

    expect(projectSnapshot(projectPayload)).toEqual(projectSnapshot(project));
    expect(projectSnapshot(embeddedProject)).toEqual(projectSnapshot(project));
    expect(manifest).toMatchObject({
      product: "Alice",
      packageName: "alice-web",
      runtimeIdentity: "alice-web-player",
      entrypoint: "index.html",
      project: "project/project.json",
    });
    expect(share).toMatchObject({
      product: "Alice",
      runtimeIdentity: "alice-web-player",
      title: "Artifact Equivalence Demo",
      links: {
        html: "index.html",
        preview: "preview.png",
      },
    });
    expect(validation).toMatchObject({ valid: true, errors: [] });
    expect(validation.evidence).toEqual(expect.arrayContaining(["required-files-present", "entrypoint-playable", "alice-web-identity"]));
    expect(indexHtml).toContain("window.AlicePlayer");
    expect(indexHtml).toContain(project.projectName);
  });

  it("compares class behavior package JSON and imported project semantics", async () => {
    const sourceProject = createEquivalenceProject();
    const targetProject = createMinimalProject();
    targetProject.projectName = "Artifact Equivalence Target";
    const exportedPackage = exportClassBehaviorPackage(sourceProject, "SpinnerBehavior");
    const parsedPackage = parseClassBehaviorPackage(serializeClassBehaviorPackage(exportedPackage));
    const importResult = importClassBehaviorPackage(targetProject, parsedPackage);
    const saved = await writeProject(createArchive(targetProject), { generateThumbnailFromScene: false });
    const reopened = await readProject(saved);
    const reopenedType = reopened.project.types?.find((type) => type.name === importResult.importedName);

    expect(parsedPackage).toEqual(exportedPackage);
    expect(importResult).toMatchObject({
      importedName: "SpinnerBehavior",
      renamed: false,
      replaced: false,
      merged: false,
    });
    expect(reopenedType).toEqual(exportedPackage.type);
  });

  it("does not report executable class behavior for nested comment-only methods", () => {
    const project = createMinimalProject();
    project.types = [
      {
        name: "CommentOnlyBehavior",
        superTypeName: "org.lgna.story.SModel",
        fields: [],
        constructors: [],
        methods: [
          {
            name: "notesOnly",
            isFunction: false,
            returnType: "void",
            parameters: [],
            statements: [
              {
                kind: "Switch",
                expression: "mode",
                cases: [
                  { value: "open", body: [{ kind: "Comment", expression: "teacher note only" }] },
                ],
                defaultCase: [{ kind: "Comment", expression: "default teacher note only" }],
              },
            ],
          },
        ],
      },
    ];

    const exportedPackage = exportClassBehaviorPackage(project, "CommentOnlyBehavior");

    expect(exportedPackage.evidence).not.toContain("class-behavior-methods-preserved");
  });

  it("compares Alice evidence JSON to visible project behavior", () => {
    const project = createEquivalenceProject();
    const artifact = createAliceEvidenceArtifact({
      world: {
        name: project.projectName,
        aliceVersion: project.version,
        objectCount: project.sceneObjects.length,
      },
      run: {
        id: "run-artifact-equivalence",
        capturedAt: "2026-06-22T23:50:00.000Z",
      },
      visibleBehavior: {
        statusText: `Loaded "${project.projectName}" (${project.sceneObjects.length} objects).`,
        viewport: {
          width: 1280,
          height: 720,
          canvasSnapshot: { available: false, reason: "metadata-only" },
        },
        camera: {
          mode: "orbit",
          position: { x: 0, y: 1.5, z: 6 },
          target: { x: 0, y: 1, z: 0 },
        },
        objects: project.sceneObjects.map((object) => ({
          name: object.name,
          typeName: object.typeName,
          visible: true,
          position: object.position ?? { x: 0, y: 0, z: 0 },
        })),
      },
      export: {
        method: "download",
        requestedAt: "2026-06-22T23:50:01.000Z",
        filename: "Artifact Equivalence Demo Alice evidence.json",
        mimeType: "application/json",
      },
    });
    const serialized = serializeAliceEvidenceArtifact(artifact);
    const parsed = parseAliceEvidenceArtifact(serialized);

    expect(parsed).toEqual(artifact);
    expect(parsed.world).toMatchObject({
      name: project.projectName,
      aliceVersion: project.version,
      objectCount: project.sceneObjects.length,
    });
    expect(parsed.visibleBehavior.objects.map((object) => object.name).sort()).toEqual(["bunny", "camera"]);
    expect(parsed.export.filename).toMatch(/artifact-equivalence-demo-alice-evidence\.json/);
    expect(sha256(serialized)).toBe(sha256(serializeAliceEvidenceArtifact(parsed)));
  });
});
