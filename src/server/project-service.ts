import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "node:crypto";
import type { AliceProject } from "../a3p-parser.js";
import { TypeScriptExporter } from "../project-export.js";
import type { TypeScriptSourceManifest } from "../code-generation.js";
import { createDefaultCameraWorkflowState } from "../camera-workflow.js";
import {
  exportWebPackage,
  generateShareArtifacts,
  isReservedWebPackagePath,
  validateWebPackage,
  type ExportedWebPackage,
  type ShareArtifacts,
  type ShareArtifactsInput,
  type ValidateWebPackageInput,
  type WebPackageOptions,
  type WebPackageValidation,
} from "../project-export.js";
import {
  exportClassBehaviorPackage,
  importClassBehaviorPackage,
  type AliceClassBehaviorPackage,
  type ClassBehaviorConflictStrategy,
  type ClassBehaviorImportResult,
} from "../project-io/class-behavior-package.js";
import { readProject, writeProject, type AliceProjectArchive } from "../project-io.js";
import { SPECIAL_PROJECT_IO_PATHS } from "../project-io/types.js";
import {
  applyAudioManifest,
  createDefaultProjectAudioState,
  mergeAudioManifest,
  createEmptyProjectAudioState,
  type ProjectAudioWorkflowState,
} from "../project-audio.js";
import { executeProject, type LogEntry } from "../tweedle-vm.js";
import { jointStateSidecarPath, removeJointStateSidecar, writeJointStateSidecar } from "./joint-state-sidecar.js";
import {
  buildCurrentProject,
  resetJointState,
  seedDefaultSceneObjects,
  syncServerMethodDefinitionsFromProject,
  syncServerSceneObjectsFromProject,
  syncServerProceduresFromProject,
  type ServerState,
} from "./state.js";
import type { EvidenceService } from "./evidence-service.js";
import { validateProjectPath } from "./validation.js";

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
    input: { saveSelector?: string; targetPath?: string; allowedProjectDirs?: readonly string[] },
  ): Promise<Record<string, unknown>>;
  runWorld(
    state: ServerState,
    evidenceDir: string,
    evidenceService: EvidenceService,
  ): Promise<Record<string, unknown>>;
  exportWebPackage(state: ServerState, input: WebPackageOptions): Promise<ExportedWebPackage>;
  exportWebPackageFromArchive(archiveBytes: Uint8Array, input: WebPackageOptions): Promise<ExportedWebPackage>;
  validateWebPackage(input: ValidateWebPackageInput): Promise<WebPackageValidation>;
  generateShareArtifacts(input: ShareArtifactsInput): Promise<ShareArtifacts>;
  exportTypeScript(state: ServerState): Promise<TypeScriptExportResult>;
  exportClassBehaviorPackage(state: ServerState, typeName: string): Promise<AliceClassBehaviorPackage>;
  importClassBehaviorPackage(
    state: ServerState,
    packageData: unknown,
    options?: { conflictStrategy?: ClassBehaviorConflictStrategy },
  ): Promise<ClassBehaviorImportResult>;
}

export interface TypeScriptExportResult {
  filename: "alice-web-typescript-source.zip";
  contentType: "application/zip";
  archive: Buffer;
  manifest: TypeScriptSourceManifest;
}

type RequestedProjectLoadResult =
  | { ok: true; archive: AliceProjectArchive; project: AliceProject; projectName: string }
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
    const archive = await readProject(readResult.data);
    const project = archive.project;
    const fileProjectName = path.basename(resolvedProjectFile, ".a3p");
    return {
      ok: true,
      archive,
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

export class ProjectExportError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "ProjectExportError";
  }
}

export class ProjectSaveError extends Error {
  readonly status = 400;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectSaveError";
  }
}

export interface AtomicProjectWriteHooks {
  beforeRename?: () => Promise<void> | void;
}

export async function writeAllowedProjectFile(
  targetPath: string,
  a3pBytes: Uint8Array,
  allowedProjectDirs: readonly string[],
  hooks: AtomicProjectWriteHooks = {},
): Promise<void> {
  const pathValidation = validateProjectPath(targetPath, allowedProjectDirs);
  if (!pathValidation.valid || pathValidation.resolvedPath !== targetPath) {
    throw new ProjectSaveError("project path is outside allowed directories");
  }

  const targetDir = path.dirname(targetPath);
  await fs.promises.mkdir(targetDir, { recursive: true });

  let directoryHandle: fs.promises.FileHandle | null = null;
  let tempPath: string | null = null;
  try {
    directoryHandle = await openValidatedDirectory(targetDir);
    const directoryFdPath = `/proc/self/fd/${directoryHandle.fd}`;
    const targetName = path.basename(targetPath);
    const temp = await createSiblingTempFile(directoryFdPath, targetName);
    tempPath = temp.path;
    await writeAndSyncFile(temp.handle, a3pBytes);
    await hooks.beforeRename?.();
    await fs.promises.rename(tempPath, path.join(directoryFdPath, targetName));
    tempPath = null;
    await syncHandleIfSupported(directoryHandle);
  } catch (error) {
    if (error instanceof ProjectSaveError) {
      throw error;
    }
    throw new ProjectSaveError(`project file could not be written: ${targetPath}`, {
      cause: error instanceof Error ? error : undefined,
    });
  } finally {
    try {
      if (tempPath) {
        await removeFileIfExists(tempPath);
      }
    } finally {
      await directoryHandle?.close();
    }
  }
}

