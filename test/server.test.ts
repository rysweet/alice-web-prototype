import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "../src/server";
import * as fs from "fs";
import * as path from "path";
import type { Express } from "express";
import request from "supertest";

const TEST_EVIDENCE_DIR = path.resolve(__dirname, "../.test-server-evidence");

describe("server API", () => {
  let app: Express;

  beforeAll(() => {
    fs.mkdirSync(TEST_EVIDENCE_DIR, { recursive: true });
    app = createServer({
      port: 0,
      evidenceDir: TEST_EVIDENCE_DIR,
    });
  });

  afterAll(() => {
    fs.rmSync(TEST_EVIDENCE_DIR, { recursive: true, force: true });
  });

  describe("GET /api/health", () => {
    it("returns running status", async () => {
      const res = await request(app).get("/api/health").expect(200);
      expect(res.body.status).toBe("running");
      expect(res.body.runtime).toBe("typescript-web-prototype");
      expect(typeof res.body.pid).toBe("number");
    });
  });

  describe("POST /api/launch", () => {
    it("launches with default project", async () => {
      const res = await request(app).post("/api/launch").send({}).expect(200);
      expect(res.body.status).toBe("launched");
      expect(res.body.sceneObjectCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe("POST /api/scene/add-object", () => {
    it("adds object and writes evidence", async () => {
      const res = await request(app)
        .post("/api/scene/add-object")
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
        TEST_EVIDENCE_DIR,
        "scene-object-added.json",
      );
      expect(fs.existsSync(artifactPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
      expect(content.schema_version).toBe("eatme.alice-scene-object-added/v1");
    });

    it("rejects missing className", async () => {
      await request(app)
        .post("/api/scene/add-object")
        .send({})
        .expect(400);
    });
  });

  describe("POST /api/code/edit-procedure", () => {
    it("edits procedure and writes proof artifacts", async () => {
      const res = await request(app)
        .post("/api/code/edit-procedure")
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
        TEST_EVIDENCE_DIR,
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
      const editedPath = path.join(TEST_EVIDENCE_DIR, "edited-project.a3p");
      expect(fs.existsSync(editedPath)).toBe(true);
      expect(fs.statSync(editedPath).size).toBeGreaterThan(0);
    });
  });

  describe("POST /api/project/save", () => {
    it("saves project and writes proof artifacts", async () => {
      const res = await request(app)
        .post("/api/project/save")
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
  });

  describe("POST /api/world/run", () => {
    it("runs world and writes evidence", async () => {
      // Launch first
      await request(app).post("/api/launch").send({});

      const res = await request(app)
        .post("/api/world/run")
        .send({})
        .expect(200);

      expect(res.body.schema_version).toBe(
        "eatme.alice-run-world-result/v1",
      );
      expect(res.body.status).toBe("completed");
      expect(typeof res.body.run_duration_ms).toBe("number");

      const evidencePath = path.join(TEST_EVIDENCE_DIR, "run-world-result.json");
      expect(fs.existsSync(evidencePath)).toBe(true);
      const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf-8"));
      expect(evidence.status).toBe("completed");
    });

    it("rejects run before launch", async () => {
      // Create fresh server without launching
      const freshApp = createServer({
        port: 0,
        evidenceDir: TEST_EVIDENCE_DIR,
      });
      await request(freshApp).post("/api/world/run").send({}).expect(400);
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
      const res = await request(app)
        .post("/api/project/new")
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
      const res = await request(app)
        .post("/api/project/new")
        .send({ projectName: "DefaultTemplate" })
        .expect(200);

      expect(res.body.status).toBe("created");
      expect(res.body.templateId).toBe("blank");
    });

    it("rejects unknown template", async () => {
      const res = await request(app)
        .post("/api/project/new")
        .send({ templateId: "nonexistent" })
        .expect(400);

      expect(res.body.error).toContain("nonexistent");
      expect(res.body.availableTemplates).toBeInstanceOf(Array);
    });

    it("updates server state after creating a project", async () => {
      await request(app)
        .post("/api/project/new")
        .send({ templateId: "snow", projectName: "StateTest" })
        .expect(200);

      // Health should show launched
      const health = await request(app).get("/api/health").expect(200);
      expect(health.body.launched).toBe(true);

      // World/run should work (proving launched state)
      const run = await request(app).post("/api/world/run").send({}).expect(200);
      expect(run.body.status).toBe("completed");
      expect(run.body.scene_object_count).toBeGreaterThanOrEqual(2);
    });

    it("sanitizes project name to prevent path traversal", async () => {
      const res = await request(app)
        .post("/api/project/new")
        .send({ templateId: "blank", projectName: "../../evil" })
        .expect(200);

      expect(res.body.status).toBe("created");
      // Verify the path stays within the evidence directory
      expect(res.body.projectPath).toContain("project-new");
      expect(res.body.projectPath).not.toContain("../../");
    });
  });

  describe("POST /api/project/save after /api/project/new", () => {
    it("saves a newly created project through the A3P pipeline", async () => {
      await request(app)
        .post("/api/project/new")
        .send({ templateId: "snow", projectName: "SaveAfterNew" })
        .expect(200);

      const res = await request(app)
        .post("/api/project/save")
        .send({ saveSelector: "scene.myFirstMethod" })
        .expect(200);

      expect(res.body.status).toBe("saved");
      expect(res.body.saved_project_artifact).toBeTruthy();

      const savedPath = path.join(
        TEST_EVIDENCE_DIR,
        "project-save",
        "saved-project.a3p",
      );
      expect(fs.existsSync(savedPath)).toBe(true);
      expect(fs.statSync(savedPath).size).toBeGreaterThan(0);
    });
  });

  describe("GET /api/screenshot", () => {
    it("returns screenshot info", async () => {
      const res = await request(app).get("/api/screenshot").expect(200);
      expect(res.body.status).toBe("captured");
      expect(res.body.path).toContain("screenshot.png");

      const screenshotPath = path.join(TEST_EVIDENCE_DIR, "screenshot.png");
      expect(fs.existsSync(screenshotPath)).toBe(true);
    });
  });
});
