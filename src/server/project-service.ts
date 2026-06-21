import * as fs from "fs";
import * as path from "path";
import { parseA3P, type AliceProject } from "../a3p-parser.js";
import { writeA3P } from "../a3p-writer/archive.js";
import { createDefaultCameraWorkflowState } from "../camera-workflow.js";
import { executeProject, type LogEntry } from "../tweedle-vm.js";
import { jointStateSidecarPath, writeJointStateSidecar } from "./joint-state-sidecar.js";
import { buildCurrentProject, seedDefaultSceneObjects, type ServerState } from "./state.js";
import type { EvidenceService } from "./evidence-service.js";

export type LaunchProjectResult =
  | { ok: true }
  | { ok: false; error: string };

export interface ProjectService {
  launchProject(state: ServerState, resolvedProjectFile: string | null): Promise<LaunchProjectResult>;
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

type RequestedProjectLoadResult =
  | { ok: true; project: AliceProject; projectName: string }
  | { ok: false; error: string };

function getErrorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return null;
}

async function readRequestedProjectFile(
  resolvedProjectFile: string,
): Promise<{ ok: true; data: Buffer } | { ok: false; error: string }> {
  let handle: fs.promises.FileHandle | null = null;
  try {
    handle = await fs.promises.open(
      resolvedProjectFile,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    const openedPath = await fs.promises.realpath(`/proc/self/fd/${handle.fd}`);
    if (openedPath !== resolvedProjectFile) {
      return { ok: false, error: `project file could not be read: ${resolvedProjectFile}` };
    }
    return { ok: true, data: await handle.readFile() };
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return { ok: false, error: `project file not found: ${resolvedProjectFile}` };
    }
    return { ok: false, error: `project file could not be read: ${resolvedProjectFile}` };
  } finally {
    await handle?.close();
  }
}

async function loadRequestedProject(
  resolvedProjectFile: string,
): Promise<RequestedProjectLoadResult> {
  const readResult = await readRequestedProjectFile(resolvedProjectFile);
  if (!readResult.ok) return readResult;

  try {
    const project = await parseA3P(readResult.data);
    const fileProjectName = path.basename(resolvedProjectFile, ".a3p");
    return {
      ok: true,
      project,
      projectName: userFacingProjectName(project.projectName, fileProjectName),
    };
  } catch {
    return { ok: false, error: `project file is corrupt or unsupported: ${resolvedProjectFile}` };
  }
}

function userFacingProjectName(parsedProjectName: string | null | undefined, fileProjectName: string): string {
  const normalized = parsedProjectName?.trim();
  if (!normalized || normalized === "Program" || normalized === "Unknown") {
    return fileProjectName;
  }
  return normalized;
}

export class ProjectRunError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectRunError";
  }
}

function isMissingProjectFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export const projectService: ProjectService = {
  async launchProject(state, resolvedProjectFile) {
    let parsedProject: AliceProject | null = null;
    let projectName = "Program";

    if (resolvedProjectFile) {
      const loadResult = await loadRequestedProject(resolvedProjectFile);
      if (!loadResult.ok) return loadResult;
      parsedProject = loadResult.project;
      projectName = loadResult.projectName;
    }

    state.launched = true;
    state.projectPath = resolvedProjectFile;
    state.projectName = projectName;
    state.parsedProject = parsedProject;
    state.cameraWorkflow = createDefaultCameraWorkflowState();

    seedDefaultSceneObjects(state);
    state.eventSystem.reset();
    return { ok: true };
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

    let sourceProjectPath = state.projectPath;
    if (sourceProjectPath) {
      try {
        await fs.promises.access(sourceProjectPath, fs.constants.R_OK);
      } catch (error) {
        if (!isMissingProjectFileError(error)) throw error;
        sourceProjectPath = null;
      }
    }
    const currentProjectBytes = sourceProjectPath
      ? null
      : await writeA3P(buildCurrentProject(state));
    await evidenceService.writeEditedProjectArtifact(
      sourceProjectPath,
      evidenceDir,
      currentProjectBytes,
    );

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
    if (state.jointState.listObjectNames().length > 0) {
      await writeJointStateSidecar(saveDir, state.jointState);
    }

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
        throw new ProjectRunError("Failed to parse .a3p before running the world.", {
          cause: err instanceof Error ? err : undefined,
        });
      }
    }

    let executionLog: LogEntry[] = [];
    let statementsExecuted = 0;

    if (state.parsedProject) {
      const vmResult = executeProject(state.parsedProject);
      executionLog = vmResult.execution_log;
      statementsExecuted = executionLog.length;
    }

    const jointSidecarArtifact = jointStateSidecarPath(evidenceDir);
    const jointRuntime = state.jointState.executePendingAnimations(jointSidecarArtifact);
    if (state.jointState.listObjectNames().length > 0) {
      await writeJointStateSidecar(evidenceDir, state.jointState);
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
      ...(jointRuntime.animations.length > 0
        ? {
            runtime: "alice-web",
            jointAnimations: jointRuntime.animations,
            jointVerification: jointRuntime.verification,
          }
        : {}),
    };

    const runEvidencePath = await evidenceService.writeRunWorldResult(evidenceDir, runResult);

    return {
      ...runResult,
      evidenceArtifact: runEvidencePath,
    };
  },
};