async function createSiblingTempFile(
  directoryPath: string,
  targetName: string,
): Promise<{ path: string; handle: fs.promises.FileHandle }> {
  const flags = fs.constants.O_WRONLY |
    fs.constants.O_CREAT |
    fs.constants.O_EXCL |
    fs.constants.O_NOFOLLOW;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const tempPath = path.join(directoryPath, `.${targetName}.${process.pid}.${randomUUID()}.tmp`);
    try {
      const handle = await fs.promises.open(tempPath, flags, 0o600);
      return { path: tempPath, handle };
    } catch (error) {
      if (getErrorCode(error) === "EEXIST") continue;
      throw error;
    }
  }

  throw new ProjectSaveError(`project file could not be written: ${path.join(directoryPath, targetName)}`);
}

async function openValidatedDirectory(directoryPath: string): Promise<fs.promises.FileHandle> {
  const flags = fs.constants.O_RDONLY |
    fs.constants.O_NOFOLLOW |
    (fs.constants.O_DIRECTORY ?? 0);
  let handle: fs.promises.FileHandle | null = null;
  try {
    handle = await fs.promises.open(directoryPath, flags);
    const openedPath = await fs.promises.realpath(`/proc/self/fd/${handle.fd}`);
    if (openedPath !== directoryPath) {
      throw new ProjectSaveError("project path is outside allowed directories");
    }
    return handle;
  } catch (error) {
    await handle?.close();
    throw error;
  }
}

async function writeAndSyncFile(
  handle: fs.promises.FileHandle,
  bytes: Uint8Array,
): Promise<void> {
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncHandleIfSupported(handle: fs.promises.FileHandle): Promise<void> {
  try {
    await handle.sync();
  } catch (error) {
    if (isUnsupportedDirectorySyncError(error)) return;
    throw error;
  }
}

function isUnsupportedDirectorySyncError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "EINVAL" ||
    code === "ENOTSUP" ||
    code === "EOPNOTSUPP" ||
    code === "EPERM" ||
    code === "EBADF";
}

