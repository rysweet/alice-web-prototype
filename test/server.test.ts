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

// ── Create Procedure & Function Endpoints ──────────────────────────────
// Each describe block gets a fresh server to isolate state between groups.

const CREATE_EVIDENCE_DIR = path.resolve(__dirname, "../.test-create-evidence");

describe("POST /api/code/create-procedure", () => {
  let app: Express;

  beforeEach(() => {
    fs.mkdirSync(CREATE_EVIDENCE_DIR, { recursive: true });
    app = createServer({ port: 0, evidenceDir: CREATE_EVIDENCE_DIR });
  });

  afterAll(() => {
    fs.rmSync(CREATE_EVIDENCE_DIR, { recursive: true, force: true });
  });

  // ── Happy paths ──

  it("creates a procedure with no parameters", async () => {
    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "wave" })
      .expect(201);

    expect(res.body.status).toBe("created");
    expect(res.body.method).toEqual({
      name: "wave",
      isFunction: false,
      returnType: "void",
      parameters: [],
    });
  });

  it("creates a procedure with parameters", async () => {
    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({
        name: "walkForward",
        parameters: [
          { name: "distance", type: "java.lang.Double" },
          { name: "duration", type: "java.lang.Double" },
        ],
      })
      .expect(201);

    expect(res.body.status).toBe("created");
    expect(res.body.method.name).toBe("walkForward");
    expect(res.body.method.isFunction).toBe(false);
    expect(res.body.method.returnType).toBe("void");
    expect(res.body.method.parameters).toEqual([
      { name: "distance", type: "java.lang.Double" },
      { name: "duration", type: "java.lang.Double" },
    ]);
  });

  it("defaults parameter type to java.lang.Double when omitted", async () => {
    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({
        name: "slide",
        parameters: [{ name: "speed" }],
      })
      .expect(201);

    expect(res.body.method.parameters[0].type).toBe("java.lang.Double");
  });

  it("accepts underscore-prefixed names", async () => {
    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "_internal" })
      .expect(201);

    expect(res.body.method.name).toBe("_internal");
  });

  // ── Validation errors ──

  it("rejects missing name", async () => {
    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({})
      .expect(400);

    expect(res.body.error).toBe("name is required");
  });

  it("rejects empty string name", async () => {
    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "" })
      .expect(400);

    expect(res.body.error).toBe("name is required");
  });

  it("rejects name starting with a digit", async () => {
    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "1badName" })
      .expect(400);

    expect(res.body.error).toBe("invalid method name");
  });

  it("rejects name with special characters", async () => {
    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "my-method" })
      .expect(400);

    expect(res.body.error).toBe("invalid method name");
  });

  it("rejects name exceeding 128 characters", async () => {
    const longName = "a".repeat(129);
    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({ name: longName })
      .expect(400);

    expect(res.body.error).toBe("invalid method name");
  });

  it("accepts name at exactly 128 characters", async () => {
    const maxName = "a".repeat(128);
    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({ name: maxName })
      .expect(201);

    expect(res.body.method.name).toBe(maxName);
  });

  it("rejects invalid parameter name", async () => {
    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({
        name: "goodMethod",
        parameters: [{ name: "bad-param" }],
      })
      .expect(400);

    expect(res.body.error).toContain("invalid parameter name");
    expect(res.body.error).toContain("bad-param");
  });

  it("rejects duplicate parameter names", async () => {
    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({
        name: "goodMethod",
        parameters: [
          { name: "x", type: "java.lang.Double" },
          { name: "x", type: "java.lang.Integer" },
        ],
      })
      .expect(400);

    expect(res.body.error).toContain("duplicate parameter name");
    expect(res.body.error).toContain("x");
  });

  it("rejects more than 50 parameters", async () => {
    const params = Array.from({ length: 51 }, (_, i) => ({
      name: `p${i}`,
      type: "java.lang.Double",
    }));

    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "tooMany", parameters: params })
      .expect(400);

    expect(res.body.error).toBe("too many parameters (max 50)");
  });

  it("accepts exactly 50 parameters", async () => {
    const params = Array.from({ length: 50 }, (_, i) => ({
      name: `p${i}`,
      type: "java.lang.Double",
    }));

    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "fiftyParams", parameters: params })
      .expect(201);

    expect(res.body.method.parameters).toHaveLength(50);
  });

  // ── Duplicate detection ──

  it("rejects duplicate procedure name (409)", async () => {
    await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "greet" })
      .expect(201);

    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "greet" })
      .expect(409);

    expect(res.body.error).toBe("method already exists: greet");
  });

  it("rejects name that collides with existing state.procedures key", async () => {
    // "myFirstMethod" is seeded in state.procedures by createServer
    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "myFirstMethod" })
      .expect(409);

    expect(res.body.error).toBe("method already exists: myFirstMethod");
  });
});

