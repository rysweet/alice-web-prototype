import { describe, expect, it } from "vitest";
import {
  generateThumbnailFromProjectScene,
  readProject,
  writeProject,
  ProjectIoError,
  type AliceProjectArchive,
  type WriteProjectOptions,
} from "./project-io.js";
import type { AliceProject } from "./a3p-parser.js";

function createProject(): AliceProject {
  return {
    version: "3.10.0.0",
    projectName: "Project IO Contract",
    sceneObjects: [],
    methods: [],
    types: [],
  };
}

function createArchive(resources = new Map<string, Uint8Array>()): AliceProjectArchive {
  const project = createProject();
  return {
    project,
    manifest: null,
    resources,
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

describe("project-io public facade", () => {
  it("keeps the existing public API exports stable", () => {
    const options: WriteProjectOptions = { generateThumbnailFromScene: false };

    expect(typeof readProject).toBe("function");
    expect(typeof writeProject).toBe("function");
    expect(typeof generateThumbnailFromProjectScene).toBe("function");
    expect(options.generateThumbnailFromScene).toBe(false);
  });

  it("keeps ProjectIoError code and cause information available to callers", () => {
    const cause = new Error("inner");
    const error = new ProjectIoError("unsafe-path", "Unsafe archive path rejected.", cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ProjectIoError");
    expect(error.code).toBe("unsafe-path");
    expect(error.cause).toBe(cause);
  });

  it("rejects unsafe XML pass-through entry names before writing", async () => {
    const resources = new Map<string, Uint8Array>([
      ["__original_xml__", new TextEncoder().encode("<!-- ../programType.xml -->\n<node />")],
    ]);

    await expect(writeProject(createArchive(resources))).rejects.toMatchObject({
      code: "unsafe-path",
    });
  });
});
