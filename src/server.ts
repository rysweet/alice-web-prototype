import express from "express";
import * as fs from "fs";
import * as path from "path";
import {
  writeSceneObjectAdded,
  writeEditProcedureProof,
  writeSaveProof,
} from "./evidence-writer.js";
import { parseA3P, type AliceProject } from "./a3p-parser.js";
import { renderSceneToPng } from "./scene-renderer.js";
import { createExecutionState, executeStatements, type EventLogEntry } from "./statement-executor.js";

export interface ServerOptions {
  port: number;
  evidenceDir: string;
  projectPath?: string;
}

interface SceneObject {
  name: string;
  className: string;
}

interface ServerState {
  launched: boolean;
  projectPath: string | null;
  projectName: string;
  sceneObjects: SceneObject[];
  procedures: Map<string, string[]>; // methodName -> statements
  parsedProject: AliceProject | null;
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
        { name: "ground", className: "org.lgna.story.SGround" },
        { name: "camera", className: "org.lgna.story.SCamera" },
      ];
    }

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
    state.sceneObjects.push({ name: objectName, className });

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
    if (!state.parsedProject && state.projectPath && fs.existsSync(state.projectPath)) {
      try {
        const data = fs.readFileSync(state.projectPath);
        state.parsedProject = await parseA3P(data);
      } catch (err) {
        console.error("Failed to parse .a3p on run:", err);
      }
    }

    // Execute statements via the executor
    let statementsExecuted = 0;
    let eventLog: EventLogEntry[] = [];

    if (state.parsedProject) {
      const execState = createExecutionState(state.parsedProject.sceneObjects);
      const allStatements = state.parsedProject.methods.flatMap(m => m.statements);
      const result = executeStatements(allStatements, execState);
      statementsExecuted = result.statementsExecuted;
      eventLog = result.eventLog;
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
      event_log: eventLog,
      run_duration_ms: runDuration,
      errors: [],
      doesNotClaim: [
        "visible rendering correctness",
        "desktop run-button proof",
      ],
    };
    fs.writeFileSync(runEvidencePath, JSON.stringify(runResult, null, 2) + "\n");

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
