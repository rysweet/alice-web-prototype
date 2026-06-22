import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createMinimalProject } from "../test-utils.js";
import { projectService } from "../../src/server/project-service.js";
import {
  buildCurrentProject,
  createInitialServerState,
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

  it("rejects export before a current Alice project is launched", async () => {
    const state = createInitialServerState();

    await expect(projectService.exportTypeScript(state)).rejects.toThrow(/launch|current project/i);
  });
});
