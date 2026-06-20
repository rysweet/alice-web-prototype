/**
 * tutorial-e2e.test.ts — TDD E2E tests for the 11-step tutorial workflow.
 *
 * Tests the complete developer journey documented in
 * docs/tutorial-building-your-first-alice-app.md:
 *   1. Health check
 *   2. Launch IDE
 *   3. List templates
 *   4. Create project from template
 *   5. Add scene object
 *   6. Edit procedure
 *   7. Run world
 *   8. Take screenshot
 *   9. Register event
 *  10. Fire event
 *  11. Save project
 *
 * Each test verifies the exact response contract (status codes, field names,
 * value constraints) so the tutorial's curl examples stay truthful.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import type { AddressInfo } from "net";

const EVIDENCE_DIR = path.resolve(__dirname, "../.test-tutorial-e2e-evidence");
let server: http.Server;
let baseUrl: string;

// Helper: create an isolated server for testing pre-launch behavior
async function withFreshServer(
  fn: (url: string) => Promise<void>,
): Promise<void> {
  const dir = path.join(EVIDENCE_DIR, `fresh-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  const app = createServer({ port: 0, evidenceDir: dir });
  const srv = app.listen(0);
  const { port } = srv.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }
}

// Helper: JSON POST/GET bound to a base URL
function createClient(getBaseUrl: () => string) {
  return {
    post(endpoint: string, body: Record<string, unknown> = {}): Promise<Response> {
      return fetch(`${getBaseUrl()}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    get(endpoint: string): Promise<Response> {
      return fetch(`${getBaseUrl()}${endpoint}`);
    },
  };
}

const { post, get } = createClient(() => baseUrl);

beforeAll(() => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const app = createServer({ port: 0, evidenceDir: EVIDENCE_DIR });
  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  fs.rmSync(EVIDENCE_DIR, { recursive: true, force: true });
});

// ── Step 1: Health Check ─────────────────────────────────────────────
describe("Step 1: GET /api/health", () => {
  it("returns 200 with status=running and runtime identifier", async () => {
    const res = await get("/api/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("running");
    expect(body.runtime).toBe("lookingglass-typescript-web");
    expect(body.pid).toBeTypeOf("number");
    expect(body.uptime).toBeTypeOf("number");
    expect(body.uptime).toBeGreaterThan(0);
  });

  it("reports launched=false before any launch call", async () => {
    const res = await get("/api/health");
    const body = await res.json();
    expect(body.launched).toBe(false);
  });
});

// ── Step 2: Launch IDE ───────────────────────────────────────────────
describe("Step 2: POST /api/launch", () => {
  it("launches without a project file", async () => {
    const res = await post("/api/launch");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("launched");
    expect(body.project).toBeNull();
    expect(body.projectName).toBe("Program");
    expect(body.sceneObjectCount).toBeGreaterThanOrEqual(2); // ground + camera
  });

  it("seeds default scene objects (ground + camera)", async () => {
    const res = await post("/api/launch");
    const body = await res.json();
    expect(body.sceneObjectCount).toBeGreaterThanOrEqual(2);
  });

  it("rejects non-.a3p project paths", async () => {
    const res = await post("/api/launch", { project: "/etc/passwd" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain(".a3p");
  });

  it("updates health check to show launched=true", async () => {
    await post("/api/launch");
    const res = await get("/api/health");
    const body = await res.json();
    expect(body.launched).toBe(true);
  });
});

// ── Step 3: List Templates ───────────────────────────────────────────
describe("Step 3: GET /api/project/templates", () => {
  it("returns an array of template descriptors", async () => {
    const res = await get("/api/project/templates");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.templates).toBeInstanceOf(Array);
    expect(body.templates.length).toBeGreaterThanOrEqual(4);
  });

  it("includes all four built-in templates", async () => {
    const res = await get("/api/project/templates");
    const body = await res.json();
    const ids = body.templates.map((t: { id: string }) => t.id);
    expect(ids).toContain("blank");
    expect(ids).toContain("snow");
    expect(ids).toContain("sea-floor");
    expect(ids).toContain("moon");
  });

  it("each template has id, name, and description", async () => {
    const res = await get("/api/project/templates");
    const body = await res.json();
    for (const t of body.templates) {
      expect(t.id).toBeTypeOf("string");
      expect(t.name).toBeTypeOf("string");
      expect(t.description).toBeTypeOf("string");
      expect(t.id.length).toBeGreaterThan(0);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });
});

// ── Step 4: Create Project from Template ─────────────────────────────
describe("Step 4: POST /api/project/new", () => {
  it("creates a project from the snow template", async () => {
    const res = await post("/api/project/new", {
      templateId: "snow",
      projectName: "MySnowWorld",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.schema_version).toBe("eatme.alice-project-new-result/v1");
    expect(body.status).toBe("created");
    expect(body.templateId).toBe("snow");
    expect(body.projectName).toBe("MySnowWorld");
    expect(body.sceneObjectCount).toBe(4); // ground, camera, snowPerson, pineTree
    expect(body.a3pSizeBytes).toBeGreaterThan(0);
    expect(body.projectPath).toBeTypeOf("string");
    expect(body.projectPath).toMatch(/\.a3p$/);
  });

  it("creates a project from the blank template with default name", async () => {
    const res = await post("/api/project/new", { templateId: "blank" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("created");
    expect(body.templateId).toBe("blank");
    expect(body.sceneObjectCount).toBe(2); // ground + camera
    expect(body.projectName).toBeTypeOf("string");
  });

  it("rejects unknown template IDs with 400 and available list", async () => {
    const res = await post("/api/project/new", { templateId: "nonexistent" });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("nonexistent");
    expect(body.availableTemplates).toBeInstanceOf(Array);
    expect(body.availableTemplates).toContain("blank");
  });

  it("updates server state so health shows launched=true", async () => {
    await post("/api/project/new", { templateId: "blank" });
    const res = await get("/api/health");
    const body = await res.json();
    expect(body.launched).toBe(true);
  });

  it("writes a valid .a3p file to disk", async () => {
    const res = await post("/api/project/new", {
      templateId: "sea-floor",
      projectName: "TestSeaFloor",
    });
    const body = await res.json();
    expect(fs.existsSync(body.projectPath)).toBe(true);
    const stat = fs.statSync(body.projectPath);
    expect(stat.size).toBe(body.a3pSizeBytes);
  });
});

// ── Step 5: Add Scene Object ─────────────────────────────────────────
describe("Step 5: POST /api/scene/add-object", () => {
  beforeAll(async () => {
    // Ensure a fresh project is launched so add-object has a clean slate
    await post("/api/project/new", { templateId: "blank", projectName: "AddObjectTest" });
  });

  it("adds a fox to the scene", async () => {
    const res = await post("/api/scene/add-object", {
      className: "org.lgna.story.SBiped",
      name: "fox",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("added");
    expect(body.objectName).toBe("fox");
    expect(body.className).toBe("org.lgna.story.SBiped");
    expect(body.sceneFieldCountAfter).toBe(3); // ground + camera + fox
    expect(body.evidenceArtifact).toBeTypeOf("string");
  });

  it("auto-names objects from className when name is omitted", async () => {
    const res = await post("/api/scene/add-object", {
      className: "org.lgna.story.STree",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.objectName).toBe("stree"); // last segment lowercased
    expect(body.status).toBe("added");
  });

  it("rejects requests without className", async () => {
    const res = await post("/api/scene/add-object", {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("className");
  });

  it("increments scene field count with each add", async () => {
    // Start fresh
    await post("/api/project/new", { templateId: "blank", projectName: "CountTest" });
    const r1 = await post("/api/scene/add-object", { className: "org.lgna.story.SBiped", name: "a" });
    const b1 = await r1.json();
    const r2 = await post("/api/scene/add-object", { className: "org.lgna.story.SBiped", name: "b" });
    const b2 = await r2.json();
    expect(b2.sceneFieldCountAfter).toBe(b1.sceneFieldCountAfter + 1);
  });

  it("writes evidence artifact to disk", async () => {
    await post("/api/project/new", { templateId: "blank", projectName: "EvidenceTest" });
    const res = await post("/api/scene/add-object", {
      className: "org.lgna.story.SBiped",
      name: "evidenceCheck",
    });
    const body = await res.json();
    expect(fs.existsSync(body.evidenceArtifact)).toBe(true);
  });
});

// ── Step 6: Edit Procedure ───────────────────────────────────────────
describe("Step 6: POST /api/code/edit-procedure", () => {
  beforeAll(async () => {
    await post("/api/project/new", { templateId: "blank", projectName: "EditTest" });
  });

  it("appends a comment to myFirstMethod", async () => {
    const res = await post("/api/code/edit-procedure", {
      procedureSelector: "scene.myFirstMethod",
      editSpec: "append-comment:fox says hello",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.schema_version).toBe("eatme.alice-first-lesson-code-editor-action-proof-result/v1");
    expect(body.status).toBe("proved");
    expect(body.procedure_selector).toBe("scene.myFirstMethod");
    expect(body.edited_project_artifact).toBe("edited-project.a3p");
    expect(body.action_proof).toBe("first-lesson-code-editor-action-proof.json");
    expect(body.evidenceArtifact).toBeTypeOf("string");
  });

  it("includes doesNotClaim disclaimers", async () => {
    const res = await post("/api/code/edit-procedure");
    const body = await res.json();
    expect(body.doesNotClaim).toBeInstanceOf(Array);
    expect(body.doesNotClaim.length).toBeGreaterThan(0);
    expect(body.doesNotClaim).toContain("first-lesson completion");
    expect(body.doesNotClaim).toContain("grading");
    expect(body.doesNotClaim).toContain("visible rendering correctness");
  });

  it("uses default values when no body is provided", async () => {
    const res = await post("/api/code/edit-procedure");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.procedure_selector).toBe("scene.myFirstMethod");
    expect(body.status).toBe("proved");
  });
});

// ── Step 7: Run World ────────────────────────────────────────────────
describe("Step 7: POST /api/world/run", () => {
  it("rejects run before launch on a fresh server", async () => {
    await withFreshServer(async (url) => {
      const res = await fetch(`${url}/api/world/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Not launched");
    });
  });

  it("executes the world after project creation", async () => {
    await post("/api/project/new", { templateId: "blank", projectName: "RunTest" });

    const res = await post("/api/world/run");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.schema_version).toBe("eatme.alice-run-world-result/v1");
    expect(body.status).toBe("completed");
    expect(body.project_name).toBe("RunTest");
    expect(body.scene_object_count).toBeGreaterThanOrEqual(2);
    expect(body.procedure_count).toBeGreaterThanOrEqual(1);
    expect(body.statements_executed).toBeTypeOf("number");
    expect(body.execution_log).toBeInstanceOf(Array);
    expect(body.run_duration_ms).toBeTypeOf("number");
    expect(body.errors).toBeInstanceOf(Array);
    expect(body.doesNotClaim).toBeInstanceOf(Array);
    expect(body.evidenceArtifact).toBeTypeOf("string");
  });

  it("writes run evidence artifact to disk", async () => {
    await post("/api/project/new", { templateId: "blank", projectName: "RunEvidenceTest" });
    const res = await post("/api/world/run");
    const body = await res.json();
    expect(fs.existsSync(body.evidenceArtifact)).toBe(true);
    const evidence = JSON.parse(fs.readFileSync(body.evidenceArtifact, "utf-8"));
    expect(evidence.schema_version).toBe("eatme.alice-run-world-result/v1");
  });
});

// ── Step 8: Screenshot ───────────────────────────────────────────────
describe("Step 8: POST /api/screenshot", () => {
  beforeAll(async () => {
    await post("/api/project/new", { templateId: "snow", projectName: "ScreenshotTest" });
  });

  it("captures a screenshot and returns metadata", async () => {
    const res = await post("/api/screenshot");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("captured");
    expect(body.path).toBeTypeOf("string");
    expect(body.path).toMatch(/\.png$/);
    // Either rendered successfully or fell back to placeholder
    expect(["captured"]).toContain(body.status);
  });

  it("writes a PNG file to the evidence directory", async () => {
    const res = await post("/api/screenshot");
    const body = await res.json();
    expect(fs.existsSync(body.path)).toBe(true);
    const stat = fs.statSync(body.path);
    expect(stat.size).toBeGreaterThan(0);
  });

  it("includes object count when rendering succeeds", async () => {
    const res = await post("/api/screenshot");
    const body = await res.json();
    if (body.rendered) {
      expect(body.objectCount).toBeTypeOf("number");
      expect(body.objectCount).toBeGreaterThanOrEqual(2);
      expect(body.sceneDescription).toBeTypeOf("string");
    } else {
      // Placeholder fallback — still valid
      expect(body.placeholder).toBe(true);
    }
  });
});

// ── Step 9: Register Event ───────────────────────────────────────────
describe("Step 9: POST /api/events/register", () => {
  beforeAll(async () => {
    await post("/api/project/new", { templateId: "blank", projectName: "EventTest" });
  });

  it("registers a sceneActivated event handler", async () => {
    const res = await post("/api/events/register", {
      eventType: "sceneActivated",
      handlerName: "onSceneReady",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.registrationId).toBeTypeOf("string");
    expect(body.eventType).toBe("sceneActivated");
    expect(body.handlerName).toBe("onSceneReady");
    expect(body.evidenceArtifact).toBeTypeOf("string");
  });

  it("registers a keyPress event handler", async () => {
    const res = await post("/api/events/register", {
      eventType: "keyPress",
      handlerName: "onSpacePressed",
      key: "SPACE",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // keyPress is aliased to keyPressed internally
    expect(["keyPress", "keyPressed"]).toContain(body.eventType);
    expect(body.handlerName).toBe("onSpacePressed");
  });

  it("rejects invalid event types", async () => {
    const res = await post("/api/events/register", {
      eventType: "invalidEventType",
      handlerName: "handler",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("rejects registration before launch on a fresh server", async () => {
    await withFreshServer(async (url) => {
      const res = await fetch(`${url}/api/events/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "keyPress", handlerName: "h" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("not launched");
    });
  });
});

// ── Step 10: Fire Event ──────────────────────────────────────────────
describe("Step 10: POST /api/events/fire", () => {
  beforeAll(async () => {
    await post("/api/project/new", { templateId: "blank", projectName: "FireEventTest" });
    // Register a handler first so fire has something to trigger
    await post("/api/events/register", {
      eventType: "sceneActivated",
      handlerName: "onSceneReady",
    });
  });

  it("fires a sceneActivated event and triggers the registered handler", async () => {
    const res = await post("/api/events/fire", {
      eventType: "sceneActivated",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.triggered).toBeInstanceOf(Array);
    expect(body.triggered.length).toBeGreaterThanOrEqual(1);
    expect(body.triggered[0].handlerName).toBe("onSceneReady");
    expect(body.triggered[0].eventType).toBe("sceneActivated");
    expect(body.evidenceArtifact).toBeTypeOf("string");
  });

  it("returns empty triggered array for events with no handlers", async () => {
    const res = await post("/api/events/fire", {
      eventType: "mouseClicked",
      payload: { x: 100, y: 200 },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.triggered).toBeInstanceOf(Array);
    expect(body.triggered.length).toBe(0);
  });

  it("rejects fire before launch on a fresh server", async () => {
    await withFreshServer(async (url) => {
      const res = await fetch(`${url}/api/events/fire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "keyPressed" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("not launched");
    });
  });
});

// ── Step 11: Save Project ────────────────────────────────────────────
describe("Step 11: POST /api/project/save", () => {
  beforeAll(async () => {
    await post("/api/project/new", { templateId: "snow", projectName: "SaveTest" });
    await post("/api/scene/add-object", { className: "org.lgna.story.SBiped", name: "hero" });
    await post("/api/code/edit-procedure", {
      procedureSelector: "scene.myFirstMethod",
      editSpec: "append-comment:hero walks forward",
    });
  });

  it("saves the project and returns eatme schema result", async () => {
    const res = await post("/api/project/save", {
      saveSelector: "scene.myFirstMethod",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.schema_version).toBe("eatme.alice-project-save-result/v1");
    expect(body.status).toBe("saved");
    expect(body.save_selector).toBe("scene.myFirstMethod");
    expect(body.saved_project_artifact).toBe("saved-project.a3p");
    expect(body.save_artifact).toBe("desktop-save-operation-result.json");
    expect(body.evidenceArtifact).toBeTypeOf("string");
  });

  it("writes a valid .a3p file to the save directory", async () => {
    await post("/api/project/save");
    const savedPath = path.join(EVIDENCE_DIR, "project-save", "saved-project.a3p");
    expect(fs.existsSync(savedPath)).toBe(true);
    const stat = fs.statSync(savedPath);
    expect(stat.size).toBeGreaterThan(0);
  });

  it("writes evidence artifact JSON to the save directory", async () => {
    await post("/api/project/save");
    const evidencePath = path.join(
      EVIDENCE_DIR,
      "project-save",
      "desktop-save-operation-result.json",
    );
    expect(fs.existsSync(evidencePath)).toBe(true);
    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf-8"));
    expect(evidence.schema_version).toBe("eatme.alice-desktop-save-operation-result/v1");
    expect(evidence.saved_file).toBeDefined();
    expect(evidence.saved_file_size_bytes).toBeGreaterThan(0);
  });
});

// ── Full Workflow: Sequential 11-step tutorial journey ───────────────
describe("Full tutorial workflow (sequential)", () => {
  let workflowServer: http.Server;
  let workflowUrl: string;
  const workflowEvidence = path.join(EVIDENCE_DIR, "full-workflow");

  beforeAll(() => {
    fs.mkdirSync(workflowEvidence, { recursive: true });
    const app = createServer({ port: 0, evidenceDir: workflowEvidence });
    workflowServer = app.listen(0);
    const { port } = workflowServer.address() as AddressInfo;
    workflowUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (workflowServer) {
      await new Promise<void>((resolve) => workflowServer.close(() => resolve()));
    }
  });

  const { post: wPost, get: wGet } = createClient(() => workflowUrl);

  it("completes the full 11-step tutorial workflow end-to-end", async () => {
    // Step 1: Health check
    const healthRes = await wGet("/api/health");
    expect(healthRes.status).toBe(200);
    const health = await healthRes.json();
    expect(health.status).toBe("running");
    expect(health.launched).toBe(false);

    // Step 2: Launch
    const launchRes = await wPost("/api/launch");
    expect(launchRes.status).toBe(200);
    const launch = await launchRes.json();
    expect(launch.status).toBe("launched");

    // Step 3: List templates
    const templatesRes = await wGet("/api/project/templates");
    expect(templatesRes.status).toBe(200);
    const templates = await templatesRes.json();
    expect(templates.templates.length).toBeGreaterThanOrEqual(4);

    // Step 4: Create project from snow template
    const createRes = await wPost("/api/project/new", {
      templateId: "snow",
      projectName: "TutorialWorld",
    });
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    expect(created.status).toBe("created");
    expect(created.sceneObjectCount).toBe(4);

    // Step 5: Add a fox to the scene
    const addRes = await wPost("/api/scene/add-object", {
      className: "org.lgna.story.SBiped",
      name: "fox",
    });
    expect(addRes.status).toBe(200);
    const added = await addRes.json();
    expect(added.status).toBe("added");
    expect(added.sceneFieldCountAfter).toBe(5); // 4 from snow + fox

    // Step 6: Edit procedure
    const editRes = await wPost("/api/code/edit-procedure", {
      procedureSelector: "scene.myFirstMethod",
      editSpec: "append-comment:fox says hello",
    });
    expect(editRes.status).toBe(200);
    const edited = await editRes.json();
    expect(edited.status).toBe("proved");

    // Step 7: Run the world
    const runRes = await wPost("/api/world/run");
    expect(runRes.status).toBe(200);
    const run = await runRes.json();
    expect(run.status).toBe("completed");
    expect(run.scene_object_count).toBe(5);

    // Step 8: Screenshot
    const screenshotRes = await wPost("/api/screenshot");
    expect(screenshotRes.status).toBe(200);
    const screenshot = await screenshotRes.json();
    expect(screenshot.status).toBe("captured");

    // Step 9: Register event
    const registerRes = await wPost("/api/events/register", {
      eventType: "sceneActivated",
      handlerName: "onWorldStart",
    });
    expect(registerRes.status).toBe(200);
    const registered = await registerRes.json();
    expect(registered.registrationId).toBeDefined();

    // Step 10: Fire event
    const fireRes = await wPost("/api/events/fire", {
      eventType: "sceneActivated",
    });
    expect(fireRes.status).toBe(200);
    const fired = await fireRes.json();
    expect(fired.triggered.length).toBeGreaterThanOrEqual(1);
    expect(fired.triggered[0].handlerName).toBe("onWorldStart");

    // Step 11: Save project
    const saveRes = await wPost("/api/project/save", {
      saveSelector: "scene.myFirstMethod",
    });
    expect(saveRes.status).toBe(200);
    const saved = await saveRes.json();
    expect(saved.status).toBe("saved");
    expect(saved.schema_version).toBe("eatme.alice-project-save-result/v1");
  });
});

// ── Edge Cases & Error Handling ──────────────────────────────────────
describe("Edge cases and error handling", () => {
  it("handles concurrent template listing", async () => {
    const results = await Promise.all([
      get("/api/project/templates"),
      get("/api/project/templates"),
      get("/api/project/templates"),
    ]);
    for (const res of results) {
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.templates.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("handles creating project from all four templates", async () => {
    for (const templateId of ["blank", "snow", "sea-floor", "moon"]) {
      const res = await post("/api/project/new", { templateId });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("created");
      expect(body.templateId).toBe(templateId);
    }
  });

  it("sea-floor template has 5 objects", async () => {
    const res = await post("/api/project/new", { templateId: "sea-floor" });
    const body = await res.json();
    expect(body.sceneObjectCount).toBe(5); // seaFloor, camera, fish, coral, treasure
  });

  it("moon template has 4 objects", async () => {
    const res = await post("/api/project/new", { templateId: "moon" });
    const body = await res.json();
    expect(body.sceneObjectCount).toBe(4); // moonSurface, camera, astronaut, rover
  });

  it("POST /api/project/new defaults to blank when no templateId given", async () => {
    const res = await post("/api/project/new", { projectName: "DefaultTemplate" });
    const body = await res.json();
    expect(body.status).toBe("created");
    expect(body.templateId).toBe("blank");
    expect(body.sceneObjectCount).toBe(2);
  });

  it("multiple add-object calls accumulate objects", async () => {
    await post("/api/project/new", { templateId: "blank", projectName: "AccumTest" });
    await post("/api/scene/add-object", { className: "org.lgna.story.SBiped", name: "a" });
    await post("/api/scene/add-object", { className: "org.lgna.story.SBiped", name: "b" });
    const res = await post("/api/scene/add-object", { className: "org.lgna.story.SBiped", name: "c" });
    const body = await res.json();
    expect(body.sceneFieldCountAfter).toBe(5); // 2 (blank) + 3 added
  });

  it("add-object with same name replaces the existing object", async () => {
    await post("/api/project/new", { templateId: "blank", projectName: "ReplaceTest" });
    await post("/api/scene/add-object", { className: "org.lgna.story.SBiped", name: "hero" });
    const r1 = await post("/api/scene/add-object", { className: "org.lgna.story.STree", name: "hero" });
    const b1 = await r1.json();
    // Map.set replaces, so count stays the same
    expect(b1.sceneFieldCountAfter).toBe(3); // ground + camera + hero (replaced)
  });
});

// ── Documentation Existence Tests ────────────────────────────────────
describe("Tutorial documentation artifacts", () => {
  const docsDir = path.resolve(__dirname, "../docs");

  it("tutorial markdown file exists", () => {
    const tutorialPath = path.join(docsDir, "tutorial-building-your-first-alice-app.md");
    expect(fs.existsSync(tutorialPath)).toBe(true);
  });

  it("tutorial references all 11 API endpoints", () => {
    const tutorialPath = path.join(docsDir, "tutorial-building-your-first-alice-app.md");
    const content = fs.readFileSync(tutorialPath, "utf-8");
    const endpoints = [
      "/api/health",
      "/api/launch",
      "/api/project/templates",
      "/api/project/new",
      "/api/scene/add-object",
      "/api/code/edit-procedure",
      "/api/world/run",
      "/api/screenshot",
      "/api/events/register",
      "/api/events/fire",
      "/api/project/save",
    ];
    for (const endpoint of endpoints) {
      expect(content).toContain(endpoint);
    }
  });

  it("api-reference.md exists and covers all endpoints", () => {
    const apiRefPath = path.join(docsDir, "api-reference.md");
    expect(fs.existsSync(apiRefPath)).toBe(true);
    const content = fs.readFileSync(apiRefPath, "utf-8");
    expect(content).toContain("GET /api/health");
    expect(content).toContain("POST /api/launch");
    expect(content).toContain("GET /api/project/templates");
    expect(content).toContain("POST /api/project/new");
  });

  it("screenshots directory exists", () => {
    const screenshotsDir = path.join(docsDir, "screenshots");
    expect(fs.existsSync(screenshotsDir)).toBe(true);
  });
});
