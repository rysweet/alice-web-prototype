import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createMinimalProject } from "../test-utils.js";
import { projectService, writeAllowedProjectFile } from "../../src/server/project-service.js";
import { evidenceService } from "../../src/server/evidence-service.js";
import { readProject } from "../../src/project-io.js";
import {
  buildCurrentProject,
  createInitialServerState,
  registerMethod,
  seedDefaultSceneObjects,
} from "../../src/server/state.js";

async function readArchiveText(archive: Buffer | Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(archive);
  const files = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .sort((left, right) => left.name.localeCompare(right.name));
  const contents = await Promise.all(files.map((entry) => entry.async("string")));
  return contents.join("\n");
}

describe("ProjectService.exportTypeScript", () => {
  it("returns Alice-branded ZIP metadata and a non-empty TypeScript source archive", async () => {
    const state = createInitialServerState();
    state.launched = true;
    seedDefaultSceneObjects(state);
    state.sceneObjects.set("bunny", {
      name: "bunny",
      className: "org.lgna.story.SBiped",
      position: { x: 1, y: 0, z: 0 },
    });
    state.procedures.set("myFirstMethod", ["jump"]);

    const result = await projectService.exportTypeScript(state);

    expect(result.filename).toBe("alice-web-typescript-source.zip");
    expect(result.contentType).toBe("application/zip");
    expect(Buffer.isBuffer(result.archive)).toBe(true);
    expect(result.archive.length).toBeGreaterThan(0);
    expect(result.manifest).toMatchObject({
      product: "alice-web",
      runtime: "Alice",
      projectName: "Program",
      entryPoint: "src/project.ts",
    });

    const allText = await readArchiveText(result.archive);
    expect(allText).toContain("bunny");
    expect(allText).toContain("jump");
    expect(allText).not.toMatch(/lookingglass/i);
  });

  it("exports the current project with live server-side edits merged over parsed .a3p state", async () => {
    const state = createInitialServerState();
    state.launched = true;
    state.projectName = "Parsed Plus Live";
    state.parsedProject = createMinimalProject();
    state.parsedProject.projectName = "Parsed Plus Live";
    state.parsedProject.sceneObjects.push({
      name: "parsedOnly",
      typeName: "org.lgna.story.SGround",
      resourceType: null,
      position: null,
      orientation: null,
      size: null,
    });
    state.parsedProject.methods.push({
      name: "myFirstMethod",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [],
    });
    state.sceneObjects.set("liveOnly", {
      name: "liveOnly",
      className: "org.lgna.story.SBiped",
      position: { x: 3, y: 0, z: 4 },
    });
    state.procedures.set("myFirstMethod", ["waveFromLiveEdit"]);

    const result = await projectService.exportTypeScript(state);
    const allText = await readArchiveText(result.archive);

    expect(allText).toContain("parsedOnly");
    expect(allText).toContain("liveOnly");
    expect(allText).toContain("waveFromLiveEdit");
  });

  it("keeps class-owned methods out of Scene when rebuilding reopened projects", () => {
    const state = createInitialServerState();
    state.parsedProject = {
      version: "3.10",
      projectName: "Ownership",
      sceneObjects: [],
      methods: [],
      types: [
        {
          name: "Scene",
          superTypeName: "org.lgna.story.SScene",
          methods: [{
            name: "sceneOnly",
            isFunction: false,
            returnType: "void",
            parameters: [],
            statements: [],
          }],
        },
        {
          name: "ReusableDoor",
          methods: [{
            name: "doorOnly",
            isFunction: false,
            returnType: "void",
            parameters: [],
            statements: [],
          }],
        },
      ],
    };
    state.procedures = new Map([["sceneOnly", ["wave"]]]);

    const project = buildCurrentProject(state);
    const sceneType = project.types?.find((type) => type.name === "Scene");
    const doorType = project.types?.find((type) => type.name === "ReusableDoor");

    expect(sceneType?.methods?.map((method) => method.name)).toEqual(["sceneOnly"]);
    expect(doorType?.methods?.map((method) => method.name)).toEqual(["doorOnly"]);
  });

  it("does not promote class-owned methods when a typed project has an empty Scene method list", () => {
    const state = createInitialServerState();
    state.parsedProject = createMinimalProject();
    state.parsedProject.types?.push({
      name: "ReusableDoor",
      superTypeName: "org.lgna.story.SModel",
      fields: [],
      constructors: [],
      methods: [{
        name: "doorOnly",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [],
      }],
    });

    const project = buildCurrentProject(state);

    expect(project.methods.map((method) => method.name)).not.toContain("doorOnly");
    expect(project.types?.find((type) => type.name === "ReusableDoor")?.methods?.map((method) => method.name))
      .toContain("doorOnly");
  });

  it("preserves newly registered Scene function metadata for reopened typed projects", () => {
    const state = createInitialServerState();
    state.parsedProject = createMinimalProject();

    registerMethod(state, "distanceToTarget", true, "DecimalNumber", [
      { name: "target", type: "SModel" },
    ]);

    const project = buildCurrentProject(state);
    const method = project.methods.find((candidate) => candidate.name === "distanceToTarget");
    const sceneMethod = project.types
      ?.find((type) => type.superTypeName?.includes("SScene"))
      ?.methods?.find((candidate) => candidate.name === "distanceToTarget");

    expect(method).toMatchObject({
      isFunction: true,
      returnType: "DecimalNumber",
      parameters: [{ name: "target", type: "SModel" }],
    });
    expect(sceneMethod).toMatchObject({
      isFunction: true,
      returnType: "DecimalNumber",
      parameters: [{ name: "target", type: "SModel" }],
    });
  });

  it("preserves newly registered function metadata for default in-memory projects", () => {
    const state = createInitialServerState();

    registerMethod(state, "distanceToTarget", true, "DecimalNumber", [
      { name: "target", type: "SModel" },
    ]);

    const project = buildCurrentProject(state);
    expect(project.methods.find((candidate) => candidate.name === "distanceToTarget"))
      .toMatchObject({
        isFunction: true,
        returnType: "DecimalNumber",
        parameters: [{ name: "target", type: "SModel" }],
      });
  });

  it("preserves reopened archive resources in edited project artifacts", async () => {
    const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-edit-resource-test-"));
    try {
      const resourcePath = "resources/textures/moon-rock.png";
      const resourceBytes = new Uint8Array([137, 80, 78, 71]);
      const state = createInitialServerState();
      const project = createMinimalProject();
      state.launched = true;
      state.projectName = project.projectName;
      state.parsedProject = project;
      state.procedures = new Map([["myFirstMethod", []]]);
      state.resources = new Map([[resourcePath, resourceBytes]]);
      state.projectArchive = {
        project,
        manifest: null,
        resources: state.resources,
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

      await projectService.editProcedure(state, evidenceDir, evidenceService, {
        procedureSelector: "scene.myFirstMethod",
        editSpec: "append-comment:resource-preservation-proof",
      });

      const archive = await readProject(fs.readFileSync(path.join(evidenceDir, "edited-project.a3p")));
      expect(Array.from(archive.resources.get(resourcePath) ?? [])).toEqual(Array.from(resourceBytes));
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
    }
  });

  it("preserves an existing target when an allowed project file write fails before rename", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-atomic-save-test-"));
    try {
      const targetPath = path.join(projectDir, "existing-project.a3p");
      const originalBytes = Buffer.from("existing project bytes");
      fs.writeFileSync(targetPath, originalBytes);

      await expect(writeAllowedProjectFile(
        targetPath,
        Buffer.from("replacement project bytes"),
        [projectDir],
        {
          beforeRename: () => {
            throw new Error("injected write failure");
          },
        },
      )).rejects.toThrow(/could not be written/);

      expect(fs.readFileSync(targetPath)).toEqual(originalBytes);
      expect(fs.readdirSync(projectDir).filter((entry) => entry.endsWith(".tmp"))).toEqual([]);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("exports web packages with project resources but without internal source XML", async () => {
    const state = createInitialServerState();
    state.launched = true;
    state.projectName = "Web Package Resources";
    seedDefaultSceneObjects(state);
    state.resources.set("__original_xml__", new TextEncoder().encode("<node />"));
    state.resources.set("resources/models/robot.glb", new Uint8Array([1, 2, 3]));
    state.resources.set("resources/textures/paint.webp", new Uint8Array([7, 8, 9]));
    state.resources.set("preview.png", new Uint8Array([9, 9, 9]));

    const result = await projectService.exportWebPackage(state, {
      title: "Resource Package",
      resources: [{ path: "resources/textures/paint.png", bytes: new Uint8Array([4, 5, 6]) }],
    });
    const zip = await JSZip.loadAsync(Buffer.from(result.package.base64, "base64"));

    expect(zip.file("__original_xml__")).toBeNull();
    expect(await zip.file("resources/models/robot.glb")?.async("uint8array")).toEqual(new Uint8Array([1, 2, 3]));
    expect(await zip.file("resources/textures/paint.webp")?.async("uint8array")).toEqual(new Uint8Array([7, 8, 9]));
    expect(await zip.file("resources/textures/paint.png")?.async("uint8array")).toEqual(new Uint8Array([4, 5, 6]));
    expect(await zip.file("preview.png")?.async("uint8array")).not.toEqual(new Uint8Array([9, 9, 9]));
    const html = await zip.file("index.html")!.async("string");
    expect(html).toContain("alice-export-resources");
    expect(html).toContain("resources/textures/paint.png");
    expect(html).toContain("resources/textures/paint.webp");
    expect(html).toContain("data:image/webp;base64");
  });

  it("rejects export before a current Alice project is launched", async () => {
    const state = createInitialServerState();

    await expect(projectService.exportTypeScript(state)).rejects.toThrow(/launch|current project/i);
  });
});
