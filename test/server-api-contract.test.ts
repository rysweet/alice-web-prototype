import { afterEach, describe, expect, it } from "vitest";
import { parseA3P } from "../src/a3p-parser";
import { createServer } from "../src/server";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";
import { LOCAL_API_TOKEN_HEADER } from "../src/server/security";

const TEST_LOCAL_API_TOKEN = "test-local-api-token";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function expectOnlyKeys(value: Record<string, unknown>, keys: string[]): void {
  expect(Object.keys(value).sort()).toEqual([...keys].sort());
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function createTestServer(options: Parameters<typeof createServer>[0]) {
  return createServer({
    ...options,
    localApiToken: TEST_LOCAL_API_TOKEN,
  });
}

function localPost(app: ReturnType<typeof createServer>, apiPath: string) {
  return request(app)
    .post(apiPath)
    .set(LOCAL_API_TOKEN_HEADER, TEST_LOCAL_API_TOKEN);
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

describe("server API response contracts", () => {
  it("characterizes health and default launch response shapes", async () => {
    const evidenceDir = trackTempDir(makeTempDir("alice-api-contract-"));
    const app = createTestServer({ port: 0, evidenceDir });

    const beforeLaunch = await request(app).get("/api/health").expect(200);
    expectOnlyKeys(beforeLaunch.body, [
      "status",
      "launched",
      "pid",
      "uptime",
      "runtime",
    ]);
    expect(beforeLaunch.body).toMatchObject({
      status: "running",
      launched: false,
      runtime: "lookingglass-typescript-web",
    });
    expect(typeof beforeLaunch.body.pid).toBe("number");
    expect(typeof beforeLaunch.body.uptime).toBe("number");

    const launch = await localPost(app, "/api/launch").send({}).expect(200);
    expectOnlyKeys(launch.body, [
      "status",
      "project",
      "projectName",
      "sceneObjectCount",
    ]);
    expect(launch.body).toEqual({
      status: "launched",
      project: null,
      projectName: "Program",
      sceneObjectCount: 2,
    });

    const afterLaunch = await request(app).get("/api/health").expect(200);
    expect(afterLaunch.body.launched).toBe(true);
  });

  it("preserves launch path semantics for valid missing .a3p files", async () => {
    const evidenceDir = trackTempDir(makeTempDir("alice-api-contract-"));
    const projectRoot = trackTempDir(makeTempDir("alice-project-root-"));
    const requestedProject = path.join(projectRoot, "missing-project.a3p");
    const app = createTestServer({
      port: 0,
      evidenceDir,
      allowedProjectDirs: [projectRoot],
    });

    const response = await localPost(app, "/api/launch")
      .send({ project: requestedProject })
      .expect(200);

    expectOnlyKeys(response.body, [
      "status",
      "project",
      "projectName",
      "sceneObjectCount",
    ]);
    expect(response.body).toEqual({
      status: "launched",
      project: requestedProject,
      projectName: "Program",
      sceneObjectCount: 2,
    });
    expect(fs.existsSync(requestedProject)).toBe(false);

    const edit = await localPost(app, "/api/code/edit-procedure")
      .send({
        procedureSelector: "scene.myFirstMethod",
        editSpec: "append-comment:missing source marker",
      })
      .expect(200);
    expect(edit.body.status).toBe("proved");

    const editedProjectPath = path.join(evidenceDir, "edited-project.a3p");
    const editedProjectBytes = fs.readFileSync(editedProjectPath);
    expect(editedProjectBytes.toString("utf-8")).not.toContain("placeholder-source-marker");
    const editedProject = await parseA3P(editedProjectBytes);
    expect(editedProject.projectName).toBe("Program");
    expect(editedProject.methods.map((method) => method.name)).toContain("myFirstMethod");
  });

  it("characterizes scene, code edit, save, and run artifact contracts", async () => {
    const evidenceDir = trackTempDir(makeTempDir("alice-api-contract-"));
    const app = createTestServer({ port: 0, evidenceDir });
    await localPost(app, "/api/launch").send({}).expect(200);

    const scene = await localPost(app, "/api/scene/add-object")
      .send({ className: "org.lgna.story.SBiped", name: "bunny" })
      .expect(200);
    expectOnlyKeys(scene.body, [
      "status",
      "objectName",
      "className",
      "sceneFieldCountAfter",
      "evidenceArtifact",
    ]);
    expect(scene.body).toMatchObject({
      status: "added",
      objectName: "bunny",
      className: "org.lgna.story.SBiped",
      sceneFieldCountAfter: 3,
    });
    expect(scene.body.evidenceArtifact).toBe(path.join(evidenceDir, "scene-object-added.json"));
    const sceneArtifact = readJson(scene.body.evidenceArtifact);
    expectOnlyKeys(sceneArtifact, [
      "schema_version",
      "timestamp",
      "object_class_name",
      "scene_field_count_after",
    ]);
    expect(sceneArtifact).toMatchObject({
      schema_version: "eatme.alice-scene-object-added/v1",
      object_class_name: "org.lgna.story.SBiped",
      scene_field_count_after: 3,
    });
    expect(typeof sceneArtifact.timestamp).toBe("number");

    const edit = await localPost(app, "/api/code/edit-procedure")
      .send({
        procedureSelector: "scene.myFirstMethod",
        editSpec: "append-comment:contract marker",
      })
      .expect(200);
    expectOnlyKeys(edit.body, [
      "schema_version",
      "status",
      "procedure_selector",
      "edited_project_artifact",
      "action_proof",
      "doesNotClaim",
      "evidenceArtifact",
    ]);
    expect(edit.body).toMatchObject({
      schema_version: "eatme.alice-first-lesson-code-editor-action-proof-result/v1",
      status: "proved",
      procedure_selector: "scene.myFirstMethod",
      edited_project_artifact: "edited-project.a3p",
      action_proof: "first-lesson-code-editor-action-proof.json",
    });
    expect(edit.body.doesNotClaim).toContain("visible rendering correctness");
    const editedProjectPath = path.join(evidenceDir, "edited-project.a3p");
    expect(fs.existsSync(editedProjectPath)).toBe(true);
    const editedProjectBytes = fs.readFileSync(editedProjectPath);
    expect(editedProjectBytes.toString("utf-8")).not.toContain("placeholder-source-marker");
    const editedProject = await parseA3P(editedProjectBytes);
    expect(editedProject.projectName).toBe("Program");
    expect(editedProject.methods.map((method) => method.name)).toContain("myFirstMethod");
    expect(readJson(edit.body.evidenceArtifact)).toMatchObject({
      schema_version: "eatme.alice-first-lesson-code-editor-action-proof/v1",
      status: "proved",
      procedure_selector: "scene.myFirstMethod",
      marker: "contract marker",
      success: true,
    });

    const save = await localPost(app, "/api/project/save")
      .send({ saveSelector: "scene.myFirstMethod" })
      .expect(200);
    expectOnlyKeys(save.body, [
      "schema_version",
      "status",
      "save_selector",
      "saved_project_artifact",
      "save_artifact",
      "evidenceArtifact",
    ]);
    expect(save.body).toMatchObject({
      schema_version: "eatme.alice-project-save-result/v1",
      status: "saved",
      save_selector: "scene.myFirstMethod",
      saved_project_artifact: "saved-project.a3p",
      save_artifact: "desktop-save-operation-result.json",
    });
    expect(fs.existsSync(path.join(evidenceDir, "project-save", "saved-project.a3p"))).toBe(true);
    expect(readJson(save.body.evidenceArtifact)).toMatchObject({
      schema_version: "eatme.alice-desktop-save-operation-result/v1",
      status: "saved",
      saved_file_exists: true,
      wroteFile: true,
    });

    const run = await localPost(app, "/api/world/run").send({}).expect(200);
    expectOnlyKeys(run.body, [
      "schema_version",
      "status",
      "project_name",
      "scene_object_count",
      "procedure_count",
      "statements_executed",
      "execution_log",
      "run_duration_ms",
      "errors",
      "doesNotClaim",
      "evidenceArtifact",
    ]);
    expect(run.body).toMatchObject({
      schema_version: "eatme.alice-run-world-result/v1",
      status: "completed",
      project_name: "Program",
      scene_object_count: 3,
      procedure_count: 1,
      errors: [],
    });
    expect(Array.isArray(run.body.execution_log)).toBe(true);
    expect(typeof run.body.run_duration_ms).toBe("number");
    expect(readJson(run.body.evidenceArtifact)).toMatchObject({
      schema_version: "eatme.alice-run-world-result/v1",
      status: "completed",
      scene_object_count: 3,
    });
  });

  it("characterizes error response contracts without mutating launch state", async () => {
    const evidenceDir = trackTempDir(makeTempDir("alice-api-contract-"));
    const app = createTestServer({
      port: 0,
      evidenceDir,
      allowedProjectDirs: [evidenceDir],
    });

    const runBeforeLaunch = await localPost(app, "/api/world/run")
      .send({})
      .expect(400);
    expect(runBeforeLaunch.body).toEqual({
      error: "Not launched. Call POST /api/launch first.",
    });

    const invalidLaunch = await localPost(app, "/api/launch")
      .send({ project: 12345 })
      .expect(400);
    expect(invalidLaunch.body).toEqual({
      error: "project path must be a string",
    });

    const unknownTemplate = await localPost(app, "/api/project/new")
      .send({ templateId: "does-not-exist" })
      .expect(400);
    expectOnlyKeys(unknownTemplate.body, ["error", "availableTemplates"]);
    expect(unknownTemplate.body.error).toBe("Unknown template: does-not-exist");
    expect(unknownTemplate.body.availableTemplates).toContain("blank");

    const health = await request(app).get("/api/health").expect(200);
    expect(health.body.launched).toBe(false);
  });
});
