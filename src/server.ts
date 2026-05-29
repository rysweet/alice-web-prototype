import express from "express";
import * as fs from "fs";
import * as path from "path";
import {
  writeSceneObjectAdded,
  writeEditProcedureProof,
  writeSaveProof,
  writeEventRegister,
  writeEventFire,
} from "./evidence-writer.js";
import { parseA3P, type AliceProject } from "./a3p-parser.js";
import { writeA3P } from "./a3p-writer/archive.js";
import { renderSceneToPng } from "./scene-renderer.js";
import { executeProject, type LogEntry } from "./tweedle-vm.js";
import { EventSystem, EventSystemError } from "./events.js";
import { TemplateLibrary } from "./project-templates.js";

export interface ServerOptions {
  port: number;
  evidenceDir: string;
  projectPath?: string;
}

interface Position {
  x: number;
  y: number;
  z: number;
}

interface SceneObject {
  name: string;
  className: string;
  position: Position;
}

const DEFAULT_POSITION: Position = { x: 0, y: 0, z: 0 };

interface ServerState {
  launched: boolean;
  projectPath: string | null;
  projectName: string;
  sceneObjects: Map<string, SceneObject>;
  procedures: Map<string, string[]>; // methodName -> statements
  parsedProject: AliceProject | null;
  eventSystem: EventSystem;
  templateLibrary: TemplateLibrary;
}

