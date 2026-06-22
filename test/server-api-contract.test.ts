import { afterEach, describe, expect, it } from "vitest";
import { parseA3P } from "../src/a3p-parser";
import { createServer } from "../src/server";
import { createEmptyWorldProject } from "../src/project-template";
import { writeA3P } from "../src/a3p-writer/archive";
import { readProject } from "../src/project-io";
import { AUDIO_MANIFEST_KEY } from "../src/project-audio";
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

function localGet(app: ReturnType<typeof createServer>, apiPath: string) {
  return request(app)
    .get(apiPath)
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
      runtime: "alice-web",
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

  it("exposes setup preflight config and evidence handoff without desktop-only claims", async () => {
    const evidenceDir = trackTempDir(makeTempDir("alice-api-contract-"));
    const app = createTestServer({ port: 4123, evidenceDir });

    const config = await request(app).get("/api/config").expect(200);
    expectOnlyKeys(config.body, [
      "schema_version",
      "runtime",
      "platform",
      "port",
      "evidenceDirConfigured",
      "projectConfigured",
      "endpoints",
      "doesNotClaim",
    ]);
    expect(config.body).toMatchObject({
      schema_version: "lookingglass.server-config/v1",
      runtime: "alice-web",
      platform: "lookingglass",
      port: 4123,
      evidenceDirConfigured: true,
      projectConfigured: false,
    });
    expect(config.body.endpoints).toMatchObject({
      health: "/api/health",
      setupPreflight: "/api/setup/preflight",
      evidenceHandoff: "/api/setup/evidence-handoff",
      projectTemplates: "/api/project/templates",
      createProject: "/api/project/new",
    });
    expect(config.body.doesNotClaim).toContain("Java desktop Alice launch");

    const preflight = await request(app)
      .get("/api/setup/preflight")
      .query({ scenario: "setup-preflight-ready-to-create" })
      .expect(200);
    expectOnlyKeys(preflight.body, [
      "schema_version",
      "status",
      "runtime",
      "platform",
      "scenario",
      "checks",
      "unsupportedCapabilities",
      "classroomReadiness",
      "doesNotClaim",
    ]);
    expect(preflight.body).toMatchObject({
      schema_version: "lookingglass.setup-preflight/v1",
      status: "ready",
      runtime: "alice-web",
      platform: "lookingglass",
      scenario: "setup-preflight-ready-to-create",
    });
    expect(preflight.body.classroomReadiness.readyToCreateProject).toBe(true);
    expect(preflight.body.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "server-health", status: "pass" }),
        expect.objectContaining({ id: "create-project", status: "pass" }),
        expect.objectContaining({ id: "desktop-java-opengl", status: "unsupported" }),
      ]),
    );
    expect(preflight.body.doesNotClaim).toContain("native OpenGL driver diagnosis");

    const handoff = await localPost(app, "/api/setup/evidence-handoff")
      .send({ scenario: "instructor-student-launch-evidence-handoff" })
      .expect(200);
    expectOnlyKeys(handoff.body, [
      "schema_version",
      "status",
      "runtime",
      "platform",
      "scenario",
      "evidenceArtifact",
      "handoff",
    ]);
    expect(handoff.body).toMatchObject({
      schema_version: "lookingglass.setup-evidence-handoff/v1",
      status: "handoff-created",
      runtime: "alice-web",
      platform: "lookingglass",
      scenario: "instructor-student-launch-evidence-handoff",
    });
    expect(handoff.body.handoff.studentNextActions).toContain(
      "record one visible result after running",
    );
    expect(handoff.body.handoff.supportHandoffFields).toContain("retest signal");
    expect(fs.existsSync(handoff.body.evidenceArtifact)).toBe(true);
    expect(readJson(handoff.body.evidenceArtifact).status).toBe("handoff-created");
  });

  it("rejects a requested missing .a3p file without launching", async () => {
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
      .expect(400);

    expectOnlyKeys(response.body, ["error"]);
    expect(response.body.error).toContain("not found");
    expect(fs.existsSync(requestedProject)).toBe(false);

    const health = await request(app).get("/api/health").expect(200);
    expect(health.body.launched).toBe(false);
  });

  it("rejects a requested corrupt .a3p file without launching", async () => {
    const evidenceDir = trackTempDir(makeTempDir("alice-api-contract-"));
    const projectRoot = trackTempDir(makeTempDir("alice-project-root-"));
    const requestedProject = path.join(projectRoot, "corrupt-project.a3p");
    fs.writeFileSync(requestedProject, "not a zip archive");
    const app = createTestServer({
      port: 0,
      evidenceDir,
      allowedProjectDirs: [projectRoot],
    });

    const response = await localPost(app, "/api/launch")
      .send({ project: requestedProject })
      .expect(400);

    expectOnlyKeys(response.body, ["error"]);
    expect(response.body.error).toContain("corrupt");

    const health = await request(app).get("/api/health").expect(200);
    expect(health.body.launched).toBe(false);
  });

  it("rejects a requested unreadable .a3p path without launching", async () => {
    const evidenceDir = trackTempDir(makeTempDir("alice-api-contract-"));
    const projectRoot = trackTempDir(makeTempDir("alice-project-root-"));
    const requestedProject = path.join(projectRoot, "directory-project.a3p");
    fs.mkdirSync(requestedProject);
    const app = createTestServer({
      port: 0,
      evidenceDir,
      allowedProjectDirs: [projectRoot],
    });

    const response = await localPost(app, "/api/launch")
      .send({ project: requestedProject })
      .expect(400);

    expectOnlyKeys(response.body, ["error"]);
    expect(response.body.error).toContain("could not be read");

    const health = await request(app).get("/api/health").expect(200);
    expect(health.body.launched).toBe(false);
  });

  it("launches with a requested readable .a3p file", async () => {
    const evidenceDir = trackTempDir(makeTempDir("alice-api-contract-"));
    const projectRoot = trackTempDir(makeTempDir("alice-project-root-"));
    const requestedProject = path.join(projectRoot, "valid-project.a3p");
    fs.writeFileSync(
      requestedProject,
      await writeA3P(createEmptyWorldProject({ projectName: "Valid Project" })),
    );
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
      project: fs.realpathSync(requestedProject),
      projectName: "Valid Project",
      sceneObjectCount: 2,
    });

    const health = await request(app).get("/api/health").expect(200);
    expect(health.body.launched).toBe(true);
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

  it("proves Alice audio asset, background music, cue, save, reload, and evidence workflow", async () => {
    const evidenceDir = trackTempDir(makeTempDir("alice-api-contract-"));
    const app = createTestServer({
      port: 0,
      evidenceDir,
      allowedProjectDirs: [evidenceDir],
    });
    await localPost(app, "/api/launch").send({}).expect(200);

    const formats = await request(app).get("/api/audio/formats").expect(200);
    expect(formats.body).toEqual({ formats: [".mp3", ".wav", ".ogg", ".m4a"] });

    await localPost(app, "/api/audio/assets")
      .send({
        fileName: "theme.flac",
        dataBase64: Buffer.from([1, 2, 3]).toString("base64"),
      })
      .expect(400);

    const themeBytes = Buffer.alloc(2048, 7);
    const assetResponse = await localPost(app, "/api/audio/assets")
      .send({
        fileName: "theme.mp3",
        dataBase64: themeBytes.toString("base64"),
        durationSeconds: 12.5,
      })
      .expect(200);
    expectOnlyKeys(assetResponse.body, ["status", "asset"]);
    expect(assetResponse.body.status).toBe("registered");
    expect(assetResponse.body.asset).toMatchObject({
      id: "audio-1",
      name: "theme.mp3",
      format: "mp3",
      resourcePath: "resources/audio/audio-1.mp3",
      sizeBytes: themeBytes.length,
      durationSeconds: 12.5,
    });

    const background = await localPost(app, "/api/audio/background")
      .send({
        assetId: "audio-1",
        volume: 0.75,
        loop: true,
      })
      .expect(200);
    expect(background.body).toEqual({
      status: "configured",
      backgroundMusic: {
        assetId: "audio-1",
        volume: 0.75,
        loop: true,
      },
    });

    const cue = await localPost(app, "/api/audio/cues")
      .send({
        id: "intro-cue",
        assetId: "audio-1",
        animationId: "scene.myFirstMethod.spin",
        timelineTimeSeconds: 1.25,
        volume: 0.5,
      })
      .expect(200);
    expect(cue.body).toEqual({
      status: "configured",
      cue: {
        id: "intro-cue",
        assetId: "audio-1",
        animationId: "scene.myFirstMethod.spin",
        timelineTimeSeconds: 1.25,
        volume: 0.5,
      },
    });

    const save = await localPost(app, "/api/project/save")
      .send({ saveSelector: "audio.workflow" })
      .expect(200);
    const savedProjectPath = path.join(evidenceDir, "project-save", "saved-project.a3p");
    const archive = await readProject(fs.readFileSync(savedProjectPath));
    expect(archive.resources.get("resources/audio/audio-1.mp3")).toEqual(new Uint8Array(themeBytes));
    expect(archive.manifest?.[AUDIO_MANIFEST_KEY]).toMatchObject({
      version: 1,
      assets: [
        {
          id: "audio-1",
          name: "theme.mp3",
          format: "mp3",
          resourcePath: "resources/audio/audio-1.mp3",
          sizeBytes: themeBytes.length,
          durationSeconds: 12.5,
        },
      ],
      backgroundMusic: {
        assetId: "audio-1",
        volume: 0.75,
        loop: true,
      },
      cues: [
        {
          id: "intro-cue",
          assetId: "audio-1",
          animationId: "scene.myFirstMethod.spin",
          timelineTimeSeconds: 1.25,
          volume: 0.5,
        },
      ],
    });

    const reloadApp = createTestServer({
      port: 0,
      evidenceDir,
      allowedProjectDirs: [path.dirname(savedProjectPath)],
    });
    await localPost(reloadApp, "/api/launch")
      .send({ project: savedProjectPath })
      .expect(200);
    const reloadedState = await localGet(reloadApp, "/api/audio/state").expect(200);
    expect(reloadedState.body).toMatchObject({
      supportedFormats: [".mp3", ".wav", ".ogg", ".m4a"],
      assets: [assetResponse.body.asset],
      backgroundMusic: background.body.backgroundMusic,
      cues: [cue.body.cue],
    });

    const evidence = await localPost(reloadApp, "/api/audio/evidence")
      .send({
        savedProjectArtifact: save.body.saved_project_artifact,
        reloaded: true,
      })
      .expect(200);
    expect(evidence.body).toMatchObject({
      schema_version: "alice.audio-workflow-result/v1",
      status: "proved",
      evidenceArtifact: path.join(evidenceDir, "audio-workflow.json"),
    });
    const audioEvidence = readJson(evidence.body.evidenceArtifact);
    expect(audioEvidence).toMatchObject({
      schema_version: "alice.audio-workflow/v1",
      source: "alice-web",
      status: "proved",
      supported_formats: [".mp3", ".wav", ".ogg", ".m4a"],
      asset_count: 1,
      asset_names: ["theme.mp3"],
      background_music_configured: true,
      cue_count: 1,
      cue_ids: ["intro-cue"],
      saved_project_artifact: "saved-project.a3p",
      reloaded: true,
    });
    expect(JSON.stringify(audioEvidence)).not.toContain("LookingGlass");
    expect(JSON.stringify(audioEvidence)).not.toContain("lookingglass");
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