describe("POST /api/code/create-function", () => {
  let app: Express;

  beforeEach(() => {
    fs.mkdirSync(CREATE_EVIDENCE_DIR, { recursive: true });
    app = createServer({ port: 0, evidenceDir: CREATE_EVIDENCE_DIR });
  });

  afterAll(() => {
    fs.rmSync(CREATE_EVIDENCE_DIR, { recursive: true, force: true });
  });

  // ── Happy paths ──

  it("creates a function with explicit return type and parameters", async () => {
    const res = await request(app)
      .post("/api/code/create-function")
      .send({
        name: "computeArea",
        returnType: "java.lang.Double",
        parameters: [
          { name: "width", type: "java.lang.Double" },
          { name: "height", type: "java.lang.Double" },
        ],
      })
      .expect(201);

    expect(res.body.status).toBe("created");
    expect(res.body.method).toEqual({
      name: "computeArea",
      isFunction: true,
      returnType: "java.lang.Double",
      parameters: [
        { name: "width", type: "java.lang.Double" },
        { name: "height", type: "java.lang.Double" },
      ],
    });
  });

  it("creates a function with no parameters", async () => {
    const res = await request(app)
      .post("/api/code/create-function")
      .send({ name: "getSpeed" })
      .expect(201);

    expect(res.body.method.name).toBe("getSpeed");
    expect(res.body.method.isFunction).toBe(true);
    expect(res.body.method.parameters).toEqual([]);
  });

  it("defaults return type to java.lang.Double when omitted", async () => {
    const res = await request(app)
      .post("/api/code/create-function")
      .send({ name: "calculate" })
      .expect(201);

    expect(res.body.method.returnType).toBe("java.lang.Double");
  });

  it("defaults parameter type to java.lang.Double when omitted", async () => {
    const res = await request(app)
      .post("/api/code/create-function")
      .send({
        name: "scale",
        parameters: [{ name: "factor" }],
      })
      .expect(201);

    expect(res.body.method.parameters[0].type).toBe("java.lang.Double");
  });

  it("accepts custom return type", async () => {
    const res = await request(app)
      .post("/api/code/create-function")
      .send({
        name: "isReady",
        returnType: "java.lang.Boolean",
      })
      .expect(201);

    expect(res.body.method.returnType).toBe("java.lang.Boolean");
  });

  // ── Validation errors (shared with procedure) ──

  it("rejects missing name", async () => {
    const res = await request(app)
      .post("/api/code/create-function")
      .send({})
      .expect(400);

    expect(res.body.error).toBe("name is required");
  });

  it("rejects invalid name format", async () => {
    const res = await request(app)
      .post("/api/code/create-function")
      .send({ name: "123bad" })
      .expect(400);

    expect(res.body.error).toBe("invalid method name");
  });

  it("rejects empty returnType string", async () => {
    const res = await request(app)
      .post("/api/code/create-function")
      .send({ name: "broken", returnType: "" })
      .expect(400);

    expect(res.body.error).toBe("returnType must be non-empty");
  });

  it("rejects duplicate parameter names", async () => {
    const res = await request(app)
      .post("/api/code/create-function")
      .send({
        name: "duplicated",
        parameters: [
          { name: "a" },
          { name: "a" },
        ],
      })
      .expect(400);

    expect(res.body.error).toContain("duplicate parameter name");
  });

  it("rejects more than 50 parameters", async () => {
    const params = Array.from({ length: 51 }, (_, i) => ({ name: `p${i}` }));
    const res = await request(app)
      .post("/api/code/create-function")
      .send({ name: "huge", parameters: params })
      .expect(400);

    expect(res.body.error).toBe("too many parameters (max 50)");
  });

  // ── Duplicate detection ──

  it("rejects duplicate function name (409)", async () => {
    await request(app)
      .post("/api/code/create-function")
      .send({ name: "getHeight" })
      .expect(201);

    const res = await request(app)
      .post("/api/code/create-function")
      .send({ name: "getHeight" })
      .expect(409);

    expect(res.body.error).toBe("method already exists: getHeight");
  });

  it("rejects function name that collides with existing procedure", async () => {
    const res = await request(app)
      .post("/api/code/create-function")
      .send({ name: "myFirstMethod" })
      .expect(409);

    expect(res.body.error).toBe("method already exists: myFirstMethod");
  });
});

describe("cross-endpoint create method interactions", () => {
  let app: Express;

  beforeEach(() => {
    fs.mkdirSync(CREATE_EVIDENCE_DIR, { recursive: true });
    app = createServer({ port: 0, evidenceDir: CREATE_EVIDENCE_DIR });
  });

  afterAll(() => {
    fs.rmSync(CREATE_EVIDENCE_DIR, { recursive: true, force: true });
  });

  it("rejects function with name already used by a created procedure", async () => {
    await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "doStuff" })
      .expect(201);

    const res = await request(app)
      .post("/api/code/create-function")
      .send({ name: "doStuff" })
      .expect(409);

    expect(res.body.error).toBe("method already exists: doStuff");
  });

  it("rejects procedure with name already used by a created function", async () => {
    await request(app)
      .post("/api/code/create-function")
      .send({ name: "getValue" })
      .expect(201);

    const res = await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "getValue" })
      .expect(409);

    expect(res.body.error).toBe("method already exists: getValue");
  });

  it("screenshot fallback includes created methods", async () => {
    await request(app)
      .post("/api/code/create-procedure")
      .send({ name: "dance", parameters: [{ name: "speed" }] })
      .expect(201);

    // The screenshot endpoint should reflect created methods in its
    // synthesized AliceProject (state.methods instead of [])
    const res = await request(app).get("/api/screenshot").expect(200);
    expect(res.body.status).toBe("captured");
    // The screenshot itself renders; we verify it doesn't crash with methods present
  });
});
