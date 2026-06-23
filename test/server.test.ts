import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { parseA3P } from "../src/a3p-parser";
import { readProject, writeProject, type AliceProjectArchive } from "../src/project-io";
import { createServer } from "../src/server";
import { createMinimalProject } from "./test-utils.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Express } from "express";
import request from "supertest";
import type { Response as SupertestResponse } from "superagent";
import { LOCAL_API_TOKEN_HEADER } from "../src/server/security";
import { REPOSITORY_A3P_FIXTURE } from "./fixtures/a3p-fixtures";

const TEST_LOCAL_API_TOKEN = "test-local-api-token";
const EXCESSIVE_ROUTE_STRING = "x".repeat(1025);

function createTestServer(options: Parameters<typeof createServer>[0]): Express {
  return createServer({
    ...options,
    localApiToken: TEST_LOCAL_API_TOKEN,
  });
}

function localPost(app: Express, apiPath: string) {
  return request(app)
    .post(apiPath)
    .set(LOCAL_API_TOKEN_HEADER, TEST_LOCAL_API_TOKEN);
}

function parseBinaryResponse(
  res: SupertestResponse,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on("end", () => callback(null, Buffer.concat(chunks)));
  res.on("error", callback);
}

function localGet(app: Express, apiPath: string) {
  return request(app)
    .get(apiPath)
    .set(LOCAL_API_TOKEN_HEADER, TEST_LOCAL_API_TOKEN);
}

function decodeBase64Package(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}

function sha256Base64(base64: string): string {
  return createHash("sha256").update(decodeBase64Package(base64)).digest("hex");
}