async function removeFileIfExists(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (getErrorCode(error) !== "ENOENT") {
      throw error;
    }
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
      state.projectArchive = loadResult.archive;
      state.resources = new Map(loadResult.archive.resources);
      syncServerSceneObjectsFromProject(state, loadResult.project);
      syncServerProceduresFromProject(state, loadResult.project);
      syncServerMethodDefinitionsFromProject(state, loadResult.project);
      state.projectAudio = applyAudioManifest(loadResult.archive.manifest);
      state.aliceAudio = loadResult.archive.aliceAudio ?? createDefaultProjectAudioState();
      state.cameraWorkflow = loadResult.project.cameraWorkflow ?? createDefaultCameraWorkflowState();
    } else {
      state.projectArchive = null;
      state.resources = new Map();
      state.sceneObjects.clear();
      syncServerProceduresFromProject(state, null);
      syncServerMethodDefinitionsFromProject(state, null);
      state.projectAudio = createEmptyProjectAudioState();
      state.aliceAudio = createDefaultProjectAudioState();
      state.sceneObjects.clear();
    }

    state.launched = true;
    state.projectPath = resolvedProjectFile;
    state.projectName = projectName;
    state.parsedProject = parsedProject;
    if (!resolvedProjectFile) {
      state.cameraWorkflow = createDefaultCameraWorkflowState();
    }
    resetJointState(state);

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
    const beforeStatementCount = effectiveProcedureStatementCount(state, methodName, statements.length);

    let marker: string;
    if (editSpec.startsWith("append-comment:")) {
      marker = editSpec.slice("append-comment:".length);
    } else if (editSpec.startsWith("append-statement:")) {
      marker = editSpec.slice("append-statement:".length);
    } else {
      marker = editSpec;
    }

    statements.push(marker);
    const afterStatementCount = effectiveProcedureStatementCount(state, methodName, statements.length);

    const methodNames = Array.from(state.procedures.keys());

    const currentProject = buildCurrentProject(state);
    const currentProjectBytes = await writeProject(archiveForCurrentProject(state, currentProject), {
      generateThumbnailFromScene: false,
    });
    await evidenceService.writeEditedProjectArtifact(
      null,
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
      allowedProjectDirs = [],
    } = input;

    const saveDir = path.join(evidenceDir, "project-save");
    await fs.promises.mkdir(saveDir, { recursive: true });

    const savedProjectFilename = "saved-project.a3p";
    const savedProjectPath = path.join(saveDir, savedProjectFilename);

    const currentProject = buildCurrentProject(state);
    const archive = archiveForCurrentProject(state, currentProject);
    if (hasProjectAudioWorkflowState(state.aliceAudio)) {
      archive.aliceAudio = state.aliceAudio;
    } else {
      archive.manifest = mergeAudioManifest(archive.manifest, state.projectAudio);
      delete archive.aliceAudio;
    }
    const a3pBytes = await writeProject(archive, { generateThumbnailFromScene: false });
    await fs.promises.writeFile(savedProjectPath, a3pBytes);
    if (targetPath !== undefined) {
      await writeAllowedProjectFile(targetPath, a3pBytes, allowedProjectDirs);
    }

    const saveArtifactFilename = "desktop-save-operation-result.json";
    const evidenceArtifact = evidenceService.recordSaveProof(
      saveDir,
      targetPath ?? savedProjectPath,
      a3pBytes.length,
    );
    if (state.jointState.listObjectNames().length > 0) {
      await writeJointStateSidecar(saveDir, state.jointState);
    } else {
      await removeJointStateSidecar(saveDir);
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
        const archive = await readProject(data);
        state.projectArchive = archive;
        state.resources = new Map(archive.resources);
        state.parsedProject = archive.project;
        state.projectAudio = applyAudioManifest(archive.manifest);
        state.aliceAudio = archive.aliceAudio ?? createDefaultProjectAudioState();
      } catch (err) {
        throw new ProjectRunError("Failed to parse .a3p before running the world.", {
          cause: err instanceof Error ? err : undefined,
        });
      }
    }

    let executionLog: LogEntry[] = [];
    let statementsExecuted = 0;

    const currentProject = buildCurrentProject(state);
    const vmResult = executeProject(currentProject);
    executionLog = vmResult.execution_log;
    statementsExecuted = executionLog.length;

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

  async exportWebPackage(state, input) {
    return exportWebPackage(buildCurrentProject(state), {
      ...input,
      resources: [
        ...(input.resources ?? []),
        ...Array.from(state.resources, ([path, bytes]) => ({ path, bytes }))
          .filter((resource) =>
            !SPECIAL_PROJECT_IO_PATHS.has(resource.path)
            && !isReservedWebPackagePath(resource.path)
          ),
      ],
    });
  },

  async exportWebPackageFromArchive(archiveBytes, input) {
    const archive = await readProject(archiveBytes);
    return exportWebPackage(archive.project, {
      ...input,
      resources: Array.from(archive.resources, ([path, bytes]) => ({ path, bytes }))
        .filter((resource) =>
          !SPECIAL_PROJECT_IO_PATHS.has(resource.path)
          && !isReservedWebPackagePath(resource.path)
        ),
    });
  },

  async validateWebPackage(input) {
    return validateWebPackage(input);
  },

  async generateShareArtifacts(input) {
    return generateShareArtifacts(input);
  },

  async exportTypeScript(state) {
    if (!state.launched) {
      throw new ProjectExportError("Not launched. Call POST /api/launch first before exporting the current project.");
    }

    const currentProject = buildCurrentProject(state);
    const exported = await new TypeScriptExporter().export(currentProject);
    return {
      filename: "alice-web-typescript-source.zip",
      contentType: "application/zip",
      archive: Buffer.from(exported.archive),
      manifest: exported.manifest,
    };
  },

  async exportClassBehaviorPackage(state, typeName) {
    return exportClassBehaviorPackage(buildCurrentProject(state), typeName);
  },

  async importClassBehaviorPackage(state, packageData, options) {
    const project = buildCurrentProject(state);
    const result = importClassBehaviorPackage(project, packageData, options);
    state.parsedProject = project;
    syncServerProceduresFromProject(state, project);
    syncServerMethodDefinitionsFromProject(state, project);
    if (state.projectArchive) {
      state.projectArchive = {
        ...state.projectArchive,
        project,
      };
    }
    return result;
  },
};

function effectiveProcedureStatementCount(
  state: ServerState,
  methodName: string,
  liveEditStatementCount: number,
): number {
  return parsedProcedureStatementCount(state.parsedProject, methodName) + liveEditStatementCount;
}

function parsedProcedureStatementCount(project: AliceProject | null, methodName: string): number {
  if (!project) {
    return 0;
  }

  const sceneType = project.types?.find((type) => type.superTypeName?.includes("SScene"));
  const method = (sceneType?.methods ?? project.methods).find((candidate) => candidate.name === methodName);
  return method?.statements?.length ?? 0;
}

function archiveForCurrentProject(state: ServerState, project: AliceProject): AliceProjectArchive {
  if (state.projectArchive) {
    return {
      ...state.projectArchive,
      project,
      resources: state.resources,
    };
  }

  return {
    project,
    manifest: null,
    resources: state.resources,
    resourceEntries: [],
    thumbnail: null,
    versionInfo: {
      originalAliceVersion: project.version,
      detectedAliceVersion: project.version,
      manifestVersion: null,
      xmlVersion: null,
      versionSource: "default",
      migrated: false,
      migrationSteps: [],
    },
  };
}

function hasProjectAudioWorkflowState(state: ProjectAudioWorkflowState): boolean {
  return (
    state.resources.length > 0 ||
    state.cues.length > 0 ||
    state.activeCueIds.length > 0 ||
    state.background.resourceId !== null ||
    state.background.enabled
  );
}
