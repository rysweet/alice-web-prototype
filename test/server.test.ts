import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseA3P } from "../src/a3p-parser";
import { createServer } from "../src/server";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Express } from "express";
import request from "supertest";
import { LOCAL_API_TOKEN_HEADER } from "../src/server/security";

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
      expect(res.body.runtime).toBe("lookingglass-typescript-web");
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

    it("rejects run when the launched project cannot be parsed", async () => {
      const corruptProjectPath = path.join(evidenceDir, "corrupt.a3p");
      fs.writeFileSync(corruptProjectPath, Buffer.from("not a zip"));
      const freshApp = createTestServer({
        port: 0,
        evidenceDir,
        allowedProjectDirs: [evidenceDir],
      });
      await localPost(freshApp, "/api/launch")
        .send({ project: corruptProjectPath })
        .expect(200);

      const res = await localPost(freshApp, "/api/world/run")
        .send({})
        .expect(400);

      expect(res.body).toEqual({
        error: "Failed to parse .a3p before running the world.",
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