describe("server API", () => {
  let app: Express;
  let evidenceDir: string;

  beforeEach(() => {
    evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-server-test-"));
    app = createTestServer({
      port: 0,
      evidenceDir,
    });
  });

  afterEach(() => {
    fs.rmSync(evidenceDir, { recursive: true, force: true });
  });

  describe("GET /api/health", () => {
    it("returns running status", async () => {
      const res = await request(app).get("/api/health").expect(200);
      expect(res.body.status).toBe("running");
      expect(res.body.runtime).toBe("alice-web");
      expect(typeof res.body.pid).toBe("number");
    });

    it("sends browser defense-in-depth headers without exposing Express", async () => {
      const res = await request(app).get("/api/health").expect(200);

      expect(res.headers["x-powered-by"]).toBeUndefined();
      expect(res.headers["content-security-policy"]).toBe(
        [
          "default-src 'self'",
          "base-uri 'self'",
          "object-src 'none'",
          "frame-ancestors 'none'",
          "form-action 'self'",
          "img-src 'self' data: blob:",
          "media-src 'self' data: blob:",
          "font-src 'self' data:",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "connect-src 'self' ws: wss:",
          "worker-src 'self' blob:",
        ].join("; "),
      );
      expect(res.headers["cross-origin-opener-policy"]).toBe("same-origin");
      expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
      expect(res.headers["permissions-policy"]).toBe(
        "camera=(), geolocation=(), microphone=()",
      );
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
    });
  });

  describe("local API mutation protection", () => {
    it("rejects mutating requests with a missing token", async () => {
      const protectedApp = createTestServer({
        port: 0,
        evidenceDir: path.join(evidenceDir, "missing-token"),
      });

      const res = await request(protectedApp)
        .post("/api/launch")
        .send({})
        .expect(401);
      expect(res.body.error).toBe("Missing or invalid local API token");
    });

    it("rejects case-variant API mutation paths with a missing token", async () => {
      const protectedApp = createTestServer({
        port: 0,
        evidenceDir: path.join(evidenceDir, "case-variant-missing-token"),
      });

      const res = await request(protectedApp)
        .post("/API/launch")
        .send({})
        .expect(401);
      expect(res.body.error).toBe("Missing or invalid local API token");
    });

    it("rejects mutating requests with an invalid token", async () => {
      const protectedApp = createTestServer({
        port: 0,
        evidenceDir: path.join(evidenceDir, "invalid-token"),
      });

      const res = await request(protectedApp)
        .post("/api/launch")
        .set(LOCAL_API_TOKEN_HEADER, "wrong-token")
        .send({})
        .expect(401);
      expect(res.body.error).toBe("Missing or invalid local API token");
    });

    it("rejects mutating requests from an invalid origin", async () => {
      const protectedApp = createTestServer({
        port: 0,
        evidenceDir: path.join(evidenceDir, "invalid-origin"),
      });

      const res = await localPost(protectedApp, "/api/launch")
        .set("Origin", "http://evil.example")
        .send({})
        .expect(403);
      expect(res.body.error).toBe("Forbidden origin");
    });

    it("rejects mutating requests with a non-local host", async () => {
      const protectedApp = createTestServer({
        port: 0,
        evidenceDir: path.join(evidenceDir, "invalid-host"),
      });

      const res = await localPost(protectedApp, "/api/launch")
        .set("Host", "evil.example")
        .send({})
        .expect(403);
      expect(res.body.error).toBe("Forbidden host");
    });

    it("rejects mutating requests without a JSON content type", async () => {
      const protectedApp = createTestServer({
        port: 0,
        evidenceDir: path.join(evidenceDir, "invalid-content-type"),
      });

      const res = await request(protectedApp)
        .post("/api/launch")
        .set(LOCAL_API_TOKEN_HEADER, TEST_LOCAL_API_TOKEN)
        .type("text/plain")
        .send("{}")
        .expect(415);
      expect(res.body.error).toBe("Content-Type must be application/json");
    });

    it("accepts valid local mutating requests with a token and local origin", async () => {
      const protectedApp = createTestServer({
        port: 0,
        evidenceDir: path.join(evidenceDir, "valid-local"),
      });

      const res = await localPost(protectedApp, "/api/launch")
        .set("Origin", "http://127.0.0.1:3000")
        .send({})
        .expect(200);
      expect(res.body.status).toBe("launched");
    });
  });

  describe("POST /api/launch", () => {
    it("launches with default project", async () => {
      const res = await localPost(app, "/api/launch").send({}).expect(200);
      expect(res.body.status).toBe("launched");
      expect(res.body.sceneObjectCount).toBeGreaterThanOrEqual(2);
    });

    it("resets scene objects on default launch", async () => {
      await localPost(app, "/api/launch").send({}).expect(200);
      await localPost(app, "/api/scene/add-object")
        .send({ className: "org.lgna.story.SBiped", name: "temporaryBunny" })
        .expect(200);

      const relaunched = await localPost(app, "/api/launch").send({}).expect(200);

      expect(relaunched.body).toMatchObject({
        status: "launched",
        project: null,
        sceneObjectCount: 2,
      });
    });

    it("uses the requested .a3p filename when the parsed project name is generic", async () => {
      const fixtureApp = createTestServer({
        port: 0,
        evidenceDir: path.join(evidenceDir, "fixture-launch"),
        projectPath: REPOSITORY_A3P_FIXTURE,
      });

      const res = await localPost(fixtureApp, "/api/launch").send({}).expect(200);

      expect(res.body.status).toBe("launched");
      expect(res.body.projectName).toBe("sanitized-scene");
    });
  });

  describe("runtime parity evidence APIs", () => {
    it("requires the local API token for runtime parity reads", async () => {
      const unconfiguredApp = createServer({
        port: 0,
        evidenceDir: path.join(evidenceDir, "no-runtime-token"),
      });
      for (const endpoint of [
        "/api/vr/camera-comfort",
        "/api/accessibility/rescue-camera-captions",
        "/api/review/gallery-walk-rubric",
        "/api/review/runtime-parity",
      ]) {
        await request(app).get(endpoint).expect(401);
        await request(app)
          .get(endpoint)
          .set(LOCAL_API_TOKEN_HEADER, "wrong-token")
          .expect(401);
        await request(unconfiguredApp).get(endpoint).expect(401);
        await localGet(app, endpoint).expect(200);
      }
    });

    it("reports camera comfort evidence without claiming true headset VR", async () => {
      const res = await localGet(app, "/api/vr/camera-comfort").expect(200);

      expect(res.body.schema_version).toBe("alice.camera-vr-comfort-evidence/v1");
      expect(res.body.status).toBe("partial");
      expect(res.body.desktopCameraAvailable).toBe(true);
      expect(res.body.keyboardMovementAvailable).toBe("unknown");
      expect(res.body.reducedMotionRespected).toBe("unknown");
      expect(res.body.trueHeadsetVrSupported).toBe(false);
      expect(res.body.nativeVrSupported).toBe(false);
      expect(res.body.unsupportedReason).toContain("true headset/native VR remains unsupported");
    });

    it("reports accessibility rescue camera captions for current scene review", async () => {
      await localPost(app, "/api/scene/add-object")
        .send({ className: "org.lgna.story.SBiped", name: "guide" })
        .expect(200);

      const res = await request(app)
        .get("/api/accessibility/rescue-camera-captions")
        .set(LOCAL_API_TOKEN_HEADER, TEST_LOCAL_API_TOKEN)
        .expect(200);

      expect(res.body.schema_version).toBe("alice.accessibility-rescue-camera-captions/v1");
      expect(res.body.status).toBe("partial");
      expect(res.body.cameraCaption).toContain("Camera");
      expect(res.body.objectCaption).toContain("guide");
      expect(res.body.keyboardReviewAvailable).toBe("unknown");
      expect(res.body.highContrastReviewAvailable).toBe("unknown");
      expect(res.body.captionChecks.map((check: { id: string }) => check.id)).toEqual(
        expect.arrayContaining(["aria-live-status", "camera-caption", "scene-object-caption"]),
      );
    });

    it("reports gallery walk rubric evidence while live studio remains unsupported", async () => {
      await localPost(app, "/api/scene/add-object")
        .send({ className: "org.lgna.story.SProp", name: "checkpoint" })
        .expect(200);

      const res = await request(app)
        .get("/api/review/gallery-walk-rubric")
        .set(LOCAL_API_TOKEN_HEADER, TEST_LOCAL_API_TOKEN)
        .expect(200);

      expect(res.body.schema_version).toBe("alice.gallery-walk-rubric-evidence/v1");
      expect(res.body.reviewWorkflowSupported).toBe(false);
      expect(res.body.rubricRecordingSupported).toBe(false);
      expect(res.body.liveStudioSupported).toBe(false);
      expect(res.body.galleryItems.map((item: { title: string }) => item.title)).toContain("checkpoint");
    });

    it("bundles the runtime parity evidence sections", async () => {
      const res = await localGet(app, "/api/review/runtime-parity").expect(200);

      expect(res.body.cameraVrComfort.schema_version).toBe("alice.camera-vr-comfort-evidence/v1");
      expect(res.body.accessibilityRescueCaptions.schema_version).toBe("alice.accessibility-rescue-camera-captions/v1");
      expect(res.body.galleryWalkRubric.schema_version).toBe("alice.gallery-walk-rubric-evidence/v1");
    });
  });

  describe("request body parsing", () => {
    it("rejects malformed JSON bodies with a client error", async () => {
      await localPost(app, "/api/project/new")
        .set("Content-Type", "application/json")
        .send("{")
        .expect(400);
    });

    it("rejects non-JSON request bodies before route defaults run", async () => {
      const res = await localPost(app, "/api/project/new")
        .set("Content-Type", "text/plain")
        .send("not json")
        .expect(415);
      expect(res.body.error).toBe("Content-Type must be application/json");
    });
  });

  describe("POST /api/scene/add-object", () => {
    it("adds object and writes evidence", async () => {
      const res = await localPost(app, "/api/scene/add-object")
        .send({
          className: "org.lgna.story.SBiped",
          name: "bunny",
        })
        .expect(200);

      expect(res.body.status).toBe("added");
      expect(res.body.className).toBe("org.lgna.story.SBiped");
      expect(res.body.sceneFieldCountAfter).toBeGreaterThan(0);

      // Verify evidence artifact was written
      const artifactPath = path.join(
        evidenceDir,
        "scene-object-added.json",
      );
      expect(fs.existsSync(artifactPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
      expect(content.schema_version).toBe("eatme.alice-scene-object-added/v1");
    });

    it("rejects missing className", async () => {
      await localPost(app, "/api/scene/add-object")
        .send({})
        .expect(400);
    });

    it("rejects malformed object fields", async () => {
      await localPost(app, "/api/scene/add-object")
        .send({ className: 123 })
        .expect(400);

      await localPost(app, "/api/scene/add-object")
        .send({ className: "" })
        .expect(400);

      await localPost(app, "/api/scene/add-object")
        .send({
          className: "org.lgna.story.SBiped",
          name: EXCESSIVE_ROUTE_STRING,
        })
        .expect(400);
    });

    it("attaches imported model resources to newly added scene objects", async () => {
      await localPost(app, "/api/launch").send({}).expect(200);
      const imported = await localPost(app, "/api/assets/import-model")
        .send({
          fileName: "moon-rover.glb",
          contentBase64: Buffer.from([1, 2, 3, 4]).toString("base64"),
        })
        .expect(200);
      const modelResourceId = imported.body.asset.id;

      const added = await localPost(app, "/api/scene/add-object")
        .send({
          className: "org.lgna.story.SProp",
          name: "moonRover",
          modelResourceId,
        })
        .expect(200);
      expect(added.body.modelResourceId).toBe(modelResourceId);

      const save = await localPost(app, "/api/project/save")
        .send({})
        .expect(200);
      const savedProject = await parseA3P(fs.readFileSync(path.join(evidenceDir, "project-save", "saved-project.a3p")));
      expect(save.body.status).toBe("saved");
      expect(savedProject.sceneObjects.find((object) => object.name === "moonRover")?.modelResourceId)
        .toBe(modelResourceId);

      await localPost(app, "/api/scene/add-object")
        .send({
          className: "org.lgna.story.SProp",
          name: "badModel",
          modelResourceId: "project/models/missing.glb",
        })
        .expect(400);

      await localPost(app, "/api/launch").send({}).expect(200);
      const freshExport = await localPost(app, "/api/project/export/web-package")
        .send({ title: "Fresh Launch" })
        .expect(200);
      const freshZip = await JSZip.loadAsync(decodeBase64Package(freshExport.body.package.base64));
      const freshProject = JSON.parse(await freshZip.file("project/project.json")!.async("string"));
      expect(JSON.stringify(freshProject)).not.toContain(modelResourceId);
      expect(freshZip.file("resources/models/moon-rover.glb")).toBeNull();
    });

    it("persists applied texture assignments through save and web package export", async () => {
      await localPost(app, "/api/launch").send({}).expect(200);
      await localPost(app, "/api/scene/add-object")
        .send({
          className: "org.lgna.story.SBiped",
          name: "bunny",
        })
        .expect(200);
      const importedTexture = await localPost(app, "/api/assets/import-texture")
        .send({
          fileName: "moon-rock.png",
          contentBase64: Buffer.from([137, 80, 78, 71]).toString("base64"),
        })
        .expect(200);

      const applied = await localPost(app, "/api/scene/apply-texture")
        .send({
          objectName: "bunny",
          textureResourceId: importedTexture.body.asset.id,
        })
        .expect(200);
      expect(applied.body.materialBindings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          target: "surface",
          textureResourceId: importedTexture.body.asset.id,
        }),
      ]));

      await localPost(app, "/api/project/save").send({}).expect(200);
      const savedProject = await parseA3P(fs.readFileSync(path.join(evidenceDir, "project-save", "saved-project.a3p")));
      expect(savedProject.textureAssignments).toEqual([
        { objectName: "bunny", texturePath: importedTexture.body.asset.resourcePath },
      ]);

      const exportRes = await localPost(app, "/api/project/export/web-package")
        .send({ title: "Texture Assignment" })
        .expect(200);
      const zip = await JSZip.loadAsync(decodeBase64Package(exportRes.body.package.base64));
      const projectJson = JSON.parse(await zip.file("project/project.json")!.async("string"));
      expect(projectJson.textureAssignments).toEqual([
        { objectName: "bunny", texturePath: importedTexture.body.asset.resourcePath },
      ]);

      await localPost(app, "/api/project/new")
        .send({ templateId: "blank", projectName: "Fresh Project" })
        .expect(200);
      const freshExport = await localPost(app, "/api/project/export/web-package")
        .send({ title: "Fresh Project" })
        .expect(200);
      const freshZip = await JSZip.loadAsync(decodeBase64Package(freshExport.body.package.base64));
      expect(freshZip.file(importedTexture.body.asset.resourcePath)).toBeNull();
      expect(await freshZip.file("index.html")!.async("string")).not.toContain(importedTexture.body.asset.resourcePath);
    });

    it("exports the archive supplied by the browser instead of stale server state", async () => {
      await localPost(app, "/api/launch").send({}).expect(200);
      const project = createMinimalProject();
      project.projectName = "Browser Archive";
      project.cameraWorkflow = {
        camera: {
          mode: "first-person",
          position: { x: 1, y: 2, z: 3 },
          target: { x: 0, y: 1, z: 0 },
          up: { x: 0, y: 1, z: 0 },
          yawDegrees: 0,
          pitchDegrees: 0,
          rollDegrees: 0,
          fieldOfViewDegrees: 55,
          activePreset: null,
        },
        markers: [],
        activeMarkerId: null,
      };
      project.jointState = {
        schema_version: "alice.joint-state/v1",
        runtime: "alice-web",
        objects: {
          browserRobot: {
            className: "org.lgna.story.SProp",
            joints: {},
            jointArrays: {},
            poses: { wave: {} },
            pendingAnimations: [],
          },
        },
      };
      project.importedAssets = [
        {
          id: "project/models/browser-robot.glb",
          kind: "model",
          name: "Browser Robot",
          fileName: "browser-robot.glb",
          resourcePath: "resources/models/browser-robot.glb",
          contentType: "model/gltf-binary",
          byteLength: 4,
        },
      ];
      project.sceneObjects.push({
        name: "browserRobot",
        typeName: "org.lgna.story.SProp",
        resourceType: null,
        position: null,
        orientation: null,
        size: null,
        modelResourceId: "project/models/browser-robot.glb",
      });
      const archive: AliceProjectArchive = {
        project,
        manifest: null,
        resources: new Map([["resources/models/browser-robot.glb", new Uint8Array([1, 2, 3, 4])]]),
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

      const exportRes = await localPost(app, "/api/project/export/web-package")
        .send({
          title: "Browser Archive",
          archiveBase64: Buffer.from(await writeProject(archive, { generateThumbnailFromScene: false })).toString("base64"),
        })
        .expect(200);
      const zip = await JSZip.loadAsync(decodeBase64Package(exportRes.body.package.base64));
      const projectJson = JSON.parse(await zip.file("project/project.json")!.async("string"));

      expect(projectJson.projectName).toBe("Browser Archive");
      expect(projectJson.cameraWorkflow.camera.mode).toBe("first-person");
      expect(projectJson.jointState.objects.browserRobot.className).toBe("org.lgna.story.SProp");
      expect(projectJson.sceneObjects).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "browserRobot", modelResourceId: "project/models/browser-robot.glb" }),
      ]));
      expect(await zip.file("resources/models/browser-robot.glb")?.async("uint8array"))
        .toEqual(new Uint8Array([1, 2, 3, 4]));

      const invalidArchive = await localPost(app, "/api/project/export/web-package")
        .send({ title: "Bad Archive", archiveBase64: Buffer.from("not a zip").toString("base64") })
        .expect(400);
      expect(invalidArchive.body).toEqual(expect.objectContaining({
        code: "corrupted-archive",
      }));

      const invalidArchiveBase64 = await localPost(app, "/api/project/export/web-package")
        .send({ title: "Invalid Base64", archiveBase64: "not base64!!" })
        .expect(400);
      expect(invalidArchiveBase64.body.error).toMatch(/archiveBase64 must be valid base64/);

      const tooManyEntries = new JSZip();
      for (let index = 0; index < 4097; index += 1) {
        tooManyEntries.file(`entry-${index}.txt`, "");
      }
      const limitedArchive = await tooManyEntries.generateAsync({ type: "uint8array" });
      const archiveLimit = await localPost(app, "/api/project/export/web-package")
        .send({ title: "Too Many Entries", archiveBase64: Buffer.from(limitedArchive).toString("base64") })
        .expect(400);
      expect(archiveLimit.body).toEqual(expect.objectContaining({
        code: "archive-limit",
      }));
    });

    it("clears stale audio metadata and resources when creating a replacement project", async () => {
      await localPost(app, "/api/launch").send({}).expect(200);
      await localPost(app, "/api/audio/assets")
        .send({
          fileName: "theme.mp3",
          dataBase64: Buffer.from([1, 2, 3, 4]).toString("base64"),
          durationSeconds: 1,
        })
        .expect(200);
      await localPost(app, "/api/audio/resources")
        .send({
          id: "project-audio-theme",
          name: "Theme",
          path: "resources/audio/theme.mp3",
          format: "mp3",
          bytesBase64: Buffer.from([1, 2, 3, 4]).toString("base64"),
          duration: 1,
        })
        .expect(200);

      await localPost(app, "/api/project/new")
        .send({ templateId: "blank", projectName: "Fresh Audio Free Project" })
        .expect(200);

      const audioState = await request(app)
        .get("/api/audio/state")
        .set(LOCAL_API_TOKEN_HEADER, TEST_LOCAL_API_TOKEN)
        .expect(200);
      expect(audioState.body.assets).toEqual([]);
      expect(audioState.body.audio.resources).toEqual([]);

      await localPost(app, "/api/project/save").send({}).expect(200);
      const savedBytes = fs.readFileSync(path.join(evidenceDir, "project-save", "saved-project.a3p"));
      const savedArchive = await readProject(savedBytes);
      expect(savedArchive.aliceAudio).toBeUndefined();
      expect(savedArchive.resources.has("resources/audio/theme.mp3")).toBe(false);
    });
  });

  describe("POST /api/code/edit-procedure", () => {
    it("edits procedure and writes proof artifacts", async () => {
      const res = await localPost(app, "/api/code/edit-procedure")
        .send({
          procedureSelector: "scene.myFirstMethod",
          editSpec: "append-comment:eatme first lesson edit proof",
        })
        .expect(200);

      expect(res.body.schema_version).toBe(
        "eatme.alice-first-lesson-code-editor-action-proof-result/v1",
      );
      expect(res.body.status).toBe("proved");
      expect(res.body.procedure_selector).toBe("scene.myFirstMethod");
      expect(res.body.edited_project_artifact).toBe("edited-project.a3p");

      // Verify proof artifact was written
      const proofPath = path.join(
        evidenceDir,
        "first-lesson-code-editor-action-proof.json",
      );
      expect(fs.existsSync(proofPath)).toBe(true);
      const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
      expect(proof.schema_version).toBe(
        "eatme.alice-first-lesson-code-editor-action-proof/v1",
      );
      expect(proof.status).toBe("proved");
      expect(proof.success).toBe(true);

      // Verify edited project was written
      const editedPath = path.join(evidenceDir, "edited-project.a3p");
      expect(fs.existsSync(editedPath)).toBe(true);
      const editedBytes = fs.readFileSync(editedPath);
      expect(editedBytes.toString("utf-8")).not.toContain("placeholder-source-marker");
      const editedProject = await parseA3P(editedBytes);
      expect(editedProject.methods.map((method) => method.name)).toContain("myFirstMethod");
    });

    it("rejects malformed edit fields", async () => {
      await localPost(app, "/api/code/edit-procedure")
        .send({
          procedureSelector: 123,
          editSpec: "append-comment:bad selector",
        })
        .expect(400);

      await localPost(app, "/api/code/edit-procedure")
        .send({
          procedureSelector: "scene.myFirstMethod",
          editSpec: "",
        })
        .expect(400);

      await localPost(app, "/api/code/edit-procedure")
        .send({
          procedureSelector: "scene.myFirstMethod",
          editSpec: EXCESSIVE_ROUTE_STRING,
        })
        .expect(400);
    });
  });

  describe("POST /api/code/create-procedure", () => {
    it("accepts valid parameter fields", async () => {
      const res = await localPost(app, "/api/code/create-procedure")
        .send({
          name: "validParameterFields",
          parameters: [
            { name: "speed", type: "DecimalNumber", defaultValue: "1.0" },
          ],
        })
        .expect(200);

      expect(res.body.parameters).toEqual([
        { name: "speed", type: "DecimalNumber", defaultValue: "1.0" },
      ]);
    });

    it("rejects malformed parameter fields", async () => {
      await localPost(app, "/api/code/create-procedure")
        .send({
          name: "badParameterContainer",
          parameters: { name: "speed" },
        })
        .expect(400);

      await localPost(app, "/api/code/create-procedure")
        .send({
          name: "badParameterName",
          parameters: [{ name: "" }],
        })
        .expect(400);

      await localPost(app, "/api/code/create-procedure")
        .send({
          name: "badParameterDefault",
          parameters: [{ name: "speed", defaultValue: EXCESSIVE_ROUTE_STRING }],
        })
        .expect(400);
    });
  });

  describe("POST /api/code/create-function", () => {
    it("rejects malformed function parameter fields", async () => {
      await localPost(app, "/api/code/create-function")
        .send({
          name: "badFunctionParameter",
          returnType: "DecimalNumber",
          parameters: [{ name: "distance", type: { nested: true } }],
        })
        .expect(400);
    });
  });

  describe("POST /api/project/save", () => {
    it("saves project and writes proof artifacts", async () => {
      const res = await localPost(app, "/api/project/save")
        .send({ saveSelector: "scene.myFirstMethod" })
        .expect(200);

      expect(res.body.schema_version).toBe(
        "eatme.alice-project-save-result/v1",
      );
      expect(res.body.status).toBe("saved");
      expect(res.body.save_selector).toBe("scene.myFirstMethod");
      expect(res.body.saved_project_artifact).toBeTruthy();
      expect(res.body.save_artifact).toBeTruthy();
    });

    it("writes a caller-selected .a3p, reopens it, and exports the reopened project", async () => {
      const persistenceDir = path.join(evidenceDir, "persistence");
      const editMarker = "persistedBunnyTurnProof";
      const secondEditMarker = "persistedBunnySecondProof";
      const savedProjectPath = path.join(
        persistenceDir,
        "saved-projects",
        "objects-first-round-trip.a3p",
      );
      const persistenceApp = createTestServer({
        port: 0,
        evidenceDir: persistenceDir,
        allowedProjectDirs: [persistenceDir],
      });

      await localPost(persistenceApp, "/api/launch").send({}).expect(200);
      const addObject = await localPost(persistenceApp, "/api/scene/add-object")
        .send({ className: "org.lgna.story.SBiped", name: "persistedBunny" })
        .expect(200);
      const expectedObjectCount = addObject.body.sceneFieldCountAfter;
      await localPost(persistenceApp, "/api/code/edit-procedure")
        .send({
          procedureSelector: "scene.myFirstMethod",
          editSpec: `append-comment:${editMarker}`,
        })
        .expect(200);

      const save = await localPost(persistenceApp, "/api/project/save")
        .send({
          saveSelector: "scene.myFirstMethod",
          targetPath: savedProjectPath,
        })
        .expect(200);
      expect(save.body.status).toBe("saved");
      expect(fs.existsSync(savedProjectPath)).toBe(true);

      const savedBytes = fs.readFileSync(savedProjectPath);
      expect(savedBytes.byteLength).toBeGreaterThan(0);
      const savedProject = await parseA3P(savedBytes);
      expect(savedProject.sceneObjects.map((object) => object.name)).toContain("persistedBunny");
      const savedMethod = savedProject.methods.find((method) => method.name === "myFirstMethod");
      expect(savedMethod?.statements.map((statement) => statement.method)).toContain(editMarker);

      await localPost(persistenceApp, "/api/launch").send({}).expect(200);
      const reopen = await localPost(persistenceApp, "/api/project/reopen")
        .send({ project: savedProjectPath })
        .expect(200);
      expect(reopen.body.status).toBe("reopened");
      expect(reopen.body.project).toBe(fs.realpathSync(savedProjectPath));
      expect(reopen.body.sceneObjectCount).toBe(expectedObjectCount);
      await localPost(persistenceApp, "/api/code/edit-procedure")
        .send({
          procedureSelector: "scene.myFirstMethod",
          editSpec: `append-comment:${secondEditMarker}`,
        })
        .expect(200);
      await localPost(persistenceApp, "/api/code/edit-procedure")
        .send({
          procedureSelector: "scene.myFirstMethod",
          editSpec: `append-comment:${secondEditMarker}`,
        })
        .expect(200);
      const secondSave = await localPost(persistenceApp, "/api/project/save")
        .send({
          saveSelector: "scene.myFirstMethod",
          targetPath: savedProjectPath,
        })
        .expect(200);
      expect(secondSave.body.status).toBe("saved");
      const resavedProject = await parseA3P(fs.readFileSync(savedProjectPath));
      const resavedMethod = resavedProject.methods.find((method) => method.name === "myFirstMethod");
      const resavedMethods = resavedMethod?.statements.map((statement) => statement.method);
      expect(resavedMethods).toEqual(expect.arrayContaining([editMarker, secondEditMarker]));
      expect(resavedMethods?.filter((method) => method === secondEditMarker)).toHaveLength(2);

      const exportRes = await request(persistenceApp)
        .get("/api/projects/current/export/typescript")
        .buffer(true)
        .parse(parseBinaryResponse)
        .expect(200);
      expect(exportRes.headers["content-type"]).toContain("application/zip");
      expect(exportRes.headers["content-disposition"]).toContain(
        "alice-web-typescript-source.zip",
      );
      const zip = await JSZip.loadAsync(exportRes.body);
      const exportedText = (await Promise.all(
        Object.values(zip.files)
          .filter((entry) => !entry.dir)
          .map((entry) => entry.async("string")),
      )).join("\n");
      expect(exportedText).toContain("persistedBunny");
      expect(exportedText).toContain(editMarker);
      expect(exportedText).toContain(secondEditMarker);
    });

    it("does not duplicate procedure edits when a later object materializes the current project", async () => {
      await localPost(app, "/api/launch").send({}).expect(200);
      const marker = "editBeforeAddMaterializationProof";
      await localPost(app, "/api/code/edit-procedure")
        .send({
          procedureSelector: "scene.myFirstMethod",
          editSpec: `append-comment:${marker}`,
        })
        .expect(200);
      await localPost(app, "/api/scene/add-object")
        .send({ className: "org.lgna.story.SBiped", name: "lateBunny" })
        .expect(200);
      await localPost(app, "/api/project/save").send({}).expect(200);

      const savedProject = await parseA3P(fs.readFileSync(path.join(evidenceDir, "project-save", "saved-project.a3p")));
      const method = savedProject.methods.find((candidate) => candidate.name === "myFirstMethod");
      expect(method?.statements.map((statement) => statement.method).filter((methodName) => methodName === marker))
        .toHaveLength(1);
    });

    it("does not duplicate procedure edits when class behavior import materializes the current project", async () => {
      await localPost(app, "/api/launch").send({}).expect(200);
      const marker = "editBeforeClassImportMaterializationProof";
      const classMarker = "classBehaviorMethodBodyProof";
      await localPost(app, "/api/code/edit-procedure")
        .send({
          procedureSelector: "scene.myFirstMethod",
          editSpec: `append-comment:${marker}`,
        })
        .expect(200);

      await localPost(app, "/api/projects/current/classes/behavior")
        .send({
          package: {
            kind: "alice-web.reusable-class-behavior",
            version: 1,
            exportedBy: "alice-web",
            type: {
              name: "ReusableBehavior",
              superTypeName: "org.lgna.story.SBiped",
              fields: [],
              methods: [
                {
                  name: "myFirstMethod",
                  isFunction: false,
                  returnType: "void",
                  parameters: [],
                  statements: [
                    {
                      kind: "MethodCall",
                      object: "this",
                      method: classMarker,
                      arguments: [],
                    },
                  ],
                },
              ],
              constructors: [],
            },
            evidence: ["test-class-behavior-package"],
          },
        })
        .expect(200);

      await localPost(app, "/api/code/create-procedure")
        .send({ name: "myFirstMethod" })
        .expect(400);
      await localPost(app, "/api/project/save").send({}).expect(200);
      const savedProjectPath = path.join(evidenceDir, "project-save", "saved-project.a3p");
      const savedProject = await parseA3P(fs.readFileSync(savedProjectPath));
      const sceneType = savedProject.types?.find((type) => type.superTypeName?.includes("SScene"));
      const sceneMethod = sceneType?.methods?.find((candidate) => candidate.name === "myFirstMethod");
      expect(sceneMethod?.statements.map((statement) => statement.method).filter((methodName) => methodName === marker))
        .toHaveLength(1);
      const importedType = savedProject.types?.find((type) => type.name === "ReusableBehavior");
      const importedMethod = importedType?.methods?.find((candidate) => candidate.name === "myFirstMethod");
      expect(importedMethod?.statements.map((statement) => statement.method)).toContain(classMarker);
      expect(importedMethod?.statements.map((statement) => statement.method)).not.toContain(marker);
      const exportRes = await request(app)
        .get("/api/projects/current/export/typescript")
        .buffer(true)
        .parse(parseBinaryResponse)
        .expect(200);
      const zip = await JSZip.loadAsync(exportRes.body);
      const exportedText = (await Promise.all(
        Object.values(zip.files)
          .filter((entry) => !entry.dir)
          .map((entry) => entry.async("string")),
      )).join("\n");
      expect(exportedText).toContain(marker);

      const persistenceApp = createTestServer({
        port: 0,
        evidenceDir,
        allowedProjectDirs: [evidenceDir],
      });
      await localPost(persistenceApp, "/api/project/reopen")
        .send({ project: savedProjectPath })
        .expect(200);
      await localPost(persistenceApp, "/api/project/save").send({}).expect(200);
      const resavedProject = await parseA3P(fs.readFileSync(savedProjectPath));
      const resavedSceneType = resavedProject.types?.find((type) => type.superTypeName?.includes("SScene"));
      const resavedSceneMethod = resavedSceneType?.methods?.find((candidate) => candidate.name === "myFirstMethod");
      expect(resavedSceneMethod?.statements.map((statement) => statement.method).filter((methodName) => methodName === marker))
        .toHaveLength(1);
      const resavedImportedType = resavedProject.types?.find((type) => type.name === "ReusableBehavior");
      const resavedImportedMethod = resavedImportedType?.methods?.find((candidate) => candidate.name === "myFirstMethod");
      expect(resavedImportedMethod?.statements.map((statement) => statement.method)).toContain(classMarker);
      expect(resavedImportedMethod?.statements.map((statement) => statement.method)).not.toContain(marker);
    });

    it("preserves intentional repeated edits after materialization", async () => {
      await localPost(app, "/api/launch").send({}).expect(200);
      const marker = "intentionalRepeatedEditProof";
      await localPost(app, "/api/code/edit-procedure")
        .send({ procedureSelector: "scene.myFirstMethod", editSpec: `append-comment:${marker}` })
        .expect(200);
      await localPost(app, "/api/scene/add-object")
        .send({ className: "org.lgna.story.SBiped", name: "lateBunny" })
        .expect(200);
      await localPost(app, "/api/code/edit-procedure")
        .send({ procedureSelector: "scene.myFirstMethod", editSpec: `append-comment:${marker}` })
        .expect(200);
      await localPost(app, "/api/project/save").send({}).expect(200);

      const savedProject = await parseA3P(fs.readFileSync(path.join(evidenceDir, "project-save", "saved-project.a3p")));
      const method = savedProject.methods.find((candidate) => candidate.name === "myFirstMethod");
      expect(method?.statements.map((statement) => statement.method).filter((methodName) => methodName === marker))
        .toHaveLength(2);
    });

    it("rejects malformed save fields", async () => {
      await localPost(app, "/api/project/save")
        .send({ saveSelector: 123 })
        .expect(400);

      await localPost(app, "/api/project/save")
        .send({ targetPath: "" })
        .expect(400);

      await localPost(app, "/api/project/save")
        .send({ targetPath: EXCESSIVE_ROUTE_STRING })
        .expect(400);
    });

    it("rejects save and reopen paths outside allowed project directories", async () => {
      const restrictedDir = path.join(evidenceDir, "restricted");
      const restrictedApp = createTestServer({
        port: 0,
        evidenceDir: restrictedDir,
        allowedProjectDirs: [restrictedDir],
      });
      const outsidePath = path.join(evidenceDir, "outside-save.a3p");

      await localPost(restrictedApp, "/api/project/save")
        .send({ targetPath: outsidePath })
        .expect(400);

      await localPost(restrictedApp, "/api/project/reopen")
        .send({ project: outsidePath })
        .expect(400);
    });
  });

  describe("web package export/share/validate API parity", () => {
    it("exports, validates, and shares one runnable alice-web package with linked artifacts", async () => {
      await localPost(app, "/api/project/new")
        .send({ templateId: "blank", projectName: "WinterStory" })
        .expect(200);

      const exportRes = await localPost(app, "/api/project/export/web-package")
        .send({
          title: "Winter Story",
          description: "A snow scene with a bunny.",
          canonicalUrl: "https://example.edu",
          teacher: {
            audience: "Middle school",
            lessonFocus: "Winter story sharing",
            remix: "with-attribution",
            attribution: "Alice Teacher",
            tags: ["winter", "story"],
            standards: ["CSTA 2-AP-10"],
          },
        })
        .expect(200);

      expect(exportRes.body).toMatchObject({
        schema_version: "alice-web.export-web-package-result/v1",
        status: "exported",
        runtime: "alice-web",
        package: {
          mimeType: "application/zip",
        },
        manifest: {
          schemaVersion: "alice-web.package/v1",
          product: "Alice",
          packageName: "alice-web",
          runtimeIdentity: "alice-web-player",
          entrypoint: "index.html",
        },
        artifacts: {
          entrypoint: "index.html",
          manifest: "manifest.json",
          share: "share.json",
          preview: "preview.png",
          project: "project/project.json",
          validation: "validation.json",
        },
        validation: {
          valid: true,
          errors: [],
        },
      });
      expect(exportRes.body.package.filename).toMatch(/\.alice-web\.zip$/);
      expect(exportRes.body.package.base64).toEqual(expect.any(String));
      expect(exportRes.body.package.sizeBytes).toBeGreaterThan(0);
      expect(exportRes.body.package.sha256).toBe(sha256Base64(exportRes.body.package.base64));

      const zip = await JSZip.loadAsync(decodeBase64Package(exportRes.body.package.base64));
      expect(Object.keys(zip.files)).toEqual(expect.arrayContaining([
        "index.html",
        "manifest.json",
        "share.json",
        "preview.png",
        "project/project.json",
        "validation.json",
      ]));
      const html = await zip.file("index.html")?.async("string");
      expect(html).toContain("window.AlicePlayer");
      expect(html).toContain("alice-web-player");
      expect(html).not.toMatch(/LookingGlass|lookingglass|alice-standalone-player/);

      const validationRes = await localPost(app, "/api/project/validate-web-package")
        .send({ packageBase64: exportRes.body.package.base64 })
        .expect(200);
      expect(validationRes.body).toMatchObject({
        schema_version: "alice-web.validate-web-package-result/v1",
        status: "valid",
        valid: true,
        runtime: "alice-web",
        package: {
          filename: exportRes.body.package.filename,
          mimeType: "application/zip",
          sizeBytes: exportRes.body.package.sizeBytes,
          sha256: exportRes.body.package.sha256,
        },
        manifest: {
          schemaVersion: "alice-web.package/v1",
          runtimeIdentity: "alice-web-player",
          entrypoint: "index.html",
        },
        errors: [],
      });
      expect(validationRes.body.evidence).toEqual(expect.arrayContaining([
        "base64-decodes",
        "zip-readable",
        "required-files-present",
        "safe-zip-paths",
        "alice-web-identity",
        "entrypoint-playable",
        "teacher-share-metadata",
      ]));

      const shareRes = await localPost(app, "/api/project/share")
        .send({
          packageBase64: exportRes.body.package.base64,
          title: "Shared Winter Story",
          description: "Shared package description.",
          canonicalUrl: "https://example.edu",
          teacher: {
            audience: "After-school club",
            lessonFocus: "Community remix",
            remix: "allowed",
            tags: ["gallery"],
            standards: ["CSTA 2-CS-01"],
          },
        })
        .expect(200);
      expect(shareRes.body).toMatchObject({
        schema_version: "alice-web.share-artifacts-result/v1",
        status: "shared",
        runtime: "alice-web",
        share: {
          schemaVersion: "alice-web.share/v1",
          product: "Alice",
          runtimeIdentity: "alice-web-player",
          title: "Shared Winter Story",
          description: "Shared package description.",
          canonicalUrl: "https://example.edu",
          package: {
            filename: exportRes.body.package.filename,
            mimeType: "application/zip",
            sizeBytes: exportRes.body.package.sizeBytes,
            sha256: exportRes.body.package.sha256,
          },
          links: {
            html: "index.html",
            package: exportRes.body.package.filename,
            preview: "preview.png",
          },
          teacher: {
            schemaVersion: "alice-web.teacher-share/v1",
            audience: "After-school club",
            lessonFocus: "Community remix",
            remix: "allowed",
            tags: ["gallery"],
            standards: ["CSTA 2-CS-01"],
          },
        },
        artifacts: {
          share: "share.json",
          preview: "preview.png",
          entrypoint: "index.html",
          package: exportRes.body.package.filename,
        },
        validation: {
          valid: true,
          errors: [],
        },
      });
    });

    it("returns explicit API errors for malformed web-package requests", async () => {
      await localPost(app, "/api/project/export/web-package")
        .send({ canonicalUrl: "javascript:alert(1)" })
        .expect(400);
      await localPost(app, "/api/project/export/web-package")
        .send({ canonicalUrl: "https://example.edu\n.evil/path" })
        .expect(400);
      for (const canonicalUrl of ["http:example.com", "http:///example.com", "https:\\\\example.edu\\alice"]) {
        await localPost(app, "/api/project/export/web-package")
          .send({ canonicalUrl })
          .expect(400);
      }
      await localPost(app, "/api/project/export/web-package")
        .send({ canonicalUrl: "https://user:pass@example.edu/alice/project" })
        .expect(400);
      await localPost(app, "/api/project/share")
        .send({
          packageBase64: "UEsDBAo=",
          canonicalUrl: "https://user:pass@example.edu/alice/project",
        })
        .expect(400);

      const malformedTeacher = await localPost(app, "/api/project/export/web-package")
        .send({ teacher: { audience: 42 } })
        .expect(400);
      expect(malformedTeacher.body.error).toMatch(/teacher\.audience/i);

      const invalidValidation = await localPost(app, "/api/project/validate-web-package")
        .send({ packageBase64: "not base64!!" })
        .expect(400);
      expect(invalidValidation.body).toMatchObject({
        schema_version: "alice-web.validate-web-package-result/v1",
        status: "invalid",
        valid: false,
        errors: [expect.objectContaining({ code: "invalid-base64" })],
      });

      const missingPackage = await localPost(app, "/api/project/share")
        .send({ title: "Missing package" })
        .expect(400);
      expect(missingPackage.body.error).toMatch(/packageBase64/i);
    });
  });

  describe("POST /api/world/run", () => {
    it("runs world and writes evidence", async () => {
      // Launch first
      await localPost(app, "/api/launch").send({});

      const res = await localPost(app, "/api/world/run")
        .send({})
        .expect(200);

      expect(res.body.schema_version).toBe(
        "eatme.alice-run-world-result/v1",
      );
      expect(res.body.status).toBe("completed");
      expect(typeof res.body.run_duration_ms).toBe("number");

      const evidencePath = path.join(evidenceDir, "run-world-result.json");
      expect(fs.existsSync(evidencePath)).toBe(true);
      const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf-8"));
      expect(evidence.status).toBe("completed");
    });

    it("rejects run before launch", async () => {
      const freshApp = createTestServer({
        port: 0,
        evidenceDir: path.join(evidenceDir, "fresh-run-before-launch"),
      });
      await localPost(freshApp, "/api/world/run").send({}).expect(400);
    });

    it("rejects corrupt requested projects before world run", async () => {
      const corruptProjectPath = path.join(evidenceDir, "corrupt.a3p");
      fs.writeFileSync(corruptProjectPath, Buffer.from("not a zip"));
      const freshApp = createTestServer({
        port: 0,
        evidenceDir,
        allowedProjectDirs: [evidenceDir],
      });
      await localPost(freshApp, "/api/launch")
        .send({ project: corruptProjectPath })
        .expect(400);

      const res = await localPost(freshApp, "/api/world/run")
        .send({})
        .expect(400);

      expect(res.body).toEqual({
        error: "Not launched. Call POST /api/launch first.",
      });
    });
  });

  describe("GET /api/project/templates", () => {
    it("returns available templates", async () => {
      const res = await request(app).get("/api/project/templates").expect(200);
      expect(res.body.templates).toBeInstanceOf(Array);
      expect(res.body.templates.length).toBeGreaterThan(0);
      const blank = res.body.templates.find(
        (t: { id: string }) => t.id === "blank",
      );
      expect(blank).toBeDefined();
      expect(blank.name).toBeTruthy();
      expect(blank.description).toBeTruthy();
    });
  });

  describe("POST /api/project/new", () => {
    it("creates a new project from blank template", async () => {
      const res = await localPost(app, "/api/project/new")
        .send({ templateId: "blank", projectName: "TestProject" })
        .expect(200);

      expect(res.body.schema_version).toBe(
        "eatme.alice-project-new-result/v1",
      );
      expect(res.body.status).toBe("created");
      expect(res.body.templateId).toBe("blank");
      expect(res.body.projectName).toBe("TestProject");
      expect(res.body.a3pSizeBytes).toBeGreaterThan(0);
      expect(fs.existsSync(res.body.projectPath)).toBe(true);
    });

    it("creates a project with default template when none specified", async () => {
      const res = await localPost(app, "/api/project/new")
        .send({ projectName: "DefaultTemplate" })
        .expect(200);

      expect(res.body.status).toBe("created");
      expect(res.body.templateId).toBe("blank");
    });

    it("rejects unknown template", async () => {
      const res = await localPost(app, "/api/project/new")
        .send({ templateId: "nonexistent" })
        .expect(400);

      expect(res.body.error).toContain("nonexistent");
      expect(res.body.availableTemplates).toBeInstanceOf(Array);
    });

    it("rejects malformed template fields", async () => {
      await localPost(app, "/api/project/new")
        .send({ templateId: 123 })
        .expect(400);

      await localPost(app, "/api/project/new")
        .send({ projectName: "" })
        .expect(400);

      await localPost(app, "/api/project/new")
        .send({ projectName: EXCESSIVE_ROUTE_STRING })
        .expect(400);
    });
  });

  describe("POST /api/screenshot", () => {
    it("returns screenshot info", async () => {
      const res = await localPost(app, "/api/screenshot").send({}).expect(200);
      expect(res.body.status).toBe("captured");
      expect(res.body.path).toContain("screenshot.png");
      expect(res.body.rendered).toBe(true);
      expect(res.body.placeholder).toBeUndefined();

      const screenshotPath = path.join(evidenceDir, "screenshot.png");
      expect(fs.existsSync(screenshotPath)).toBe(true);
    });

    it("does not write screenshots on GET", async () => {
      const screenshotEvidenceDir = path.join(evidenceDir, "get-screenshot");
      const protectedApp = createTestServer({
        port: 0,
        evidenceDir: screenshotEvidenceDir,
      });

      await request(protectedApp).get("/api/screenshot").expect(404);
      expect(fs.existsSync(path.join(screenshotEvidenceDir, "screenshot.png"))).toBe(false);
    });
  });

  describe("createServer state isolation", () => {
    it("keeps mutable project state scoped to each server instance", async () => {
      const firstApp = createTestServer({
        port: 0,
        evidenceDir: path.join(evidenceDir, "isolated-first"),
      });
      const secondApp = createTestServer({
        port: 0,
        evidenceDir: path.join(evidenceDir, "isolated-second"),
      });

      await localPost(firstApp, "/api/launch").send({}).expect(200);
      const firstAdd = await localPost(firstApp, "/api/scene/add-object")
        .send({ className: "org.lgna.story.SBiped", name: "bunny" })
        .expect(200);
      const secondHealth = await request(secondApp).get("/api/health").expect(200);
      const secondLaunch = await localPost(secondApp, "/api/launch").send({}).expect(200);

      expect(firstAdd.body.sceneFieldCountAfter).toBe(3);
      expect(secondHealth.body.launched).toBe(false);
      expect(secondLaunch.body.sceneObjectCount).toBe(2);
    });
  });
});
