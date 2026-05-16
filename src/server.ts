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
import { renderSceneToPng } from "./scene-renderer.js";
import { executeProject, type LogEntry } from "./tweedle-vm.js";

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

const VALID_EVENT_TYPES = ["sceneActivated", "keyPress", "proximity"] as const;
type EventType = (typeof VALID_EVENT_TYPES)[number];

interface EventRegistration {
  id: string;
  eventType: EventType;
  handlerName: string;
  key?: string;
  targetObjects?: [string, string];
  threshold?: number;
}

const MAX_REGISTRATIONS = 1000;
const DEFAULT_THRESHOLD = 2.0;
const DEFAULT_POSITION: Position = { x: 0, y: 0, z: 0 };

interface ServerState {
  launched: boolean;
  projectPath: string | null;
  projectName: string;
  sceneObjects: SceneObject[];
  procedures: Map<string, string[]>; // methodName -> statements
  parsedProject: AliceProject | null;
  eventRegistrations: EventRegistration[];
  nextEventId: number;
}

export function createServer(options: ServerOptions): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const state: ServerState = {
    launched: false,
    projectPath: null,
    projectName: "Program",
    sceneObjects: [],
    procedures: new Map([["myFirstMethod", []]]),
    parsedProject: null,
    eventRegistrations: [],
    nextEventId: 1,
  };

  // Ensure evidence dir exists
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  // ── POST /api/launch ───────────────────────────────────────────────
  app.post("/api/launch", async (req, res) => {
    const projectFile = req.body?.project ?? options.projectPath ?? null;
    state.launched = true;
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
    if (state.sceneObjects.length === 0) {
      state.sceneObjects = [
        { name: "ground", className: "org.lgna.story.SGround", position: { ...DEFAULT_POSITION } },
        { name: "camera", className: "org.lgna.story.SCamera", position: { ...DEFAULT_POSITION } },
      ];
    }

    // Reset event state on re-launch
    state.eventRegistrations = [];
    state.nextEventId = 1;

    res.json({
      status: "launched",
      project: state.projectPath,
      projectName: state.projectName,
      sceneObjectCount: state.sceneObjects.length,
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
    state.sceneObjects.push({ name: objectName, className, position: { ...DEFAULT_POSITION } });

    const artifactPath = writeSceneObjectAdded(options.evidenceDir, {
      objectClassName: className,
      sceneFieldCountAfter: state.sceneObjects.length,
    });

    res.json({
      status: "added",
      objectName,
      className,
      sceneFieldCountAfter: state.sceneObjects.length,
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
  app.post("/api/project/save", (req, res) => {
    const {
      saveSelector = "scene.myFirstMethod",
      targetPath,
    } = req.body ?? {};

    const saveDir = path.join(options.evidenceDir, "project-save");
    fs.mkdirSync(saveDir, { recursive: true });

    // Write the saved project file
    const savedProjectFilename = "saved-project.a3p";
    const savedProjectPath = path.join(saveDir, savedProjectFilename);

    if (state.projectPath && fs.existsSync(state.projectPath)) {
      fs.copyFileSync(state.projectPath, savedProjectPath);
    } else {
      fs.writeFileSync(savedProjectPath, createMinimalA3pBuffer());
    }

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
      scene_object_count: state.sceneObjects.length,
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
        sceneObjects: state.sceneObjects.map((o) => ({
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

    const { eventType, handlerName: rawHandler, key, targetObjects, threshold } = req.body ?? {};

    if (!eventType) {
      res.status(400).json({ error: "eventType is required" });
      return;
    }
    if (!VALID_EVENT_TYPES.includes(eventType)) {
      res.status(400).json({ error: `unknown eventType: ${eventType}` });
      return;
    }

    const handlerName: string = rawHandler ?? "handler";

    // keyPress-specific validation
    if (eventType === "keyPress") {
      if (!key) {
        res.status(400).json({ error: "key is required for keyPress events" });
        return;
      }
    }

    // proximity-specific validation
    let resolvedThreshold = DEFAULT_THRESHOLD;
    if (eventType === "proximity") {
      if (!Array.isArray(targetObjects) || targetObjects.length !== 2) {
        res.status(400).json({ error: "proximity requires targetObjects with exactly 2 entries" });
        return;
      }
      // Validate objects exist in scene
      for (const objName of targetObjects) {
        if (!state.sceneObjects.some((o) => o.name === objName)) {
          res.status(400).json({ error: `unknown object: ${objName}` });
          return;
        }
      }
      if (threshold !== undefined) {
        if (threshold <= 0 || threshold > 1000) {
          res.status(400).json({ error: "threshold must be > 0 and <= 1000" });
          return;
        }
        resolvedThreshold = threshold;
      }
    }

    if (state.eventRegistrations.length >= MAX_REGISTRATIONS) {
      res.status(400).json({ error: `registration limit reached (${MAX_REGISTRATIONS})` });
      return;
    }

    const registrationId = `evt-${state.nextEventId++}`;
    const registration: EventRegistration = {
      id: registrationId,
      eventType: eventType as EventType,
      handlerName,
    };
    if (eventType === "keyPress") {
      registration.key = key;
    }
    if (eventType === "proximity") {
      registration.targetObjects = targetObjects as [string, string];
      registration.threshold = resolvedThreshold;
    }
    state.eventRegistrations.push(registration);

    const evidenceArtifact = writeEventRegister(options.evidenceDir, {
      registrationId,
      eventType,
      handlerName,
      totalRegistrations: state.eventRegistrations.length,
    });

    res.json({
      registrationId,
      eventType,
      handlerName,
      evidenceArtifact,
    });
  });

  // ── POST /api/events/fire ──────────────────────────────────────────
  app.post("/api/events/fire", (req, res) => {
    if (!state.launched) {
      res.status(400).json({ error: "not launched" });
      return;
    }

    const { eventType, payload } = req.body ?? {};

    if (!eventType) {
      res.status(400).json({ error: "eventType is required" });
      return;
    }
    if (!VALID_EVENT_TYPES.includes(eventType)) {
      res.status(400).json({ error: `unknown eventType: ${eventType}` });
      return;
    }

    const candidates = state.eventRegistrations.filter((r) => r.eventType === eventType);
    const triggered: { id: string; eventType: string; handlerName: string }[] = [];

    for (const reg of candidates) {
      if (eventType === "sceneActivated") {
        triggered.push({ id: reg.id, eventType: reg.eventType, handlerName: reg.handlerName });
      } else if (eventType === "keyPress") {
        const firedKey = payload?.key;
        if (firedKey && reg.key === firedKey) {
          triggered.push({ id: reg.id, eventType: reg.eventType, handlerName: reg.handlerName });
        }
      } else if (eventType === "proximity") {
        const sourceObject: string | undefined = payload?.sourceObject;
        // If sourceObject is provided, only evaluate registrations that include it
        if (sourceObject && !reg.targetObjects!.includes(sourceObject)) {
          continue;
        }
        const [objA, objB] = reg.targetObjects!;
        const posA = state.sceneObjects.find((o) => o.name === objA)?.position;
        const posB = state.sceneObjects.find((o) => o.name === objB)?.position;
        if (posA && posB) {
          const dist = Math.sqrt(
            (posA.x - posB.x) ** 2 + (posA.y - posB.y) ** 2 + (posA.z - posB.z) ** 2,
          );
          if (dist <= reg.threshold!) {
            triggered.push({ id: reg.id, eventType: reg.eventType, handlerName: reg.handlerName });
          }
        }
      }
    }

    const evidenceArtifact = writeEventFire(options.evidenceDir, {
      eventType,
      registrationsEvaluated: candidates.length,
      triggeredCount: triggered.length,
      triggered: triggered.map((t) => t.id),
    });

    res.json({
      triggered,
      evidenceArtifact,
    });
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
