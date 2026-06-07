import * as fs from "fs";
import * as path from "path";
import { parseA3P } from "../a3p-parser.js";
import { writeA3P } from "../a3p-writer/archive.js";
import { executeProject, type LogEntry } from "../tweedle-vm.js";
import { buildCurrentProject, seedDefaultSceneObjects, type ServerState } from "./state.js";
import type { EvidenceService } from "./evidence-service.js";

export interface ProjectService {
  launchProject(state: ServerState, resolvedProjectFile: string | null): Promise<void>;
  editProcedure(
    state: ServerState,
    evidenceDir: string,
    evidenceService: EvidenceService,
    input: { procedureSelector?: string; editSpec?: string },
  ): Promise<Record<string, unknown>>;
  saveProject(
    state: ServerState,
    evidenceDir: string,
    evidenceService: EvidenceService,
    input: { saveSelector?: string; targetPath?: string },
  ): Promise<Record<string, unknown>>;
  runWorld(
    state: ServerState,
    evidenceDir: string,
    evidenceService: EvidenceService,
  ): Promise<Record<string, unknown>>;
}

function isMissingProjectFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export const projectService: ProjectService = {
  async launchProject(state, resolvedProjectFile) {
    state.launched = true;
    state.projectPath = resolvedProjectFile;

    if (resolvedProjectFile) {
      let data: Buffer | null = null;
      try {
        data = await fs.promises.readFile(resolvedProjectFile);
      } catch (err) {
        if (!isMissingProjectFileError(err)) {
          state.projectName = path.basename(resolvedProjectFile, ".a3p");
          console.error("Failed to parse .a3p on launch:", err);
          state.parsedProject = null;
        }
      }

      if (data) {
        state.projectName = path.basename(resolvedProjectFile, ".a3p");
        try {
          state.parsedProject = await parseA3P(data);
          state.projectName = state.parsedProject.projectName || state.projectName;
        } catch (err) {
          console.error("Failed to parse .a3p on launch:", err);
          state.parsedProject = null;
        }
      }
    }

    seedDefaultSceneObjects(state);
    state.eventSystem.reset();
  },

  async editProcedure(state, evidenceDir, evidenceService, input) {
    const {
      procedureSelector = "scene.myFirstMethod",
      editSpec = "append-comment:eatme first lesson edit proof",
    } = input;

    const methodName = procedureSelector.startsWith("scene.")
      ? procedureSelector.slice("scene.".length)
      : procedureSelector;

    if (!state.procedures.has(methodName)) {
      state.procedures.set(methodName, []);
    }
    const statements = state.procedures.get(methodName)!;
    const beforeStatementCount = statements.length;

    let marker: string;
    if (editSpec.startsWith("append-comment:")) {
      marker = editSpec.slice("append-comment:".length);
    } else if (editSpec.startsWith("append-statement:")) {
      marker = editSpec.slice("append-statement:".length);
    } else {
      marker = editSpec;
    }

    statements.push(marker);
    const afterStatementCount = statements.length;

    if (editSpec.startsWith("append-statement:") && state.parsedProject) {
      const method = state.parsedProject.methods.find((m) => m.name === methodName);
      if (method) {
        method.statements ??= [];
        method.statements.push({
          kind: "MethodCall",
          object: "this",
          method: marker.trim(),
          arguments: [],
        });
      }
    }

    const methodNames = Array.from(state.procedures.keys());

    await evidenceService.writeEditedProjectArtifact(state.projectPath, evidenceDir);

    const proofPath = evidenceService.recordEditProcedureProof(evidenceDir, {
      procedureSelector,
      editSpec,
      inputProjectArtifact: state.projectPath
        ? path.basename(state.projectPath)
        : "starter.a3p",
      methodName,
      marker,
      beforeStatementCount,
      afterStatementCount,
      methodNames,
    });

    return {
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
    };
  },

  async saveProject(state, evidenceDir, evidenceService, input) {
    const {
      saveSelector = "scene.myFirstMethod",
      targetPath,
    } = input;

    const saveDir = path.join(evidenceDir, "project-save");
    await fs.promises.mkdir(saveDir, { recursive: true });

    const savedProjectFilename = "saved-project.a3p";
    const savedProjectPath = path.join(saveDir, savedProjectFilename);

    const currentProject = buildCurrentProject(state);
    const a3pBytes = await writeA3P(currentProject);
    await fs.promises.writeFile(savedProjectPath, a3pBytes);

    const saveArtifactFilename = "desktop-save-operation-result.json";
    const evidenceArtifact = evidenceService.recordSaveProof(
      saveDir,
      targetPath ?? savedProjectPath,
      a3pBytes.length,
    );

    return {
      schema_version: "eatme.alice-project-save-result/v1",
      status: "saved",
      save_selector: saveSelector,
      saved_project_artifact: savedProjectFilename,
      save_artifact: saveArtifactFilename,
      evidenceArtifact,
    };
  },

  async runWorld(state, evidenceDir, evidenceService) {
    const runStart = Date.now();

    if (!state.parsedProject && state.projectPath) {
      try {
        const data = await fs.promises.readFile(state.projectPath);
        state.parsedProject = await parseA3P(data);
      } catch (err) {
        console.error("Failed to parse .a3p on run:", err);
      }
    }

    let executionLog: LogEntry[] = [];
    let statementsExecuted = 0;

    if (state.parsedProject) {
      const vmResult = executeProject(state.parsedProject);
      executionLog = vmResult.execution_log;
      statementsExecuted = executionLog.length;
    }

    const runResult = {
      schema_version: "eatme.alice-run-world-result/v1",
      status: "completed",
      project_name: state.projectName,
      scene_object_count: state.sceneObjects.size,
      procedure_count: state.procedures.size,
      statements_executed: statementsExecuted,
      execution_log: executionLog,
      run_duration_ms: Date.now() - runStart,
      errors: [],
      doesNotClaim: [
        "visible rendering correctness",
        "desktop run-button proof",
      ],
    };

    const runEvidencePath = await evidenceService.writeRunWorldResult(evidenceDir, runResult);

    return {
      ...runResult,
      evidenceArtifact: runEvidencePath,
    };
  },
};
