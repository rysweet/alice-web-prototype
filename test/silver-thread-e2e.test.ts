/**
 * Silver thread e2e: complete student journey through the TS web prototype.
 * 
 * Launch → Load .a3p → Add object → Edit procedure → Run world → Save → Verify evidence
 * 
 * Uses a real Alice starter project from the built RabbitHole repo.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../src/server";
import * as fs from "fs";
import * as path from "path";
import type { Express } from "express";
import request from "supertest";
import { REPOSITORY_A3P_FIXTURE } from "./fixtures/a3p-fixtures";

const EVIDENCE_DIR = path.resolve(__dirname, "../.test-silver-thread-evidence");
const STARTER_PROJECT = REPOSITORY_A3P_FIXTURE;
const STARTER_PROJECT_NAME = path.basename(STARTER_PROJECT, ".a3p");

describe("silver thread: complete student journey", () => {
  let app: Express;

  beforeAll(() => {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    app = createServer({
      port: 0,
      evidenceDir: EVIDENCE_DIR,
      projectPath: STARTER_PROJECT,
    });
  });

  afterAll(() => {
    fs.rmSync(EVIDENCE_DIR, { recursive: true, force: true });
  });

  it("step 1: launch with starter project", async () => {
    const res = await request(app).post("/api/launch").send({}).expect(200);
    expect(res.body.status).toBe("launched");
    expect(res.body.projectName).toBe(STARTER_PROJECT_NAME);
    expect(res.body.sceneObjectCount).toBeGreaterThanOrEqual(2);
  });

  it("step 2: add object to scene", async () => {
    const res = await request(app)
      .post("/api/scene/add-object")
      .send({ className: "org.lgna.story.SBiped", name: "bunny" })
      .expect(200);
    expect(res.body.status).toBe("added");
    expect(res.body.sceneFieldCountAfter).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(EVIDENCE_DIR, "scene-object-added.json"))).toBe(true);
  });

  it("step 3: edit procedure (add comment)", async () => {
    const res = await request(app)
      .post("/api/code/edit-procedure")
      .send({
        procedureSelector: "scene.myFirstMethod",
        editSpec: "append-comment:silver thread e2e proof",
      })
      .expect(200);
    expect(res.body.status).toBe("proved");
    expect(fs.existsSync(path.join(EVIDENCE_DIR, "first-lesson-code-editor-action-proof.json"))).toBe(true);
  });

  it("step 4: run world", async () => {
    const res = await request(app).post("/api/world/run").send({}).expect(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.scene_object_count).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(EVIDENCE_DIR, "run-world-result.json"))).toBe(true);
  });

  it("step 5: save project", async () => {
    const res = await request(app)
      .post("/api/project/save")
      .send({})
      .expect(200);
    expect(res.body.status).toBe("saved");
    const saveDir = path.join(EVIDENCE_DIR, "project-save");
    expect(fs.existsSync(path.join(saveDir, "desktop-save-operation-result.json"))).toBe(true);
  });

  it("all evidence artifacts written", () => {
    const expectedArtifacts = [
      "scene-object-added.json",
      "first-lesson-code-editor-action-proof.json",
      "run-world-result.json",
      "project-save/desktop-save-operation-result.json",
    ];
    for (const artifact of expectedArtifacts) {
      const artifactPath = path.join(EVIDENCE_DIR, artifact);
      expect(fs.existsSync(artifactPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
      expect(content.schema_version).toBeTruthy();
    }
  });
});
