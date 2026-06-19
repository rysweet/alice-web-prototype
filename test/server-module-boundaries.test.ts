import { afterEach, describe, expect, it } from "vitest";
import { validateProjectPath as exportedValidateProjectPath } from "../src/server";
import { createServerContext } from "../src/server/context";
import { evidenceService } from "../src/server/evidence-service";
import { projectService } from "../src/server/project-service";
import {
  createInitialServerState,
  parseMethodParams,
  seedDefaultSceneObjects,
} from "../src/server/state";
import { templateService } from "../src/server/template-service";
import {
  sanitizeFilename,
  validateProjectPath,
} from "../src/server/validation";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const tempDirs: string[] = [];

function trackTempDir(dir: string): string {
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("server module boundary contracts", () => {
  it("keeps validateProjectPath available from src/server as a compatibility re-export", () => {
    const root = trackTempDir(makeTempDir("alice-allowed-root-"));
    const safeProject = path.join(root, "safe.a3p");

    expect(exportedValidateProjectPath).toBe(validateProjectPath);
    expect(exportedValidateProjectPath(safeProject, [root])).toEqual({
      valid: true,
      resolvedPath: safeProject,
    });
    expect(exportedValidateProjectPath(path.join(root, "safe.txt"), [root])).toEqual({
      valid: false,
      error: "project path must be an .a3p file",
    });
  });

  it("creates per-server context without sharing mutable project state", () => {
    const firstEvidenceDir = trackTempDir(makeTempDir("alice-context-first-"));
    const secondEvidenceDir = trackTempDir(makeTempDir("alice-context-second-"));

    const first = createServerContext({ port: 0, evidenceDir: firstEvidenceDir });
    const second = createServerContext({ port: 0, evidenceDir: secondEvidenceDir });

    seedDefaultSceneObjects(first.state);
    first.state.sceneObjects.set("bunny", {
      name: "bunny",
      className: "org.lgna.story.SBiped",
      position: { x: 0, y: 0, z: 0 },
    });
    first.state.procedures.set("customProcedure", []);

    expect(fs.statSync(firstEvidenceDir).isDirectory()).toBe(true);
    expect(fs.statSync(secondEvidenceDir).isDirectory()).toBe(true);
    expect(first.state).not.toBe(second.state);
    expect(first.state.sceneObjects).not.toBe(second.state.sceneObjects);
    expect(first.state.procedures).not.toBe(second.state.procedures);
    expect(first.state.eventSystem).not.toBe(second.state.eventSystem);
    expect(first.state.templateLibrary).not.toBe(second.state.templateLibrary);
    expect(first.state.sceneObjects.size).toBe(3);
    expect(second.state.sceneObjects.size).toBe(0);
    expect(second.state.procedures.has("customProcedure")).toBe(false);
  });

  it("keeps validation and state helpers deterministic at edge boundaries", () => {
    expect(sanitizeFilename("../../Unsafe\\Name")).toBe("____Unsafe_Name");
    expect(parseMethodParams(undefined)).toEqual({ ok: true, params: [] });
    expect(parseMethodParams([
      { name: " speed ", type: "Number", defaultValue: "1" },
      { name: "target" },
    ])).toEqual({
      ok: true,
      params: [
        { name: "speed", type: "Number", defaultValue: "1" },
        { name: "target", type: "Object" },
      ],
    });
    expect(parseMethodParams([{ name: "   " }])).toEqual({
      ok: false,
      error: "Each parameter must have a non-empty name",
    });
  });

  it("orchestrates project launch by seeding state and resetting event registrations", async () => {
    const state = createInitialServerState();
    state.eventSystem.register({ eventType: "sceneActivated", handlerName: "beforeLaunch" });
    expect(state.eventSystem.totalRegistrations).toBe(1);

    const result = await projectService.launchProject(state, null);

    expect(result.ok).toBe(true);
    expect(state.launched).toBe(true);
    expect(state.projectPath).toBe(null);
    expect(state.projectName).toBe("Program");
    expect([...state.sceneObjects.keys()]).toEqual(["ground", "camera"]);
    expect(state.eventSystem.totalRegistrations).toBe(0);
  });

  it("rejects missing requested projects without mutating launch state", async () => {
    const state = createInitialServerState();
    const missingProject = path.join(trackTempDir(makeTempDir("alice-launch-root-")), "missing.a3p");

    const result = await projectService.launchProject(state, missingProject);

    expect(result).toEqual({
      ok: false,
      error: `project file not found: ${missingProject}`,
    });
    expect(state.launched).toBe(false);
    expect(state.projectPath).toBe(null);
    expect(state.projectName).toBe("Program");
    expect(state.sceneObjects.size).toBe(0);
  });

  it("orchestrates template new-project behavior through state and artifact writes", async () => {
    const evidenceDir = trackTempDir(makeTempDir("alice-template-service-"));
    const state = createInitialServerState();

    const result = await templateService.createProject(state, evidenceDir, {
      templateId: "blank",
      projectName: "../../Unsafe\\Name",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response).toMatchObject({
      schema_version: "eatme.alice-project-new-result/v1",
      status: "created",
      templateId: "blank",
      projectName: "../../Unsafe\\Name",
      sceneObjectCount: 2,
    });
    const projectPath = result.response.projectPath;
    expect(typeof projectPath).toBe("string");
    if (typeof projectPath !== "string") {
      throw new Error("projectPath must be a string");
    }
    expect(projectPath).toBe(path.join(
      evidenceDir,
      "project-new",
      "____Unsafe_Name.a3p",
    ));
    expect(fs.existsSync(projectPath)).toBe(true);
    expect(state.launched).toBe(true);
    expect(state.projectName).toBe("../../Unsafe\\Name");
    expect([...state.sceneObjects.keys()]).toEqual(["ground", "camera"]);
  });

  it("keeps evidence artifact fallback writes explicit and non-empty", async () => {
    const evidenceDir = trackTempDir(makeTempDir("alice-evidence-service-"));
    const editedPath = await evidenceService.writeEditedProjectArtifact(
      path.join(evidenceDir, "missing-source.a3p"),
      evidenceDir,
    );

    expect(editedPath).toBe(path.join(evidenceDir, "edited-project.a3p"));
    expect(fs.existsSync(editedPath)).toBe(true);
    expect(fs.statSync(editedPath).size).toBeGreaterThan(0);
  });
});