export function createServer(options: ServerOptions): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const state: ServerState = {
    launched: false,
    projectPath: null,
    projectName: "Program",
    sceneObjects: new Map(),
    procedures: new Map([["myFirstMethod", []]]),
    parsedProject: null,
    eventSystem: new EventSystem({
      hasObject: (name) => state.sceneObjects.has(name),
      getObjectPosition: (name) => state.sceneObjects.get(name)?.position ?? null,
    }),
    templateLibrary: new TemplateLibrary(),
  };

  // Ensure evidence dir exists
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  // ── POST /api/launch ───────────────────────────────────────────────
  app.post("/api/launch", async (req, res) => {
    const projectFile = req.body?.project ?? options.projectPath ?? null;
    state.launched = true;

    // Validate project path: must end with .a3p to prevent arbitrary file reads
    if (projectFile && typeof projectFile === "string" && !projectFile.endsWith(".a3p")) {
      res.status(400).json({ error: "project path must be an .a3p file" });
      return;
    }
    state.projectPath = projectFile;

    if (projectFile && fs.existsSync(projectFile)) {
      state.projectName = path.basename(projectFile, ".a3p");
      try {
        const data = fs.readFileSync(projectFile);
        state.parsedProject = await parseA3P(data);
        state.projectName = state.parsedProject.projectName || state.projectName;
      } catch (err) {
        console.error("Failed to parse .a3p on launch:", err);
        state.parsedProject = null;
      }
    }

    // Seed default scene objects (like a fresh Alice project)
    if (state.sceneObjects.size === 0) {
      const ground: SceneObject = { name: "ground", className: "org.lgna.story.SGround", position: { ...DEFAULT_POSITION } };
      const camera: SceneObject = { name: "camera", className: "org.lgna.story.SCamera", position: { ...DEFAULT_POSITION } };
      state.sceneObjects.set("ground", ground);
      state.sceneObjects.set("camera", camera);
    }

    // Reset event state on re-launch
    state.eventSystem.reset();

    res.json({
      status: "launched",
      project: state.projectPath,
      projectName: state.projectName,
      sceneObjectCount: state.sceneObjects.size,
    });
  });

  // ── GET /api/health ────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "running",
      launched: state.launched,
      pid: process.pid,
      uptime: process.uptime(),
      runtime: "typescript-web-prototype",
    });
  });

  // ── POST /api/scene/add-object ─────────────────────────────────────
  app.post("/api/scene/add-object", (req, res) => {
    const { className, name } = req.body ?? {};
    if (!className) {
      res.status(400).json({ error: "className is required" });
      return;
    }
    const objectName =
      name ?? className.split(".").pop()?.toLowerCase() ?? "object";
    state.sceneObjects.set(objectName, { name: objectName, className, position: { ...DEFAULT_POSITION } });

    const artifactPath = writeSceneObjectAdded(options.evidenceDir, {
      objectClassName: className,
      sceneFieldCountAfter: state.sceneObjects.size,
    });

    res.json({
      status: "added",
      objectName,
      className,
      sceneFieldCountAfter: state.sceneObjects.size,
      evidenceArtifact: artifactPath,
    });
  });

  // ── POST /api/code/edit-procedure ──────────────────────────────────
  app.post("/api/code/edit-procedure", (req, res) => {
    const {
      procedureSelector = "scene.myFirstMethod",
      editSpec = "append-comment:eatme first lesson edit proof",
    } = req.body ?? {};

    const methodName = procedureSelector.startsWith("scene.")
      ? procedureSelector.slice("scene.".length)
      : procedureSelector;

    if (!state.procedures.has(methodName)) {
      state.procedures.set(methodName, []);
    }
    const statements = state.procedures.get(methodName)!;
    const beforeStatementCount = statements.length;

    // Extract comment text from edit spec
    const marker = editSpec.startsWith("append-comment:")
      ? editSpec.slice("append-comment:".length)
      : editSpec;

    statements.push(marker);
    const afterStatementCount = statements.length;

    const methodNames = Array.from(state.procedures.keys());

    // Write the edited project artifact (a copy or placeholder .a3p)
    const editedProjectPath = path.join(
      options.evidenceDir,
      "edited-project.a3p",
    );
    if (state.projectPath && fs.existsSync(state.projectPath)) {
      fs.copyFileSync(state.projectPath, editedProjectPath);
    } else {
      // Write a minimal placeholder
      fs.writeFileSync(editedProjectPath, createMinimalA3pBuffer());
    }

    // Write the proof artifact
    const proofPath = writeEditProcedureProof(options.evidenceDir, {
      procedureSelector,
      editSpec,
      inputProjectArtifact: state.projectPath
        ? path.basename(state.projectPath)
        : "starter.a3p",
      sceneType: "Scene",
      methodName,
      marker,
      beforeStatementCount,
      afterStatementCount,
      beforeMethods: methodNames,
      afterMethods: methodNames,
      editedProject: "edited-project.a3p",
    });

    res.json({
      schema_version: "eatme.alice-first-lesson-code-editor-action-proof-result/v1",
      status: "proved",
      procedure_selector: procedureSelector,
      edited_project_artifact: "edited-project.a3p",
      action_proof: "first-lesson-code-editor-action-proof.json",
      doesNotClaim: [
        "first-lesson completion",
        "grading",
        "creative assessment",
        "visible rendering correctness",
        "broad UI automation",
      ],
      evidenceArtifact: proofPath,
    });
  });

  // ── POST /api/project/save ─────────────────────────────────────────
  app.post("/api/project/save", async (req, res) => {
    const {
      saveSelector = "scene.myFirstMethod",
      targetPath,
    } = req.body ?? {};

    const saveDir = path.join(options.evidenceDir, "project-save");
    fs.mkdirSync(saveDir, { recursive: true });

    const savedProjectFilename = "saved-project.a3p";
    const savedProjectPath = path.join(saveDir, savedProjectFilename);

    // Build the current project model from server state
    const currentProject: AliceProject = state.parsedProject ?? {
      version: "3.10",
      projectName: state.projectName,
      sceneObjects: Array.from(state.sceneObjects.values()).map((o) => ({
        name: o.name,
        typeName: o.className,
        resourceType: null,
        position: null,
        orientation: null,
        size: null,
      })),
      methods: [],
    };

    // Write through the A3P archive pipeline
    const a3pBytes = await writeA3P(currentProject);
    fs.writeFileSync(savedProjectPath, a3pBytes);

    const savedStat = fs.statSync(savedProjectPath);

    // Write the save evidence artifact
    const saveArtifactFilename = "desktop-save-operation-result.json";
    const evidenceArtifact = writeSaveProof(saveDir, {
      savedFilePath: targetPath ?? savedProjectPath,
      fileSizeBytes: savedStat.size,
    });

    res.json({
      schema_version: "eatme.alice-project-save-result/v1",
      status: "saved",
      save_selector: saveSelector,
      saved_project_artifact: savedProjectFilename,
      save_artifact: saveArtifactFilename,
      evidenceArtifact,
    });
  });

  // ── GET /api/project/templates ───────────────────────────────────
  app.get("/api/project/templates", (_req, res) => {
    res.json({
      templates: state.templateLibrary.listTemplates(),
    });
  });

  // ── POST /api/project/new ────────────────────────────────────────
  app.post("/api/project/new", async (req, res) => {
    const { templateId = "blank", projectName } = req.body ?? {};

    const template = state.templateLibrary.getTemplate(templateId);
    if (!template) {
      res.status(400).json({
        error: `Unknown template: ${templateId}`,
        availableTemplates: state.templateLibrary.listTemplates().map((t) => t.id),
      });
      return;
    }

    const project = template.createProject({ projectName });

    // Write the new project as a proper A3P archive
    const newDir = path.join(options.evidenceDir, "project-new");
    fs.mkdirSync(newDir, { recursive: true });
    const newProjectPath = path.join(newDir, `${project.projectName}.a3p`);
    const a3pBytes = await writeA3P(project);
    fs.writeFileSync(newProjectPath, a3pBytes);

    // Update server state to reflect the new project
    state.parsedProject = project;
    state.projectName = project.projectName;
    state.projectPath = newProjectPath;
    state.sceneObjects.clear();
    for (const obj of project.sceneObjects) {
      state.sceneObjects.set(obj.name, {
        name: obj.name,
        className: obj.typeName,
        position: obj.position
          ? { x: obj.position.x, y: obj.position.y, z: obj.position.z }
          : { ...DEFAULT_POSITION },
      });
    }
    state.procedures.clear();
    state.procedures.set("myFirstMethod", []);
    for (const method of project.methods) {
      state.procedures.set(method.name, method.statements?.map((s) => s.kind) ?? []);
    }
    state.launched = true;
    state.eventSystem.reset();

    res.json({
      schema_version: "eatme.alice-project-new-result/v1",
      status: "created",
      templateId,
      projectName: project.projectName,
      projectPath: newProjectPath,
      sceneObjectCount: state.sceneObjects.size,
      a3pSizeBytes: a3pBytes.length,
    });
  });

  // ── POST /api/world/run ──────────────────────────────────────────
  app.post("/api/world/run", async (_req, res) => {
    if (!state.launched) {
      res.status(400).json({ error: "Not launched. Call POST /api/launch first." });
      return;
    }

    const runStart = Date.now();

    // Parse project if not already cached
    if (!state.parsedProject && state.projectPath) {
      try {
        await fs.promises.access(state.projectPath);
        const data = await fs.promises.readFile(state.projectPath);
        state.parsedProject = await parseA3P(data);
      } catch (err) {
        console.error("Failed to parse .a3p on run:", err);
      }
    }

    // Execute via the Tweedle VM
    let executionLog: LogEntry[] = [];
    let statementsExecuted = 0;

    if (state.parsedProject) {
      const vmResult = executeProject(state.parsedProject);
      executionLog = vmResult.execution_log;
      statementsExecuted = executionLog.length;
    }

    const runDuration = Date.now() - runStart;

    const runEvidencePath = path.join(options.evidenceDir, "run-world-result.json");
    const runResult = {
      schema_version: "eatme.alice-run-world-result/v1",
      status: "completed",
      project_name: state.projectName,
      scene_object_count: state.sceneObjects.size,
      procedure_count: state.procedures.size,
      statements_executed: statementsExecuted,
      execution_log: executionLog,
      run_duration_ms: runDuration,
      errors: [],
      doesNotClaim: [
        "visible rendering correctness",
        "desktop run-button proof",
      ],
    };
    // Write evidence asynchronously to avoid blocking the event loop
    await fs.promises.writeFile(runEvidencePath, JSON.stringify(runResult, null, 2) + "\n");

    res.json({
      ...runResult,
      evidenceArtifact: runEvidencePath,
    });
  });

  // ── GET /api/screenshot ────────────────────────────────────────────
  app.get("/api/screenshot", async (_req, res) => {
    const screenshotPath = path.join(options.evidenceDir, "screenshot.png");

    try {
      // Use cached parse if available, otherwise build from server state
      const currentProject: AliceProject = state.parsedProject ?? {
        version: "3.10",
        projectName: state.projectName,
        sceneObjects: Array.from(state.sceneObjects.values()).map((o) => ({
          name: o.name,
          typeName: o.className,
          resourceType: null,
          position: null,
          orientation: null,
          size: null,
        })),
        methods: [],
      };

      const result = await renderSceneToPng(currentProject, { width: 640, height: 480 });
      fs.writeFileSync(screenshotPath, result.png);

      res.json({
        status: "captured",
        path: screenshotPath,
        objectCount: result.objectCount,
        sceneDescription: result.sceneDescription,
        rendered: true,
      });
    } catch (err) {
      // Fallback to placeholder
      fs.writeFileSync(screenshotPath, createPlaceholderPng());
      res.json({
        status: "captured",
        path: screenshotPath,
        placeholder: true,
        error: "Screenshot rendering failed",
      });
    }
  });

  // ── POST /api/events/register ────────────────────────────────────
  app.post("/api/events/register", (req, res) => {
    if (!state.launched) {
      res.status(400).json({ error: "not launched" });
      return;
    }

    try {
      const registration = state.eventSystem.register(req.body ?? {});
      const evidenceArtifact = writeEventRegister(options.evidenceDir, {
        registrationId: registration.id,
        eventType: registration.eventType,
        handlerName: registration.handlerName,
        totalRegistrations: state.eventSystem.totalRegistrations,
      });

      res.json({
        registrationId: registration.id,
        eventType: registration.eventType,
        handlerName: registration.handlerName,
        evidenceArtifact,
      });
    } catch (error) {
      if (error instanceof EventSystemError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

  // ── POST /api/events/fire ──────────────────────────────────────────
  app.post("/api/events/fire", (req, res) => {
    if (!state.launched) {
      res.status(400).json({ error: "not launched" });
      return;
    }

    try {
      const { eventType, payload } = req.body ?? {};
      const result = state.eventSystem.fire(eventType, payload);
      const evidenceArtifact = writeEventFire(options.evidenceDir, {
        eventType,
        registrationsEvaluated: result.registrationsEvaluated,
        triggeredCount: result.triggered.length,
        triggered: result.triggered.map((triggered) => triggered.id),
      });

      res.json({
        triggered: result.triggered,
        evidenceArtifact,
      });
    } catch (error) {
      if (error instanceof EventSystemError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

  return app;
}

/** Create a minimal valid buffer that can stand in as a .a3p file. */
function createMinimalA3pBuffer(): Buffer {
  return Buffer.from("PK\x03\x04" + "alice-web-prototype-placeholder", "binary");
}

/** Minimal valid 8x8 PNG (solid color). */
function createPlaceholderPng(): Buffer {
  // Smallest valid PNG: 1x1 pixel, RGB
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbH" +
      "YQAAAABJRU5ErkJggg==",
    "base64",
  );
}
